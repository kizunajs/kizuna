import { z } from 'zod';
import type { PluginApi } from 'kizunajs/plugin';
import { flattenRoutes } from 'kizunajs/adapter';
import { HANDLER } from './handler-key.js';
import { readDef, readMetaBrand, toToolName, unwrapOptionalWrappers } from 'kizunajs/generator';
import type { RouteDefinition, Roles } from 'kizunajs';
import {
    describeFields,
    getAtPath,
    latestMigration,
    migrateContent,
    missingFields,
    pendingMigrations,
    refsOf,
    setAtPath,
    type DescribedField,
} from './content.js';
import { fieldChain } from './content.js';
import type { Page } from './page.js';
import type { PageEntry, PageMap, ResolvedCmsOptions } from './options.js';
import { MediaService, type MediaRecord } from './media/media.js';
import { memoryMediaStorage, type MediaStorage } from './media/storage.js';
import { s3MediaStorage } from './media/s3.js';
import { mediaIdsOf, resolveContent } from './media/resolve.js';
import { pathRefusal, type Caller } from './rules.js';
import { DocumentStore, VersionConflictError, type DocumentRow } from './storage/store.js';
import { previewSecret, signPreviewToken } from './preview-token.js';
import type { PageStatusSchema } from './wire.js';

export type PageStatus = z.output<typeof PageStatusSchema>;

/**
 * An answer a route sends instead of what it was asked for.
 */
export class CmsHttpError extends Error {
    constructor(
        readonly status: number,
        readonly body: Record<string, unknown>
    ) {
        super(typeof body['detail'] === 'string' ? body['detail'] : `HTTP ${status}`);
    }
}

const MIGRATION_AUTHOR = 'kizuna-cms';

/**
 * The cache tag a page's renders carry, and publishing drops.
 */
export const pageCacheTag = (name: string): string => `kizuna-cms:page:${name}`;

const etagOf = (version: number): string => `"${version}"`;

const parseIfMatch = (header: string | string[] | undefined): number | undefined => {
    const value = Array.isArray(header) ? header[0] : header;
    if (value === undefined || value.trim() === '' || value.trim() === '*') return undefined;
    const match = /^(?:W\/)?"?(\d+)"?$/.exec(value.trim());
    if (match === null) throw new CmsHttpError(400, { detail: `The If-Match header '${value}' is not an ETag this draft sends.` });
    return Number(match[1]);
};

const pickAuthor = (context: Record<string, unknown>): string => {
    for (const key of ['userId', 'id', 'email', 'name', 'sub']) {
        const value = context[key];
        if (typeof value === 'string' && value !== '') return value;
    }
    return JSON.stringify(context);
};

/**
 * The brand the ids of a field carry, through `.optional()` and arrays.
 */
export const brandOf = (schema: z.core.$ZodType): string | undefined => {
    const inner = unwrapOptionalWrappers(schema).inner;
    const direct = readMetaBrand(schema) ?? readMetaBrand(inner);
    if (direct !== undefined) return direct;
    const def = readDef(inner);
    return def.type === 'array' && def.element !== undefined ? brandOf(def.element) : undefined;
};

export interface DraftState {
    entry: PageEntry;
    row: DocumentRow | undefined;
    version: number;
    status: PageStatus;
    complete: boolean;
    missing: string[];
    etag: string;
}

/**
 * Storage for a production app with no bucket: it builds and serves pages, and
 * refuses the first upload.
 */
const unconfiguredMediaStorage = (): MediaStorage => {
    const refuse = (): never => {
        throw new Error('Media needs a bucket: set CMS_S3_BUCKET, or pass `media.bucket` or `media.storage` to cmsPlugin.');
    };
    return {
        presignUpload: async () => refuse(),
        head: async () => refuse(),
        get: async () => refuse(),
        put: async () => refuse(),
        delete: async () => refuse(),
    };
};

const mediaStorageFrom = (options: ResolvedCmsOptions['media']): MediaStorage => {
    if (options?.storage !== undefined) return options.storage;
    const env = process.env;
    const bucket = options?.bucket ?? env['CMS_S3_BUCKET'];
    if (bucket === undefined) {
        return env['NODE_ENV'] === 'production' ? unconfiguredMediaStorage() : memoryMediaStorage();
    }
    const forcePathStyle =
        options?.forcePathStyle ?? (env['CMS_S3_FORCE_PATH_STYLE'] === undefined ? undefined : env['CMS_S3_FORCE_PATH_STYLE'] === 'true');
    return s3MediaStorage({
        bucket,
        region: options?.region ?? env['CMS_S3_REGION'],
        endpoint: options?.endpoint ?? env['CMS_S3_ENDPOINT'],
        accessKeyId: options?.accessKeyId ?? env['CMS_S3_ACCESS_KEY_ID'],
        secretAccessKey: options?.secretAccessKey ?? env['CMS_S3_SECRET_ACCESS_KEY'],
        forcePathStyle,
    });
};

/**
 * Everything the routes, the reader, the tools and the CLI do, in one place,
 * so a rule holds wherever a change comes from.
 */
export class CmsService {
    readonly store: DocumentStore;
    readonly media: MediaService;
    readonly pages: PageMap;
    readonly identity: string;
    readonly roles: readonly string[] | undefined;
    readonly basePath: `/${string}`;
    readonly mediaPath: string;
    private warned = new Set<string>();

    constructor(
        readonly options: ResolvedCmsOptions,
        private readonly api: PluginApi
    ) {
        this.store = new DocumentStore(options.db);
        this.pages = options.pages;
        this.identity = options.auth.identity;
        this.roles =
            options.auth.roles === undefined
                ? undefined
                : typeof options.auth.roles === 'string'
                  ? [options.auth.roles]
                  : options.auth.roles;
        this.basePath = options.basePath ?? '/cms';
        this.mediaPath = (options.media?.publicPath ?? `/api${this.basePath}/media`).replace(/\/$/, '');
        this.media = new MediaService({
            store: this.store,
            storage: mediaStorageFrom(options.media),
            maxBytes: options.media?.maxBytes ?? 10 * 1024 * 1024,
        });
    }

    entry(name: string): PageEntry {
        const entry = this.pages[name];
        if (entry === undefined) {
            throw new CmsHttpError(404, {
                detail: `There is no page named '${name}'.`,
            });
        }
        return entry;
    }

    entryAt(path: string): PageEntry | undefined {
        return Object.values(this.pages).find((entry) => entry.path === path);
    }

    author(context: Record<string, unknown> | undefined): string {
        if (context === undefined) return 'anonymous';
        return this.options.auth.author?.(context) ?? pickAuthor(context);
    }

    caller(auth: Record<string, unknown> | undefined): Caller {
        const context = (auth?.[this.identity] ?? {}) as { role?: string | readonly string[]; permissions?: readonly string[] };
        return {
            role: context.role,
            permissions: context.permissions,
        };
    }

    statusOf(row: DocumentRow | undefined, version: number): PageStatus {
        if (row === undefined || (row.draft === null && row.published === null)) return 'empty';
        if (row.published === null) return 'draft';
        return row.publishedVersion === version ? 'published' : 'changed';
    }

    /**
     * The stored document, brought up to the page's latest migration step.
     */
    async document(name: string): Promise<{ entry: PageEntry; row: DocumentRow | undefined }> {
        const entry = this.entry(name);
        let row = await this.store.get('page', entry.path);
        if (row !== undefined && pendingMigrations(entry.page, row.migrationVersion).length > 0) {
            const published = row.published === null ? null : migrateContent(entry.page, row.published, row.migrationVersion);
            const draft = row.draft === null ? null : migrateContent(entry.page, row.draft, row.migrationVersion);
            row = await this.store.saveMigrated({
                id: row.id,
                published,
                draft,
                migrationVersion: latestMigration(entry.page),
                author: MIGRATION_AUTHOR,
                refs: refsOf(entry.page, draft ?? published ?? {}),
            });
        }
        return {
            entry,
            row,
        };
    }

    async draftState(name: string): Promise<DraftState> {
        const { entry, row } = await this.document(name);
        const version = row === undefined ? 0 : await this.store.latestVersion(row.id);
        const missing = missingFields(entry.page, row?.draft ?? null);
        return {
            entry,
            row,
            version,
            status: this.statusOf(row, version),
            complete: row?.draft !== null && row?.draft !== undefined && missing.length === 0,
            missing,
            etag: etagOf(version),
        };
    }

    /**
     * Published content that passes the schema, with media resolved, or
     * `undefined` when the page is unpublished or fails its current schema.
     */
    async published(name: string): Promise<{ content: Record<string, unknown>; version: number; updatedAt: Date } | undefined> {
        const { entry, row } = await this.document(name);
        if (row === undefined || row.published === null || row.publishedVersion === null) return undefined;
        const parsed = entry.page.schema.safeParse(row.published);
        if (!parsed.success) {
            if (!this.warned.has(name)) {
                this.warned.add(name);
                console.warn(
                    `[kizuna-cms] The published content of '${name}' no longer passes its schema, so the page reads as unpublished.`
                );
            }
            return undefined;
        }
        return {
            content: await this.resolve(entry.page, parsed.data as Record<string, unknown>),
            version: row.publishedVersion,
            updatedAt: row.updatedAt,
        };
    }

    /**
     * The draft with media resolved, or `undefined` while it is incomplete.
     */
    async draft(name: string): Promise<{ content: Record<string, unknown>; state: DraftState } | undefined> {
        const state = await this.draftState(name);
        if (!state.complete || state.row?.draft === null || state.row?.draft === undefined) return undefined;
        const parsed = state.entry.page.schema.parse(state.row.draft) as Record<string, unknown>;
        return {
            content: await this.resolve(state.entry.page, parsed),
            state,
        };
    }

    async resolve(page: Page, content: Record<string, unknown>): Promise<Record<string, unknown>> {
        const ids = mediaIdsOf(page, content);
        const media = new Map<string, MediaRecord>();
        for (const id of ids) {
            const record = await this.media.get(id);
            if (record !== undefined) media.set(id, record);
        }
        return resolveContent(page, content, media, (id, query) => this.imageUrl(id, query));
    }

    /**
     * Where the browser reads an image from: the image route, with the crop
     * and focal point as its query.
     */
    imageUrl(id: string, query = ''): string {
        return `${this.mediaPath}/${encodeURIComponent(id)}/image${query}`;
    }

    async summaries(): Promise<
        Array<{
            name: string;
            path: string;
            status: PageStatus;
            version: number;
            publishedVersion: number | null;
            updatedAt: string | null;
            updatedBy: string | null;
        }>
    > {
        const summaries = [];
        for (const name of Object.keys(this.pages)) {
            const state = await this.draftState(name);
            summaries.push({
                name,
                path: state.entry.path,
                status: state.status,
                version: state.version,
                publishedVersion: state.row?.publishedVersion ?? null,
                updatedAt: state.row?.updatedAt.toISOString() ?? null,
                updatedBy: state.row?.updatedBy ?? null,
            });
        }
        return summaries;
    }

    searchToolFor(brand: string): string | undefined {
        const search = this.options.brands?.[brand]?.search;
        if (search === undefined) return undefined;
        let routes: unknown;
        try {
            routes = this.api.routes;
        } catch {
            return undefined;
        }
        const found = flattenRoutes(routes as never).find(({ route }) => (route as RouteDefinition) === search);
        return found === undefined ? undefined : toToolName(found.routeKey);
    }

    /**
     * What the reference picker shows for a brand: the registered search
     * route, run in process, with each item labelled the way the registry
     * says.
     */
    async searchItems(
        brand: string,
        query: string | undefined,
        args: Record<string, unknown>
    ): Promise<Array<{ id: string; label: string; image?: string }>> {
        const registered = this.options.brands?.[brand];
        const search = registered?.search as (RouteDefinition & { [key: symbol]: unknown }) | undefined;
        if (registered === undefined || search === undefined) {
            throw new CmsHttpError(404, {
                detail: `The brand '${brand}' has no search route registered.`,
            });
        }
        const handler = search[HANDLER] as ((args: unknown) => Promise<{ status: number; body: unknown }>) | undefined;
        if (handler === undefined) throw new CmsHttpError(404, { detail: `The search route for '${brand}' has no handler.` });
        const parsedQuery =
            search.query === undefined ? undefined : search.query.safeParse(query === undefined ? {} : { q: query, query, search: query });
        const result = await handler({
            ...args,
            params: {},
            query: parsedQuery?.success ? parsedQuery.data : undefined,
            body: undefined,
            headers: {},
        });
        if (result.status >= 400) throw new CmsHttpError(502, { detail: `The search route for '${brand}' answered ${result.status}.` });
        const body = result.body;
        const items = Array.isArray(body) ? body : (Object.values((body ?? {}) as Record<string, unknown>).find(Array.isArray) ?? []);
        return (items as Array<Record<string, unknown>>).slice(0, 50).map((item) => ({
            id: String(item['id']),
            label: registered.label?.(item) ?? String(item['name'] ?? item['title'] ?? item['id']),
            ...(registered.image?.(item) === undefined ? {} : { image: registered.image(item)! }),
        }));
    }

    /**
     * The hint a branded field carries for the agent.
     */
    brandHint(brand: string, isList: boolean): string {
        const tool = this.searchToolFor(brand);
        const what = isList ? `An array of ${brand}` : `A ${brand}`;
        return tool === undefined ? `${what}.` : `${what}; find ids with ${tool}.`;
    }

    describe(
        name: string,
        url: string,
        draft: Record<string, unknown> | null,
        caller: Caller
    ): z.output<typeof import('./wire.js').DescribedFieldSchema>[] {
        const entry = this.entry(name);
        const described: z.output<typeof import('./wire.js').DescribedFieldSchema>[] = [];
        const push = (field: DescribedField, parent: string | undefined): void => {
            const brand = brandOf(field.schema);
            const isList = readDef(unwrapOptionalWrappers(field.schema).inner).type === 'array';
            const roles =
                field.auth?.roles === undefined
                    ? undefined
                    : typeof field.auth.roles === 'string'
                      ? [field.auth.roles]
                      : [...field.auth.roles];
            const description = [field.description, brand === undefined ? undefined : this.brandHint(brand, isList)]
                .filter(Boolean)
                .join(' ');
            described.push({
                path: field.path,
                name: field.name,
                ...(field.label === undefined ? {} : { label: field.label }),
                ...(description === '' ? {} : { description }),
                ...(field.block === undefined ? {} : { block: field.block }),
                ...(parent === undefined ? {} : { parent }),
                readOnly: field.readOnly,
                writable: pathRefusal(entry.page.fields, field.path, caller) === undefined,
                ...(roles === undefined ? {} : { roles }),
                ...(brand === undefined ? {} : { brand }),
                ...(brand === undefined || this.searchToolFor(brand) === undefined ? {} : { searchTool: this.searchToolFor(brand)! }),
                schema: z.toJSONSchema(field.schema as z.ZodType, {
                    unrepresentable: 'any',
                    reused: 'inline',
                    io: 'input',
                }) as Record<string, unknown>,
                ...(draft === null ? {} : { value: getAtPath(draft, field.path) }),
            });
            for (const inner of field.fields ?? []) push(inner, field.path);
        };
        for (const field of describeFields(entry.page)) push(field, undefined);
        void url;
        return described;
    }

    /**
     * Merges changes into the draft, checks every rule, and saves a version.
     */
    async update(input: {
        name: string;
        changes: Record<string, unknown>;
        caller: Caller;
        author: string;
        summary?: string;
        ifMatch?: string | string[];
    }): Promise<DraftState> {
        const expected = parseIfMatch(input.ifMatch);
        const { entry, row } = await this.document(input.name);
        const paths = Object.keys(input.changes);
        if (paths.length === 0) throw new CmsHttpError(400, { detail: 'No changes were sent.' });
        for (const path of paths) {
            if (fieldChain(entry.page.fields, path) === undefined) {
                throw new CmsHttpError(422, {
                    detail: `The page '${input.name}' has no field at '${path}'.`,
                    errors: [
                        {
                            code: 'unrecognized_keys',
                            path: path.split('.'),
                            message: 'Unknown field',
                        },
                    ],
                });
            }
            const refusal = pathRefusal(entry.page.fields, path, input.caller);
            if (refusal !== undefined) throw new CmsHttpError(403, { detail: refusal });
        }
        let draft: Record<string, unknown> = row?.draft ?? {};
        for (const path of paths) draft = setAtPath(draft, path, input.changes[path]);
        const parsed = entry.page.schema.safeParse(draft);
        if (!parsed.success) {
            throw new CmsHttpError(422, {
                detail: 'The draft does not pass the page schema.',
                errors: parsed.error.issues.map((issue) => ({
                    code: issue.code,
                    path: issue.path.map(String),
                    message: issue.message,
                })),
            });
        }
        const stored = parsed.data as Record<string, unknown>;
        try {
            await this.store.saveDraft({
                kind: 'page',
                key: entry.path,
                draft: stored,
                author: input.author,
                summary: input.summary,
                ifMatch: expected,
                refs: refsOf(entry.page, stored),
                migrationVersion: latestMigration(entry.page),
            });
        } catch (error) {
            if (error instanceof VersionConflictError) {
                throw new CmsHttpError(409, {
                    detail: error.message,
                    expected: error.expected,
                    latest: error.latest,
                });
            }
            throw error;
        }
        return this.draftState(input.name);
    }

    async publish(name: string, author: string): Promise<DraftState> {
        const state = await this.draftState(name);
        if (!state.complete) {
            throw new CmsHttpError(409, {
                detail: `The draft of '${name}' is incomplete. Fill in ${state.missing.join(', ')} first.`,
                missing: state.missing,
            });
        }
        await this.store.publish('page', state.entry.path, author);
        await this.revalidatePages([name]);
        return this.draftState(name);
    }

    async rollback(name: string, version: number, author: string): Promise<DraftState> {
        const { entry, row } = await this.document(name);
        if (row === undefined) throw new CmsHttpError(404, { detail: `The page '${name}' has no versions.` });
        const target = await this.store.version(row.id, version);
        if (target === undefined) throw new CmsHttpError(404, { detail: `The page '${name}' has no version ${version}.` });
        const migrated = migrateContent(entry.page, target.data, 0);
        await this.store.saveDraft({
            kind: 'page',
            key: entry.path,
            draft: migrated,
            author,
            summary: `Restored version ${version}`,
            refs: refsOf(entry.page, migrated),
            migrationVersion: latestMigration(entry.page),
        });
        return this.draftState(name);
    }

    async history(
        name: string
    ): Promise<Array<{ version: number; summary: string | null; createdAt: string; createdBy: string; published: boolean }>> {
        const { row } = await this.document(name);
        if (row === undefined) return [];
        const versions = await this.store.versions(row.id);
        return versions.map((version) => ({
            version: version.version,
            summary: version.summary,
            createdAt: version.createdAt.toISOString(),
            createdBy: version.createdBy,
            published: row.publishedVersion === version.version,
        }));
    }

    async whereUsed(brand: string, id: string): Promise<Array<{ name: string; path: string; fieldPaths: string[] }>> {
        const rows = await this.store.whereUsed(brand, id);
        const used = [];
        for (const row of rows) {
            if (row.kind !== 'page') continue;
            const name = Object.keys(this.pages).find((candidate) => this.pages[candidate]!.path === row.key);
            if (name === undefined) continue;
            used.push({
                name,
                path: row.key,
                fieldPaths: row.fieldPaths,
            });
        }
        return used;
    }

    /**
     * Drops the cached renders of every page holding the id, and returns
     * their names.
     */
    async invalidate(brand: string | z.core.$ZodType, id: string): Promise<string[]> {
        const brandName = typeof brand === 'string' ? brand : brandOf(brand);
        if (brandName === undefined) throw new Error('invalidate() takes a brand name or a schema made with Kizuna.brand.');
        const names = (await this.whereUsed(brandName, id)).map((used) => used.name);
        await this.revalidatePages(names);
        return names;
    }

    async revalidatePages(names: readonly string[]): Promise<void> {
        if (names.length === 0) return;
        await this.options.revalidate?.(names.map(pageCacheTag));
    }

    previewToken(): string {
        return signPreviewToken(previewSecret(this.options.previewSecret));
    }

    /**
     * The roles the editor identity declares, once the api has assembled.
     */
    identityRoles(): Roles | undefined {
        const schemes = (this.api as { securitySchemes?: Record<string, { roles?: Roles }> }).securitySchemes;
        return schemes?.[this.identity]?.roles;
    }
}
