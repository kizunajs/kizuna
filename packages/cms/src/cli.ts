import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pluginExportsOf } from 'kizunajs/adapter';
import type { CmsExports } from './plugin.js';
import { CmsHttpError, type CmsService } from './cms.js';
import type { EnvironmentOptions } from './options.js';
import { defaultPagesOutput, discoverPages, findAppDir, renderPagesModule } from './discovery.js';
import { mediaIdsOf } from './media/resolve.js';
import { refsOf } from './content.js';
import type { MediaRecord } from './media/media.js';
import { formatRef, type DocumentRef } from './refs.js';
import { servesCollection } from './page.js';

/**
 * What the kizuna CLI hands a plugin's commands.
 */
export interface PluginCliContext {
    cwd: string;
    configPath: string;
    /**
     * Loads the config and returns its api, or `undefined` when there is none.
     */
    loadApi: () => Promise<unknown>;
    stdout: (line: string) => void;
    stderr: (line: string) => void;
}

const USAGE = `Usage: kizuna cms <command> [options]

Commands:
  migrate    Write the CMS tables and collection indexes as a migration.
  migrate-content
             Store every document at its latest migration step, so reads stop migrating it.
  check      List published content that fails its schema. Exits 1 when there is some.
  pages      List every page's path and name.
  orphans    List stored page content no page claims, after a rename. Exits 1 when there is some.
  rename-page <from> <to>
             Move a renamed page's stored content and history to its new name.
  push       Copy one page into another environment as a draft, with its media.
  pull       Copy every published page, global and item, with media, into local.

Options:
  --json             Print machine-readable output.
  --out <dir>        migrate: the migrations folder. Default: ./drizzle
  --app <dir>        pages: the app directory. Default: src/app or app
  --write            pages: also write the pages module the config imports.
  --out <file>       pages --write: where. Default: cms.pages.ts beside the app directory
  --site <name>      push, rename-page: the site the page belongs to, when several apps share the CMS.
  --to <env>         push: the target environment. pull: the destination. Default: local
  --from <env>       push: the source environment. Default: local. pull: the source, required.
`;

class CliError extends Error {}

type Flags = Record<string, string | boolean>;

const parse = (argv: readonly string[]): { command: string | undefined; positional: string[]; flags: Flags } => {
    const flags: Flags = {};
    const positional: string[] = [];
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index]!;
        if (!argument.startsWith('--')) {
            positional.push(argument);
            continue;
        }
        const name = argument.slice(2);
        const next = argv[index + 1];
        if (next === undefined || next.startsWith('--') || name === 'json' || name === 'write') {
            flags[name] = true;
            continue;
        }
        flags[name] = next;
        index += 1;
    }
    return {
        command: positional.shift(),
        positional,
        flags,
    };
};

const serviceOf = async (context: PluginCliContext): Promise<CmsService> => {
    const api = await context.loadApi();
    if (api === undefined) throw new CliError(`No config found at ${context.configPath}.`);
    const exported = Object.values(pluginExportsOf(api)).find(
        (candidate): candidate is CmsExports => typeof candidate === 'object' && candidate !== null && 'service' in candidate
    );
    if (exported === undefined) throw new CliError('The config has no `content: cms(...)`.');
    return exported.service;
};

const environmentOf = (service: CmsService, name: string): EnvironmentOptions => {
    const environment = service.options.environments?.[name];
    if (environment === undefined) {
        const known = Object.keys(service.options.environments ?? {});
        throw new CliError(
            `No environment named '${name}'. ${known.length === 0 ? 'Name environments under `environments` on cms().' : `Known: ${known.join(', ')}.`}`
        );
    }
    return environment;
};

interface Answer {
    status: number;
    body: any;
}

interface Remote {
    call: (method: string, path: string, body?: unknown) => Promise<Answer>;
    bytes: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
}

const remote = (environment: EnvironmentOptions, basePath: string): Remote => ({
    bytes: async (path) => {
        const response = await fetch(`${environment.url.replace(/\/$/, '')}${basePath}${path}`, {
            headers: environment.headers,
        });
        if (!response.ok) throw new CliError(`Reading ${path} answered ${response.status}.`);
        return new Uint8Array(await response.arrayBuffer());
    },
    call: async (method, path, body) => {
        const response = await fetch(`${environment.url.replace(/\/$/, '')}${basePath}${path}`, {
            method,
            headers: {
                ...(body === undefined ? {} : { 'content-type': 'application/json' }),
                ...environment.headers,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await response.text();
        let parsed: unknown;
        try {
            parsed = text === '' ? undefined : JSON.parse(text);
        } catch {
            parsed = text;
        }
        return {
            status: response.status,
            body: parsed,
        };
    },
});

const expectStatus = (answer: Answer, expected: number, what: string): void => {
    if (answer.status === expected) return;
    const detail = typeof answer.body === 'object' && answer.body !== null && 'detail' in answer.body ? String(answer.body.detail) : '';
    throw new CliError(`${what} answered ${answer.status}. ${detail}`.trim());
};

/**
 * Copies every media item a document refers to that the target lacks, and
 * returns the ids copied. Ids are content hashes, so the target names each
 * file the same.
 */
const copyMedia = async (ids: readonly string[], source: Remote, target: Remote): Promise<string[]> => {
    const copied: string[] = [];
    for (const id of ids) {
        const existing = await target.call('GET', `/media/${encodeURIComponent(id)}`);
        if (existing.status === 200) continue;
        const record = await source.call('GET', `/media/${encodeURIComponent(id)}`);
        expectStatus(record, 200, `Reading media ${id} from the source`);
        const media = record.body as MediaRecord;
        const bytes = await source.bytes(`/media/${encodeURIComponent(id)}/file`);
        const created = await target.call('POST', '/media/uploads', {
            filename: media.filename,
            contentType: media.contentType,
            size: bytes.byteLength,
        });
        expectStatus(created, 201, `Starting the upload of ${id} on the target`);
        const put = await fetch(created.body.url, {
            method: 'PUT',
            headers: created.body.headers,
            body: bytes,
        });
        if (!put.ok) throw new CliError(`Uploading ${id} to the target storage answered ${put.status}.`);
        const completed = await target.call('POST', `/media/uploads/${encodeURIComponent(created.body.uploadId)}`);
        expectStatus(completed, 201, `Finishing the upload of ${id} on the target`);
        if (completed.body.id !== id) {
            throw new CliError(`The target stored ${id} as ${completed.body.id}; the bytes differ between environments.`);
        }
        if (media.alt !== '' || media.focalPoint !== undefined) {
            await target.call('PATCH', `/media/${encodeURIComponent(id)}`, {
                alt: media.alt,
                focalPoint: media.focalPoint,
            });
        }
        copied.push(id);
    }
    return copied;
};

interface MissingId {
    relationship: string;
    id: string;
    fieldPath: string;
}

/**
 * The ids a document holds through a relationship that the target cannot
 * name, asked through the target's own search, so the check runs against
 * the target's own data.
 */
const missingRelationshipIds = async (service: CmsService, refs: ReturnType<typeof refsOf>, target: Remote): Promise<MissingId[]> => {
    const missing: MissingId[] = [];
    const byBrand = new Map<string, typeof refs>();
    for (const ref of refs) byBrand.set(ref.brand, [...(byBrand.get(ref.brand) ?? []), ref]);
    for (const [brand, held] of byBrand) {
        const relationship = service.relationshipFor(brand);
        if (relationship === undefined) continue;
        const query = new URLSearchParams();
        for (const id of new Set(held.map((ref) => ref.refId))) query.append('ids', id);
        const answer = await target.call('GET', `/items/${encodeURIComponent(brand)}?${query.toString()}`);
        expectStatus(answer, 200, `Naming the ${relationship.name} the target holds`);
        const found = new Set((answer.body.items as Array<{ id: string }>).map((item) => item.id));
        for (const ref of held) {
            if (!found.has(ref.refId)) {
                missing.push({
                    relationship: relationship.name,
                    id: ref.refId,
                    fieldPath: ref.fieldPath,
                });
            }
        }
    }
    return missing;
};

const runMigrate = async (context: PluginCliContext, flags: Flags): Promise<Record<string, unknown>> => {
    const service = await serviceOf(context);
    const out = resolve(context.cwd, typeof flags['out'] === 'string' ? flags['out'] : 'drizzle');
    mkdirSync(out, {
        recursive: true,
    });
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const file = join(out, `${stamp}_kizuna_cms.sql`);
    if (existsSync(file)) throw new CliError(`${file} already exists.`);
    writeFileSync(file, service.migrationSql());
    return {
        file,
        tables: ['cms_documents', 'cms_versions', 'cms_refs'],
        indexes: service.indexedFields().map((index) => `${index.keyPrefix}${index.field}`),
    };
};

const runPages = (context: PluginCliContext, flags: Flags): Array<{ name: string; path: string; file: string }> => {
    const appDir = typeof flags['app'] === 'string' ? resolve(context.cwd, flags['app']) : findAppDir(context.cwd);
    if (appDir === undefined) throw new CliError('No app directory found. Pass --app.');
    const pages = discoverPages(appDir);
    if (flags['write'] === true) {
        const output = typeof flags['out'] === 'string' ? resolve(context.cwd, flags['out']) : defaultPagesOutput(appDir);
        writeFileSync(output, renderPagesModule(pages, output));
    }
    return pages;
};

/**
 * Rewrites the pages module from the \`content.ts\` files before the kizuna
 * CLI loads the config that imports it, so a page that moved or went away
 * never leaves the config importing a file that is gone. It rewrites the
 * module where the plugin writes it by default, and only when it exists;
 * \`kizuna cms pages --write --app <dir> --out <file>\` does the same for
 * other places.
 */
export const prepare = async (context: {
    cwd: string;
    configPath: string;
    check: boolean;
}): Promise<Array<{ output: string; changed: boolean }>> => {
    const appDir = findAppDir(dirname(context.configPath));
    if (appDir === undefined) return [];
    const output = defaultPagesOutput(appDir);
    if (!existsSync(output)) return [];
    const rendered = renderPagesModule(discoverPages(appDir), output);
    const changed = readFileSync(output, 'utf8') !== rendered;
    if (changed && !context.check) writeFileSync(output, rendered);
    return [
        {
            output,
            changed,
        },
    ];
};

const runPush = async (context: PluginCliContext, positional: string[], flags: Flags): Promise<Record<string, unknown>> => {
    const name = positional[0];
    if (name === undefined) throw new CliError('Name the page to push: kizuna cms push <page> --to <env>.');
    if (typeof flags['to'] !== 'string') throw new CliError('Pass --to <env>.');
    const from = typeof flags['from'] === 'string' ? flags['from'] : 'local';
    const service = await serviceOf(context);
    const site = typeof flags['site'] === 'string' ? flags['site'] : 'default';
    const pages = service.sites[site];
    if (pages === undefined) throw new CliError(`No site named '${site}'. Known: ${Object.keys(service.sites).join(', ')}.`);
    const entry = pages[name];
    if (entry === undefined) throw new CliError(`No page named '${name}'. Known: ${Object.keys(pages).join(', ')}.`);
    if (servesCollection(entry.page)) {
        throw new CliError(
            `${name} shows the items of the ${entry.page.collection.name} collection, which pull copies. push copies one page.`
        );
    }
    const route =
        site === 'default' ? `/pages/${encodeURIComponent(name)}` : `/sites/${encodeURIComponent(site)}/pages/${encodeURIComponent(name)}`;
    const label = site === 'default' ? name : `${site}:${name}`;
    const source = remote(environmentOf(service, from), `${service.basePath}/editing`);
    const target = remote(environmentOf(service, flags['to']), `${service.basePath}/editing`);

    const draft = await source.call('GET', `${route}/draft`);
    expectStatus(draft, 200, `Reading the draft of '${label}' from the source`);
    const content = draft.body.content as Record<string, unknown> | null;
    if (content === null) throw new CliError(`The source has no draft of '${label}'.`);

    const media = await copyMedia(mediaIdsOf(entry.page, content), source, target);
    const missing = await missingRelationshipIds(service, refsOf(entry.page, content), target);

    const written = await target.call('PATCH', `${route}/draft`, {
        changes: content,
        summary: `Pushed from ${from}`,
    });
    expectStatus(written, 200, `Writing the draft of '${label}' on the target`);
    return {
        page: label,
        to: flags['to'],
        version: written.body.version,
        complete: written.body.complete,
        mediaCopied: media,
        missingIds: missing,
    };
};

const runPull = async (context: PluginCliContext, flags: Flags): Promise<Record<string, unknown>> => {
    if (typeof flags['from'] !== 'string') throw new CliError('Pass --from <env>.');
    const service = await serviceOf(context);
    const destinationName = typeof flags['to'] === 'string' ? flags['to'] : 'local';
    const destination = environmentOf(service, destinationName);
    if (destination.production === true) {
        throw new CliError(`'${destinationName}' is marked production. pull only writes into a local or staging environment.`);
    }
    const source = remote(environmentOf(service, flags['from']), `${service.basePath}/editing`);
    const target = remote(destination, `${service.basePath}/editing`);
    const pulled: Array<{ document: string; version: number; mediaCopied: string[] }> = [];
    const skipped: string[] = [];
    const copy = async (ref: DocumentRef, route: string): Promise<void> => {
        const label = formatRef(ref);
        const published = await source.call('GET', `${route}/published`);
        if (published.status === 404) {
            skipped.push(label);
            return;
        }
        expectStatus(published, 200, `Reading '${label}' from the source`);
        const content = published.body.content as Record<string, unknown>;
        const media = await copyMedia(mediaIdsOf(service.target(ref).definition, content), source, target);
        const written = await target.call('PATCH', `${route}/draft`, {
            changes: content,
            summary: `Pulled from ${flags['from']}`,
        });
        expectStatus(written, 200, `Writing '${label}' on the destination`);
        const release = await target.call('POST', `${route}/publish`, {});
        expectStatus(release, 200, `Publishing '${label}' on the destination`);
        pulled.push({
            document: label,
            version: written.body.version,
            mediaCopied: media,
        });
    };
    // Items keep their ids, so references to them still resolve on the destination.
    const itemsOf = async (route: string): Promise<string[]> => {
        const listed = await source.call('GET', `${route}/items`);
        expectStatus(listed, 200, `Listing ${route} on the source`);
        return (listed.body.items as Array<{ id: string; status: string }>)
            .filter((item) => item.status === 'published' || item.status === 'changed')
            .map((item) => item.id);
    };
    for (const [site, pages] of Object.entries(service.sites)) {
        for (const [name, entry] of Object.entries(pages)) {
            if (servesCollection(entry.page)) continue;
            await copy(
                {
                    type: 'page',
                    name,
                    ...(site === 'default'
                        ? {}
                        : {
                              site,
                          }),
                },
                site === 'default'
                    ? `/pages/${encodeURIComponent(name)}`
                    : `/sites/${encodeURIComponent(site)}/pages/${encodeURIComponent(name)}`
            );
        }
    }
    for (const name of Object.keys(service.globals)) {
        await copy(
            {
                type: 'global',
                name,
            },
            `/globals/${encodeURIComponent(name)}`
        );
    }
    for (const name of Object.keys(service.collections)) {
        const route = `/collections/${encodeURIComponent(name)}`;
        for (const id of await itemsOf(route)) {
            await copy(
                {
                    type: 'item',
                    collection: name,
                    id,
                },
                `${route}/items/${encodeURIComponent(id)}`
            );
        }
    }
    return {
        from: flags['from'],
        to: destinationName,
        pulled,
        skipped,
    };
};

/**
 * `kizuna cms …`, as the kizuna CLI delegates it. Returns the exit code.
 */
export const run = async (argv: readonly string[], context: PluginCliContext): Promise<number> => {
    const { command, positional, flags } = parse(argv);
    const json = flags['json'] === true;
    try {
        switch (command) {
            case 'migrate': {
                const result = await runMigrate(context, flags);
                context.stdout(json ? JSON.stringify(result, null, 2) : `Wrote ${result['file']}`);
                return 0;
            }
            case 'migrate-content': {
                const service = await serviceOf(context);
                const migrated = await service.migrateStoredContent();
                context.stdout(
                    json
                        ? JSON.stringify(
                              {
                                  migrated,
                              },
                              null,
                              2
                          )
                        : migrated === 0
                          ? 'Every document is at its latest migration step.'
                          : `Migrated ${migrated} ${migrated === 1 ? 'document' : 'documents'}.`
                );
                return 0;
            }
            case 'check': {
                const service = await serviceOf(context);
                const problems = await service.contentProblems();
                context.stdout(
                    json
                        ? JSON.stringify(problems, null, 2)
                        : problems.length === 0
                          ? 'All published content passes its schema.'
                          : [
                                'Published content that fails its schema:',
                                ...problems.flatMap((problem) => [
                                    `  ${problem.ref}${problem.serving === undefined ? ', reads as unpublished' : `, visitors see version ${problem.serving}`}`,
                                    ...problem.issues.map((issue) => `    ${issue}`),
                                ]),
                                'Add a migrate step or a default for each field, or fix the content and publish it again.',
                            ].join('\n')
                );
                return problems.length === 0 ? 0 : 1;
            }
            case 'orphans': {
                const service = await serviceOf(context);
                const orphans = await service.orphanedPages();
                context.stdout(
                    json
                        ? JSON.stringify(orphans, null, 2)
                        : orphans.length === 0
                          ? 'Every stored page has a page.'
                          : [
                                'Stored content no page claims:',
                                ...orphans.map((orphan) => `  ${orphan.site === 'default' ? '' : `${orphan.site}:`}${orphan.name}`),
                                'Move it with kizuna cms rename-page <from> <to>.',
                            ].join('\n')
                );
                return orphans.length === 0 ? 0 : 1;
            }
            case 'rename-page': {
                const [from, to] = positional;
                if (from === undefined || to === undefined) throw new CliError('Name both pages: kizuna cms rename-page <from> <to>.');
                const service = await serviceOf(context);
                const site = typeof flags['site'] === 'string' ? flags['site'] : 'default';
                try {
                    await service.renamePage(from, to, site);
                } catch (error) {
                    if (error instanceof CmsHttpError) throw new CliError(error.message);
                    throw error;
                }
                context.stdout(
                    json
                        ? JSON.stringify(
                              {
                                  from,
                                  to,
                                  site,
                              },
                              null,
                              2
                          )
                        : `Moved the content of ${from} to ${to}.`
                );
                return 0;
            }
            case 'pages': {
                const pages = runPages(context, flags);
                context.stdout(
                    json ? JSON.stringify(pages, null, 2) : pages.map((entry) => `${entry.path.padEnd(32)} ${entry.name}`).join('\n')
                );
                return 0;
            }
            case 'push': {
                const result = await runPush(context, positional, flags);
                const missing = result['missingIds'] as MissingId[];
                context.stdout(
                    json
                        ? JSON.stringify(result, null, 2)
                        : [
                              `Pushed ${result['page']} to ${result['to']} as draft version ${result['version']}.`,
                              ...(missing.length === 0
                                  ? []
                                  : [
                                        'Missing on the target:',
                                        ...missing.map((entry) => `  ${entry.relationship} ${entry.id} at ${entry.fieldPath}`),
                                    ]),
                          ].join('\n')
                );
                return missing.length === 0 ? 0 : 2;
            }
            case 'pull': {
                const result = await runPull(context, flags);
                context.stdout(
                    json
                        ? JSON.stringify(result, null, 2)
                        : `Pulled ${(result['pulled'] as unknown[]).length} documents from ${result['from']} into ${result['to']}.`
                );
                return 0;
            }
            default:
                context.stdout(USAGE);
                return command === undefined ? 0 : 1;
        }
    } catch (error) {
        if (error instanceof CliError) {
            context.stderr(json ? JSON.stringify({ error: error.message }) : error.message);
            return 1;
        }
        throw error;
    }
};
