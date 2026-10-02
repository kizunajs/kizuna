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
import { randomBytes } from 'node:crypto';
import type { ContentDefinition, Collection, Global } from './definitions.js';
import { servesCollection } from './page.js';
import { fillPath, matchPath, routesOf, type ServedRoute } from './dynamic.js';
import { DEFAULT_SITE, routePrefix, sitesOf, type PageEntry, type PageMap, type ResolvedCmsOptions } from './options.js';
import { formatRef, type DocumentRef } from './refs.js';
import { CMS_MIGRATION_SQL, indexSql, type IndexType, type IndexedField } from './storage/migration.js';
import { MediaService, type MediaRecord } from './media/media.js';
import { memoryMediaStorage, type MediaStorage } from './media/storage.js';
import { s3MediaStorage } from './media/s3.js';
import { mediaIdsOf, resolveContent } from './media/resolve.js';
import { pathRefusal, type Caller } from './rules.js';
import { DocumentStore, VersionConflictError, type DocumentKind, type DocumentRow, type ListField } from './storage/store.js';
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
export const pageCacheTag = (name: string, site = DEFAULT_SITE): string =>
    site === DEFAULT_SITE ? `kizuna-cms:page:${name}` : `kizuna-cms:page:${site}:${name}`;

/**
 * The cache tag a document's reads carry.
 */
export const documentCacheTag = (ref: DocumentRef): string => `kizuna-cms:${formatRef(ref)}`;

/**
 * The cache tag every list of a collection carries.
 */
export const collectionCacheTag = (name: string): string => `kizuna-cms:collection:${name}`;

/**
 * The draft's entity tag: its version and when it was last saved, so a save
 * folded into the same version still changes it.
 */
const etagOf = (version: number, savedAt: Date | undefined): string =>
    savedAt === undefined ? `"${version}"` : `"${version}-${savedAt.getTime()}"`;

const parseIfMatch = (header: string | string[] | undefined): { version: number; savedAt?: number } | undefined => {
    const value = Array.isArray(header) ? header[0] : header;
    if (value === undefined || value.trim() === '' || value.trim() === '*') return undefined;
    const match = /^(?:W\/)?"?(\d+)(?:-(\d+))?"?$/.exec(value.trim());
    if (match === null) throw new CmsHttpError(400, { detail: `The If-Match header '${value}' is not an ETag this draft sends.` });
    return {
        version: Number(match[1]),
        ...(match[2] === undefined
            ? {}
            : {
                  savedAt: Number(match[2]),
              }),
    };
};

/**
 * How long an editor's autosaves keep folding into the version they started.
 */
const FOLD_WINDOW = 10 * 60 * 1000;

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

/**
 * A reference resolved to what it addresses: where it is stored, and the
 * definition its content follows.
 */
export interface Target {
    ref: DocumentRef;
    kind: Exclude<DocumentKind, 'media'>;
    /**
     * The site a page belongs to; the default site for everything else.
     */
    site: string;
    key: string;
    definition: ContentDefinition;
    /**
     * Where a page is served.
     */
    path?: string;
    /**
     * The route an item is served at, such as `/blog/[slug]`, when a page
     * shows its collection.
     */
    pattern?: string;
}

/**
 * Where a document is served: a page's path, or the path an item's content
 * fills into the route that shows it. `undefined` for a global, an item no
 * page shows, and an item whose address fields are empty.
 */
export const addressOf = (target: Target, content: Record<string, unknown> | null | undefined): string | undefined =>
    target.path ?? (target.pattern === undefined ? undefined : fillPath(target.pattern, content));

/**
 * A collection, resolved: where its items are stored, what they follow, and
 * the routes that serve them.
 */
export interface Listing {
    name: string;
    keyPrefix: string;
    definition: Collection;
    /**
     * The fields a list filters and sorts by: the declared indexes, and the
     * fields a route's params name.
     */
    indexes: readonly string[];
    /**
     * The fields the routes that serve the items read from the address.
     * Together they are unique within the collection.
     */
    pathFields: readonly string[];
    /**
     * The pages that show one item per address, such as `/blog/[slug]`.
     */
    routes: readonly ServedRoute[];
    /**
     * The brand the ids carry.
     */
    brand: string;
    refOf: (id: string) => DocumentRef;
}

export interface DraftState {
    target: Target;
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
    /**
     * The default site's pages.
     */
    readonly pages: PageMap;
    /**
     * Every site's pages, keyed by site name.
     */
    readonly sites: Record<string, PageMap>;
    readonly globals: Record<string, Global>;
    readonly collections: Record<string, Collection>;
    readonly identity: string;
    readonly roles: readonly string[] | undefined;
    readonly basePath: '' | `/${string}`;
    readonly mediaPath: string;
    private warned = new Set<string>();

    constructor(
        readonly options: ResolvedCmsOptions,
        private readonly api: PluginApi
    ) {
        this.store = new DocumentStore(options.db);
        this.sites = Object.fromEntries(Object.entries(sitesOf(options)).map(([site, declared]) => [site, declared.pages]));
        this.pages = this.sites[DEFAULT_SITE] ?? {};
        this.globals = Object.fromEntries((options.globals ?? []).map((definition) => [definition.name, definition]));
        this.collections = Object.fromEntries((options.collections ?? []).map((definition) => [definition.name, definition]));
        this.identity = options.auth.identity;
        this.roles =
            options.auth.roles === undefined
                ? undefined
                : typeof options.auth.roles === 'string'
                  ? [options.auth.roles]
                  : options.auth.roles;
        this.basePath = routePrefix(options.path);
        this.mediaPath = (options.media?.publicPath ?? `${options.apiPath ?? '/api'}${this.basePath}/media`).replace(/\/$/, '');
        this.media = new MediaService({
            store: this.store,
            storage: mediaStorageFrom(options.media),
            maxBytes: options.media?.maxBytes ?? 10 * 1024 * 1024,
        });
    }

    entry(name: string, site = DEFAULT_SITE): PageEntry {
        const pages = this.sites[site];
        if (pages === undefined) throw new CmsHttpError(404, { detail: `There is no site named '${site}'.` });
        const entry = pages[name];
        if (entry === undefined) {
            throw new CmsHttpError(404, {
                detail: site === DEFAULT_SITE ? `There is no page named '${name}'.` : `The ${site} site has no page named '${name}'.`,
            });
        }
        return entry;
    }

    entryAt(path: string, site = DEFAULT_SITE): PageEntry | undefined {
        return Object.values(this.sites[site] ?? {}).find((entry) => entry.path === path && !servesCollection(entry.page));
    }

    collection(name: string): Collection {
        const found = this.collections[name];
        if (found === undefined) throw new CmsHttpError(404, { detail: `There is no collection named '${name}'.` });
        return found;
    }

    listing(name: string): Listing {
        const definition = this.collection(name);
        const routes = Object.entries(this.sites).flatMap(([site, pages]) => routesOf(definition.name, pages, site));
        const pathFields = [...new Set(routes.flatMap((route) => route.params))];
        return {
            name: definition.name,
            keyPrefix: `${definition.name}/`,
            definition,
            indexes: [...new Set([...pathFields, ...(definition.indexes ?? [])])],
            pathFields,
            routes,
            brand: readMetaBrand(definition.id)!,
            refOf: (id) => ({
                type: 'item',
                collection: definition.name,
                id,
            }),
        };
    }

    listings(): Listing[] {
        return Object.keys(this.collections).map((name) => this.listing(name));
    }

    listingOf(ref: DocumentRef): Listing | undefined {
        return ref.type === 'item' ? this.listing(ref.collection) : undefined;
    }

    addressOf(target: Target, content: Record<string, unknown> | null | undefined): string | undefined {
        return addressOf(target, content);
    }

    /**
     * The id of the item whose address fields hold these values, read from
     * the draft or the published copy.
     */
    async findItem(collection: string, params: Record<string, string>, copy: 'draft' | 'published'): Promise<string | undefined> {
        const listing = this.listing(collection);
        const result = await this.store.query({
            kind: 'item',
            keyPrefix: listing.keyPrefix,
            copy,
            where: Object.entries(params).map(([field, value]) => ({
                field,
                type: 'text',
                value,
            })),
            limit: 1,
        });
        const row = result.rows[0];
        return row === undefined ? undefined : row.key.slice(listing.keyPrefix.length);
    }

    /**
     * The document served at a path: a page, or the item a page that shows a
     * collection has at that address, by its draft address first.
     */
    async pageAt(path: string, site = DEFAULT_SITE): Promise<DocumentRef | undefined> {
        const exact = this.entryAt(path, site);
        if (exact !== undefined) {
            return {
                type: 'page',
                name: exact.page.name,
                ...(site === DEFAULT_SITE
                    ? {}
                    : {
                          site,
                      }),
            };
        }
        for (const entry of Object.values(this.sites[site] ?? {})) {
            if (!servesCollection(entry.page)) continue;
            const params = matchPath(entry.path, path);
            if (params === undefined) continue;
            const collection = entry.page.collection.name;
            const id = (await this.findItem(collection, params, 'draft')) ?? (await this.findItem(collection, params, 'published'));
            if (id !== undefined) {
                return {
                    type: 'item',
                    collection,
                    id,
                };
            }
        }
        return undefined;
    }

    /**
     * Where a reference is stored and what its content follows.
     */
    target(ref: DocumentRef): Target {
        if (ref.type === 'page') {
            const site = ref.site ?? DEFAULT_SITE;
            const entry = this.entry(ref.name, site);
            if (servesCollection(entry.page)) {
                throw new CmsHttpError(400, {
                    detail: `${ref.name} shows the items of the ${entry.page.collection.name} collection at ${entry.path}. Edit an item, item:${entry.page.collection.name}:<id>.`,
                });
            }
            return {
                ref,
                kind: 'page',
                site,
                key: entry.path,
                definition: entry.page,
                path: entry.path,
            };
        }
        if (ref.type === 'global') {
            const found = this.globals[ref.name];
            if (found === undefined) throw new CmsHttpError(404, { detail: `There is no global named '${ref.name}'.` });
            return {
                ref,
                kind: 'global',
                site: DEFAULT_SITE,
                key: ref.name,
                definition: found,
            };
        }
        const listing = this.listing(ref.collection);
        return {
            ref,
            kind: 'item',
            site: DEFAULT_SITE,
            key: `${listing.keyPrefix}${ref.id}`,
            definition: listing.definition,
            ...(listing.routes[0] === undefined
                ? {}
                : {
                      pattern: listing.routes[0].pattern,
                  }),
        };
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

    private async migrated(target: Target, found: DocumentRow | undefined): Promise<DocumentRow | undefined> {
        if (found === undefined || pendingMigrations(target.definition, found.migrationVersion).length === 0) return found;
        const published = found.published === null ? null : migrateContent(target.definition, found.published, found.migrationVersion);
        const draft = found.draft === null ? null : migrateContent(target.definition, found.draft, found.migrationVersion);
        return this.store.saveMigrated({
            id: found.id,
            published,
            draft,
            migrationVersion: latestMigration(target.definition),
            author: MIGRATION_AUTHOR,
            refs: refsOf(target.definition, draft ?? published ?? {}),
        });
    }

    /**
     * The stored document, brought up to its definition's latest migration
     * step.
     */
    async document(ref: DocumentRef): Promise<{ target: Target; row: DocumentRow | undefined }> {
        const target = this.target(ref);
        return {
            target,
            row: await this.migrated(target, await this.store.get(target.kind, target.key, target.site)),
        };
    }

    async draftState(ref: DocumentRef): Promise<DraftState> {
        const { target, row } = await this.document(ref);
        const version = row === undefined ? 0 : await this.store.latestVersion(row.id);
        const missing = missingFields(target.definition, row?.draft ?? null);
        return {
            target,
            row,
            version,
            status: this.statusOf(row, version),
            complete: row?.draft !== null && row?.draft !== undefined && missing.length === 0,
            missing,
            etag: etagOf(version, row?.updatedAt),
        };
    }

    /**
     * What the reader hands a component: the content with media resolved, and
     * an item's id beside its fields.
     */
    private async present(target: Target, content: Record<string, unknown>): Promise<Record<string, unknown>> {
        const resolved = await this.resolve(target.definition, content);
        return target.ref.type === 'item'
            ? {
                  id: target.ref.id,
                  ...resolved,
              }
            : resolved;
    }

    private passes(target: Target, content: Record<string, unknown> | null): Record<string, unknown> | undefined {
        if (content === null) return undefined;
        const parsed = target.definition.schema.safeParse(content);
        if (parsed.success) return parsed.data as Record<string, unknown>;
        const label = formatRef(target.ref);
        if (!this.warned.has(label)) {
            this.warned.add(label);
            console.warn(`[kizuna-cms] The content of '${label}' no longer passes its schema, so it reads as unpublished.`);
        }
        return undefined;
    }

    /**
     * Published content that passes the schema, or `undefined` when there is
     * none.
     */
    async published(ref: DocumentRef): Promise<{ content: Record<string, unknown>; version: number; updatedAt: Date } | undefined> {
        const stored = await this.publishedAsStored(ref);
        if (stored === undefined) return undefined;
        return {
            ...stored,
            content: await this.present(this.target(ref), stored.content),
        };
    }

    /**
     * Published content as it is stored, image references and crops
     * included, for copying between environments.
     */
    async publishedAsStored(ref: DocumentRef): Promise<{ content: Record<string, unknown>; version: number; updatedAt: Date } | undefined> {
        const { target, row } = await this.document(ref);
        if (row === undefined || row.publishedVersion === null) return undefined;
        const content = this.passes(target, row.published);
        if (content === undefined) return undefined;
        return {
            content,
            version: row.publishedVersion,
            updatedAt: row.updatedAt,
        };
    }

    /**
     * The draft, while it passes the schema, or `undefined`.
     */
    async draft(ref: DocumentRef): Promise<{ content: Record<string, unknown>; state: DraftState } | undefined> {
        const state = await this.draftState(ref);
        if (!state.complete || state.row?.draft === null || state.row?.draft === undefined) return undefined;
        return {
            content: await this.present(state.target, state.target.definition.schema.parse(state.row.draft) as Record<string, unknown>),
            state,
        };
    }

    async resolve(definition: ContentDefinition, content: Record<string, unknown>): Promise<Record<string, unknown>> {
        const ids = mediaIdsOf(definition, content);
        const media = new Map<string, MediaRecord>();
        for (const id of ids) {
            const record = await this.media.get(id);
            if (record !== undefined) media.set(id, record);
        }
        return resolveContent(definition, content, media, (id, query) => this.imageUrl(id, query));
    }

    /**
     * Where the browser reads an image from: the image route, with the crop
     * and focal point as its query.
     */
    imageUrl(id: string, query = ''): string {
        return `${this.mediaPath}/${encodeURIComponent(id)}/image${query}`;
    }

    /**
     * Every page as editors list it: each page, and each item a page shows at
     * an address.
     */
    async summaries(): Promise<
        Array<{
            name: string;
            site: string;
            ref: string;
            path: string;
            group: string | null;
            status: PageStatus;
            version: number;
            publishedVersion: number | null;
            updatedAt: string | null;
            updatedBy: string | null;
        }>
    > {
        const shown: Array<{ name: string; site: string; ref: DocumentRef; pattern?: string }> = [];
        for (const [site, pages] of Object.entries(this.sites)) {
            for (const [name, entry] of Object.entries(pages)) {
                if (!servesCollection(entry.page)) {
                    shown.push({
                        name,
                        site,
                        ref: {
                            type: 'page',
                            name,
                            ...(site === DEFAULT_SITE
                                ? {}
                                : {
                                      site,
                                  }),
                        },
                    });
                    continue;
                }
                const listing = this.listing(entry.page.collection.name);
                for (const row of await this.store.list('item')) {
                    if (!row.key.startsWith(listing.keyPrefix)) continue;
                    shown.push({
                        name,
                        site,
                        ref: listing.refOf(row.key.slice(listing.keyPrefix.length)),
                        pattern: entry.path,
                    });
                }
            }
        }
        const summaries = [];
        for (const { name, site, ref, pattern } of shown) {
            const state = await this.draftState(ref);
            const content = state.row?.draft ?? state.row?.published;
            const path = pattern === undefined ? this.addressOf(state.target, content) : fillPath(pattern, content);
            if (path === undefined) continue;
            summaries.push({
                name,
                site,
                ref: formatRef(ref),
                path,
                group: state.target.definition.group ?? null,
                status: state.status,
                version: state.version,
                publishedVersion: state.row?.publishedVersion ?? null,
                updatedAt: state.row?.updatedAt.toISOString() ?? null,
                updatedBy: state.row?.updatedBy ?? null,
            });
        }
        return summaries.sort((left, right) => left.path.localeCompare(right.path));
    }

    async globalSummaries(): Promise<
        Array<{ name: string; group: string | null; status: PageStatus; version: number; updatedAt: string | null }>
    > {
        const summaries = [];
        for (const [name, definition] of Object.entries(this.globals)) {
            const state = await this.draftState({
                type: 'global',
                name,
            });
            summaries.push({
                name,
                group: definition.group ?? null,
                status: state.status,
                version: state.version,
                updatedAt: state.row?.updatedAt.toISOString() ?? null,
            });
        }
        return summaries;
    }

    /**
     * How an indexed field is read for filtering and sorting.
     */
    indexOf(listing: Listing, field: string): ListField {
        if (!listing.indexes.includes(field)) {
            throw new CmsHttpError(400, {
                detail: `'${field}' is not an index of '${listing.name}'. Lists filter and sort by ${[...listing.indexes, 'publishedAt', 'updatedAt'].join(', ')}.`,
            });
        }
        const schema = listing.definition.fields.find((candidate) => candidate.name === field)!.schema;
        const type = readDef(unwrapOptionalWrappers(schema).inner).type;
        const indexType: IndexType = type === 'number' || type === 'int' ? 'numeric' : type === 'boolean' ? 'boolean' : 'text';
        return {
            field,
            type: indexType,
        };
    }

    /**
     * The indexes of every collection, the fields its addresses read
     * included, as `indexSql` writes them.
     */
    indexedFields(): IndexedField[] {
        return this.listings().flatMap((listing) =>
            listing.indexes.map((field) => ({
                kind: 'item',
                keyPrefix: listing.keyPrefix,
                ...this.indexOf(listing, field),
            }))
        );
    }

    /**
     * The tables and every collection's indexes, as `kizuna cms migrate`
     * writes them.
     */
    migrationSql(): string {
        const indexes = indexSql(this.indexedFields());
        return indexes === '' ? CMS_MIGRATION_SQL : `${CMS_MIGRATION_SQL}\n${indexes}\n`;
    }

    /**
     * Items of a collection, filtered and sorted by its indexes, a page at a
     * time. In draft mode every item shows its draft where that passes the
     * schema; otherwise only published items appear.
     */
    async listItems(
        name: string,
        query: {
            draft: boolean;
            where?: Record<string, unknown>;
            orderBy?: string;
            direction?: 'asc' | 'desc';
            limit?: number;
            cursor?: string;
        }
    ): Promise<{ items: Array<Record<string, unknown>>; next: string | undefined }> {
        const listing = this.listing(name);
        const result = await this.store.query({
            kind: 'item',
            keyPrefix: listing.keyPrefix,
            copy: query.draft ? 'draft' : 'published',
            where: Object.entries(query.where ?? {}).map(([field, value]) => ({
                ...this.indexOf(listing, field),
                value,
            })),
            ...(query.orderBy === undefined
                ? {}
                : {
                      orderBy:
                          query.orderBy === 'publishedAt' || query.orderBy === 'updatedAt'
                              ? query.orderBy
                              : this.indexOf(listing, query.orderBy),
                  }),
            ...(query.direction === undefined
                ? {}
                : {
                      direction: query.direction,
                  }),
            limit: Math.min(Math.max(query.limit ?? 50, 1), 200),
            ...(query.cursor === undefined
                ? {}
                : {
                      cursor: query.cursor,
                  }),
        });
        const items = [];
        for (const row of result.rows) {
            const target = this.target(listing.refOf(row.key.slice(listing.keyPrefix.length)));
            const content = (query.draft ? this.passes(target, row.draft) : undefined) ?? this.passes(target, row.published);
            if (content !== undefined) items.push(await this.present(target, content));
        }
        return {
            items,
            next: result.next,
        };
    }

    /**
     * Every item of a collection as editors list it: drafts and incomplete
     * items included, with each one's status and, when a page shows it, its
     * address.
     */
    async editorItems(name: string): Promise<
        Array<{
            id: string;
            ref: string;
            label: string;
            path: string | null;
            status: PageStatus;
            complete: boolean;
            updatedAt: string;
            updatedBy: string;
        }>
    > {
        const listing = this.listing(name);
        const definition = listing.definition;
        const rows = await this.store.list('item');
        const labelField = definition.fields.find((field) => readDef(unwrapOptionalWrappers(field.schema).inner).type === 'string')?.name;
        const items = [];
        for (const row of rows) {
            if (!row.key.startsWith(listing.keyPrefix)) continue;
            const id = row.key.slice(listing.keyPrefix.length);
            const version = await this.store.latestVersion(row.id);
            const content = row.draft ?? row.published ?? {};
            const label = labelField === undefined ? undefined : content[labelField];
            items.push({
                id,
                ref: formatRef(listing.refOf(id)),
                label: typeof label === 'string' && label !== '' ? label : 'Untitled',
                path: listing.routes[0] === undefined ? null : (fillPath(listing.routes[0].pattern, content) ?? null),
                status: this.statusOf(row, version),
                complete: missingFields(definition, row.draft).length === 0 && row.draft !== null,
                updatedAt: row.updatedAt.toISOString(),
                updatedBy: row.updatedBy,
            });
        }
        return items.sort((left, right) => left.label.localeCompare(right.label));
    }

    /**
     * A new item of a collection, as a draft with the values given.
     */
    async createItem(name: string, values: Record<string, unknown>, caller: Caller, author: string): Promise<DraftState> {
        const listing = this.listing(name);
        const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
        const id = Array.from(randomBytes(12), (byte) => alphabet[byte % alphabet.length]).join('');
        const ref = listing.refOf(id);
        if (Object.keys(values).length === 0) {
            await this.store.saveDraft({
                kind: 'item',
                key: this.target(ref).key,
                draft: {},
                author,
                summary: 'Created',
                migrationVersion: latestMigration(listing.definition),
            });
            return this.draftState(ref);
        }
        return this.update({
            ref,
            changes: values,
            caller,
            author,
            summary: 'Created',
        });
    }

    async deleteItem(name: string, id: string): Promise<void> {
        const listing = this.listing(name);
        const ref = listing.refOf(id);
        const target = this.target(ref);
        if (!(await this.store.delete('item', target.key))) {
            throw new CmsHttpError(404, { detail: `There is no item '${id}' in '${listing.name}'.` });
        }
        await this.revalidateDocument(ref);
    }

    searchToolFor(brand: string): string | undefined {
        const search = this.options.brands?.[brand]?.search;
        if (search === undefined || typeof search === 'function') return undefined;
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
     * The tool name of this API's own search route, which finds ids for any
     * brand the CMS knows, once the api has assembled.
     */
    ownSearchTool(): string | undefined {
        let routes: unknown;
        try {
            routes = this.api.routes;
        } catch {
            return undefined;
        }
        const found = flattenRoutes(routes as never).find(
            ({ route }) =>
                (route as RouteDefinition).method === 'GET' &&
                (route as RouteDefinition).path.endsWith(`${this.basePath}/items/:brand`) &&
                (route as RouteDefinition).tool !== undefined
        );
        return found === undefined ? undefined : toToolName(found.routeKey);
    }

    /**
     * The collection whose ids carry a brand, so a reference to one of its
     * items needs no search route of the app's.
     */
    listingFor(brand: string): Listing | undefined {
        return this.listings().find((candidate) => candidate.brand === brand);
    }

    /**
     * What the reference picker shows for a brand: the items of the
     * collection it names, or the registered search route, run in process,
     * with each item labelled the way the registry says.
     */
    async searchItems(
        brand: string,
        query: string | undefined,
        args: Record<string, unknown>
    ): Promise<Array<{ id: string; label: string; image?: string }>> {
        const owned = this.listingFor(brand);
        if (owned !== undefined) {
            const items = await this.editorItems(owned.name);
            const term = (query ?? '').toLowerCase();
            return items
                .filter((item) => term === '' || item.label.toLowerCase().includes(term))
                .slice(0, 50)
                .map((item) => ({
                    id: item.id,
                    label: item.label,
                }));
        }
        const registered = this.options.brands?.[brand];
        if (registered === undefined || registered.search === undefined) {
            throw new CmsHttpError(404, {
                detail: `The brand '${brand}' has no search registered.`,
            });
        }
        const label = (item: Record<string, unknown>) => ({
            id: String(item['id']),
            label: registered.label?.(item) ?? String(item['name'] ?? item['title'] ?? item['id']),
            ...(registered.image?.(item) === undefined ? {} : { image: registered.image(item)! }),
        });
        if (typeof registered.search === 'function') {
            let found: readonly unknown[];
            try {
                found = await registered.search(query);
            } catch (error) {
                throw new CmsHttpError(502, {
                    detail: `The search for '${brand}' failed: ${error instanceof Error ? error.message : String(error)}`,
                });
            }
            return (found as Array<Record<string, unknown>>).slice(0, 50).map(label);
        }
        const search = registered.search as RouteDefinition & { [key: symbol]: unknown };
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
        return (items as Array<Record<string, unknown>>).slice(0, 50).map(label);
    }

    /**
     * The hint a branded field carries for the agent.
     */
    brandHint(brand: string, isList: boolean): string {
        const what = isList ? `An array of ${brand}` : `A ${brand}`;
        const own = this.ownSearchTool();
        const owned = this.listingFor(brand);
        if (owned !== undefined) {
            return own === undefined
                ? `${what}; ids of items in the ${owned.name} collection.`
                : `${what}; ids of items in the ${owned.name} collection, found with ${own}.`;
        }
        const route = this.searchToolFor(brand);
        if (route !== undefined) return `${what}; find ids with ${route}.`;
        return this.options.brands?.[brand]?.search === undefined || own === undefined
            ? `${what}.`
            : `${what}; find ids with ${own}, brand ${brand}.`;
    }

    describe(
        ref: DocumentRef,
        draft: Record<string, unknown> | null,
        caller: Caller
    ): z.output<typeof import('./wire.js').DescribedFieldSchema>[] {
        const { definition } = this.target(ref);
        const listing = this.listingOf(ref);
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
            const route = listing?.routes.find((candidate) => candidate.params.includes(field.path));
            const address =
                route === undefined
                    ? undefined
                    : `Part of the address, ${route.pattern}, and unique. Changing it on a published item breaks links to the old address.`;
            const description = [field.description, brand === undefined ? undefined : this.brandHint(brand, isList), address]
                .filter(Boolean)
                .join(' ');
            const searchable =
                brand !== undefined && (this.listingFor(brand) !== undefined || this.options.brands?.[brand]?.search !== undefined);
            described.push({
                path: field.path,
                name: field.name,
                ...(field.label === undefined ? {} : { label: field.label }),
                ...(description === '' ? {} : { description }),
                ...(field.block === undefined ? {} : { block: field.block }),
                ...(parent === undefined ? {} : { parent }),
                readOnly: field.readOnly,
                writable: pathRefusal(definition.fields, field.path, caller) === undefined,
                ...(roles === undefined ? {} : { roles }),
                ...(brand === undefined ? {} : { brand }),
                ...(searchable ? { searchTool: this.searchToolFor(brand) ?? this.ownSearchTool() ?? `cms.${brand}` } : {}),
                schema: z.toJSONSchema(field.schema as z.ZodType, {
                    unrepresentable: 'any',
                    reused: 'inline',
                    io: 'input',
                }) as Record<string, unknown>,
                ...(draft === null ? {} : { value: getAtPath(draft, field.path) }),
            });
            for (const inner of field.fields ?? []) push(inner, field.path);
        };
        for (const field of describeFields(definition)) push(field, undefined);
        return described;
    }

    /**
     * Where else a document appears, for the warning shown before a shared
     * global or item is changed.
     */
    async usedOn(ref: DocumentRef): Promise<{ everywhere: boolean; pages: Array<{ name: string; path: string }> }> {
        if (ref.type === 'global') {
            return {
                everywhere: true,
                pages: [],
            };
        }
        const brand = this.listingOf(ref)?.brand;
        if (brand === undefined || ref.type !== 'item') {
            return {
                everywhere: false,
                pages: [],
            };
        }
        return {
            everywhere: false,
            pages: (await this.whereUsed(brand, ref.id)).map((used) => ({
                name: used.name,
                path: used.path,
            })),
        };
    }

    /**
     * Merges changes into the draft, checks every rule, and saves a version.
     */
    async update(input: {
        ref: DocumentRef;
        changes: Record<string, unknown>;
        caller: Caller;
        author: string;
        summary?: string;
        ifMatch?: string | string[];
        autosave?: boolean;
    }): Promise<DraftState> {
        const expected = parseIfMatch(input.ifMatch);
        const target = this.target(input.ref);
        const row = await this.migrated(target, await this.store.get(target.kind, target.key, target.site));
        const fields = target.definition.fields;
        const paths = Object.keys(input.changes);
        if (paths.length === 0) throw new CmsHttpError(400, { detail: 'No changes were sent.' });
        for (const path of paths) {
            if (fieldChain(fields, path) === undefined) {
                throw new CmsHttpError(422, {
                    detail: `'${formatRef(input.ref)}' has no field at '${path}'.`,
                    errors: [
                        {
                            code: 'unrecognized_keys',
                            path: path.split('.'),
                            message: 'Unknown field',
                        },
                    ],
                });
            }
            const refusal = pathRefusal(fields, path, input.caller);
            if (refusal !== undefined) throw new CmsHttpError(403, { detail: refusal });
        }
        let draft: Record<string, unknown> = row?.draft ?? row?.published ?? {};
        for (const path of paths) draft = setAtPath(draft, path, input.changes[path]);
        const parsed = target.definition.schema.safeParse(draft);
        // A value that is there and wrong is refused; one not filled in yet leaves the draft incomplete.
        const wrong = parsed.success
            ? []
            : parsed.error.issues.filter((issue) => getAtPath(draft, issue.path.map(String).join('.')) !== undefined);
        if (wrong.length > 0) {
            throw new CmsHttpError(422, {
                detail: 'The draft does not pass its schema.',
                errors: wrong.map((issue) => ({
                    code: issue.code,
                    path: issue.path.map(String),
                    message: issue.message,
                })),
            });
        }
        const stored = parsed.success ? (parsed.data as Record<string, unknown>) : draft;
        const listing = this.listingOf(input.ref);
        if (listing !== undefined && paths.some((path) => listing.pathFields.includes(path.split('.')[0]!))) {
            await this.assertFreeAddress(listing, target.key, stored);
        }
        try {
            await this.store.saveDraft({
                kind: target.kind,
                key: target.key,
                site: target.site,
                draft: stored,
                author: input.author,
                summary: input.summary,
                ifMatch: expected,
                ...(input.autosave === true
                    ? {
                          fold: FOLD_WINDOW,
                      }
                    : {}),
                refs: refsOf(target.definition, stored),
                migrationVersion: latestMigration(target.definition),
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
        return this.draftState(input.ref);
    }

    /**
     * Refuses an address another item of the collection already has, in its
     * draft or its published copy.
     */
    private async assertFreeAddress(listing: Listing, key: string, content: Record<string, unknown>): Promise<void> {
        for (const route of listing.routes) {
            const values = route.params.map((field) => content[field]);
            if (values.some((value) => typeof value !== 'string' || value === '')) continue;
            for (const copy of ['draft', 'published'] as Array<'draft' | 'published'>) {
                const found = await this.store.query({
                    kind: 'item',
                    keyPrefix: listing.keyPrefix,
                    copy,
                    where: route.params.map((field, index) => ({
                        field,
                        type: 'text',
                        value: values[index],
                    })),
                    limit: 2,
                });
                if (found.rows.some((row) => row.key !== key)) {
                    throw new CmsHttpError(409, {
                        detail: `Another item of ${listing.name} is already at ${fillPath(route.pattern, content)}. Give this one another ${route.params.join(' and ')}, since it is the address.`,
                    });
                }
            }
        }
    }

    async publish(ref: DocumentRef, author: string): Promise<DraftState> {
        const state = await this.draftState(ref);
        if (!state.complete) {
            throw new CmsHttpError(409, {
                detail: `The draft of '${formatRef(ref)}' is incomplete. Fill in ${state.missing.join(', ')} first.`,
                missing: state.missing,
            });
        }
        await this.store.publish(state.target.kind, state.target.key, author, state.target.site);
        await this.revalidateDocument(ref);
        return this.draftState(ref);
    }

    async rollback(ref: DocumentRef, version: number, author: string): Promise<DraftState> {
        const { target, row } = await this.document(ref);
        if (row === undefined) throw new CmsHttpError(404, { detail: `'${formatRef(ref)}' has no versions.` });
        const found = await this.store.version(row.id, version);
        if (found === undefined) throw new CmsHttpError(404, { detail: `'${formatRef(ref)}' has no version ${version}.` });
        const migrated = migrateContent(target.definition, found.data, 0);
        await this.store.saveDraft({
            kind: target.kind,
            key: target.key,
            site: target.site,
            draft: migrated,
            author,
            summary: `Restored version ${version}`,
            refs: refsOf(target.definition, migrated),
            migrationVersion: latestMigration(target.definition),
        });
        return this.draftState(ref);
    }

    async history(
        ref: DocumentRef
    ): Promise<Array<{ version: number; summary: string | null; createdAt: string; createdBy: string; published: boolean }>> {
        const { row } = await this.document(ref);
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

    async whereUsed(brand: string, id: string): Promise<Array<{ name: string; site: string; path: string; fieldPaths: string[] }>> {
        const rows = await this.store.whereUsed(brand, id);
        const used = [];
        for (const row of rows) {
            if (row.kind === 'page') {
                const pages = this.sites[row.site] ?? {};
                const name = Object.keys(pages).find((candidate) => pages[candidate]!.path === row.key);
                if (name !== undefined) {
                    used.push({
                        name,
                        site: row.site,
                        path: row.key,
                        fieldPaths: row.fieldPaths,
                    });
                }
                continue;
            }
            // An item holding the id shows it on every page that serves the item.
            if (row.kind !== 'item') continue;
            const collection = row.key.slice(0, row.key.indexOf('/'));
            if (this.collections[collection] === undefined) continue;
            for (const route of this.listing(collection).routes) {
                used.push({
                    name: route.page,
                    site: route.site,
                    path: fillPath(route.pattern, row.published ?? row.draft) ?? route.pattern,
                    fieldPaths: row.fieldPaths,
                });
            }
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
        const used = await this.whereUsed(brandName, id);
        if (used.length > 0) await this.options.revalidate?.([...new Set(used.map((page) => pageCacheTag(page.name, page.site)))]);
        return used.map((page) => (page.site === DEFAULT_SITE ? page.name : `${page.site}:${page.name}`));
    }

    /**
     * Drops every cached read a changed document reaches: its own, its
     * collection's lists, and the pages that reference an item.
     */
    async revalidateDocument(ref: DocumentRef): Promise<void> {
        const tags = ref.type === 'page' ? [pageCacheTag(ref.name, ref.site)] : [documentCacheTag(ref)];
        if (ref.type === 'item') tags.push(collectionCacheTag(ref.collection));
        const brand = this.listingOf(ref)?.brand;
        if (brand !== undefined && ref.type === 'item') {
            tags.push(...(await this.whereUsed(brand, ref.id)).map((used) => pageCacheTag(used.name, used.site)));
        }
        await this.options.revalidate?.([...new Set(tags)]);
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
