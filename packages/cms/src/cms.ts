import { z } from 'zod';
import type { ContentRuntime, PluginApi } from 'kizunajs/plugin';
import { flattenRoutes } from 'kizunajs/adapter';
import { HANDLER } from './handler-key.js';
import { encodeForWire, readDef, readMetaBrand, toToolName, unwrapOptionalWrappers } from 'kizunajs/generator';
import type { RouteDefinition, Roles } from 'kizunajs';
import {
    describeFields,
    describeLayout,
    getAtPath,
    latestMigration,
    migrateContent,
    missingFields,
    pendingMigrations,
    refsOf,
    setAtPath,
    type DescribedField,
} from './content.js';
import { blocksForWire, blocksHint, fieldChain, hiddenIn } from './content.js';
import { conditionText } from './condition.js';
import { dataFields, objectOf, type Field } from './field.js';
import { randomBytes } from 'node:crypto';
import type { ContentDefinition, Collection, Global } from './definitions.js';
import { servesCollection } from './page.js';
import { fillPath, matchPath, routesOf, type ServedRoute } from './dynamic.js';
import { DEFAULT_SITE, routePrefix, sitesOf, type PageEntry, type PageMap, type ResolvedCmsOptions } from './options.js';
import { formatRef, parseRef, type DocumentRef } from './refs.js';
import { CMS_MIGRATION_SQL, indexSql, type IndexType, type IndexedField } from './storage/migration.js';
import { MediaService, type MediaRecord } from './media/media.js';
import { memoryMediaStorage, type MediaStorage } from './media/storage.js';
import { s3MediaStorage } from './media/s3.js';
import { mediaIdsOf, mediaUsesOf, resolveContent } from './media/resolve.js';
import { pathRefusal, type Caller } from './rules.js';
import {
    DocumentStore,
    VersionConflictError,
    type DocumentKind,
    type DocumentRow,
    type EditingCondition,
    type ListField,
    type Migration,
} from './storage/store.js';
import { previewSecret, signPreviewToken, verifyPreviewToken } from './preview-token.js';
import { DraftNotices } from './draft-notices.js';
import { descendantsOf, loadParents, loopRefusal, parentIn, placeInTree } from './tree.js';
import { ITEM_STATUSES, type ItemCondition, type ItemListQuery } from './item-list.js';
import type { PageStatusSchema } from './wire.js';
import type { CmsRelationship, RelationshipOption } from './relationships.js';

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
 * Brings stored content of one definition up to its latest migration step.
 */
const migrationOf = (definition: ContentDefinition): Migration => ({
    version: latestMigration(definition),
    run: (content, from) => migrateContent(definition, content, from),
});

/**
 * One document that holds an image, as the media library lists it.
 */
export interface MediaUse {
    ref: string;
    /**
     * An item's title, or the page's or global's `label`. `null` when it has
     * neither, so the reader writes out its name.
     */
    label: string | null;
    fieldPaths: string[];
    /**
     * Whether the published content shows it. False when only the draft holds
     * it.
     */
    published: boolean;
}

/**
 * Published content that fails its schema, for the content overview and
 * `kizuna cms check`.
 */
export interface ContentProblem {
    ref: string;
    issues: string[];
    /**
     * The earlier version visitors see instead, if one still passes.
     */
    serving?: number;
}

const describeIssues = (error: z.ZodError): string[] =>
    error.issues.map((issue) => (issue.path.length === 0 ? issue.message : `${issue.path.join('.')}: ${issue.message}`));

/**
 * The cache tag a page's renders carry, and publishing drops.
 */
export const pageCacheTag = (name: string, site = DEFAULT_SITE): string =>
    site === DEFAULT_SITE ? `kizuna-cms:page:${name}` : `kizuna-cms:page:${site}:${name}`;

/**
 * The cache tag a document's reads carry. With `site`, the tag of a shared
 * document as that site reads it, which its own values refresh too.
 */
export const documentCacheTag = (ref: DocumentRef, site?: string): string =>
    `kizuna-cms:${formatRef(
        site === undefined || site === DEFAULT_SITE || ref.type === 'page'
            ? ref
            : {
                  ...ref,
                  site,
              }
    )}`;

/**
 * The cache tag every list of a collection carries, as the site given reads
 * it.
 */
export const collectionCacheTag = (name: string, site = DEFAULT_SITE): string =>
    site === DEFAULT_SITE ? `kizuna-cms:collection:${name}` : `kizuna-cms:collection:${site}:${name}`;

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

/**
 * The schema of the object holding the last segment of a dotted path, read
 * through objects and arrays, or `undefined` when the path leaves them.
 */
const containerSchemaAt = (schema: z.core.$ZodType, segments: readonly string[]): z.core.$ZodType | undefined => {
    let current: z.core.$ZodType | undefined = schema;
    for (const segment of segments) {
        const def = readDef(unwrapOptionalWrappers(current).inner);
        current = def.type === 'object' ? def.shape?.[segment] : def.type === 'array' && /^\d+$/.test(segment) ? def.element : undefined;
        if (current === undefined) return undefined;
    }
    return current;
};

/**
 * Whether a `null` sent for a path empties it: the key sits in an object, and
 * its schema takes the value left out but refuses `null`.
 */
const clearsWithNull = (schema: z.core.$ZodType, path: string): boolean => {
    const segments = path.split('.');
    const key = segments.pop()!;
    const container = containerSchemaAt(schema, segments);
    if (container === undefined) return false;
    const def = readDef(unwrapOptionalWrappers(container).inner);
    const field = def.type === 'object' ? def.shape?.[key] : undefined;
    return field !== undefined && z.safeParse(field, undefined).success && !z.safeParse(field, null).success;
};

/**
 * Removes the key at a dotted path from a copy of the content.
 */
const unsetAtPath = (content: Record<string, unknown>, path: string): Record<string, unknown> => {
    const segments = path.split('.');
    const key = segments.pop()!;
    const holder = segments.length === 0 ? content : getAtPath(content, segments.join('.'));
    if (holder === null || typeof holder !== 'object' || Array.isArray(holder)) return content;
    const { [key]: _, ...rest } = holder as Record<string, unknown>;
    return segments.length === 0 ? rest : setAtPath(content, segments.join('.'), rest);
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

/**
 * The field that names each item: the first that holds text.
 */
const labelFieldOf = (definition: Collection): string | undefined =>
    dataFields(definition.fields).find((field) => readDef(unwrapOptionalWrappers(field.schema).inner).type === 'string')?.name;

/**
 * What an item is called in lists: its first text field, or Untitled.
 */
const itemLabelOf = (content: Record<string, unknown>, labelField: string | undefined): string => {
    const label = labelField === undefined ? undefined : content[labelField];
    return typeof label === 'string' && label !== '' ? label : 'Untitled';
};

/**
 * One item as the editing list shows it. With `fields`, it carries their
 * stored values, and the labels of those holding a choice or an id.
 */
export interface EditorItem {
    id: string;
    ref: string;
    label: string;
    path: string | null;
    status: PageStatus;
    complete: boolean;
    updatedAt: string;
    updatedBy: string;
    parent?: string | null;
    treeLabel?: string;
    values?: Record<string, unknown>;
    labels?: Record<string, string>;
}

/**
 * A reference resolved to what it addresses: where it is stored, and the
 * definition its content follows.
 */
export interface Target {
    ref: DocumentRef;
    kind: Exclude<DocumentKind, 'media'>;
    /**
     * The site a page or a site's own document belongs to; the default site
     * for shared content.
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
    /**
     * For a site's values on a shared global or item, the shared document
     * they apply to.
     */
    shared?: DocumentRef;
}

/**
 * Whether a value counts as set, so a site's empty value shows the shared
 * one.
 */
const isSet = (value: unknown): boolean =>
    value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0);

/**
 * Whether a definition has fields that differ by site.
 */
export const variesBySite = (definition: ContentDefinition): boolean =>
    dataFields(definition.fields).some((field) => field.perSite === true || field.sites !== undefined);

/**
 * Whether a site shows and stores a field: every site, unless its `sites`
 * names others.
 */
export const fieldOnSite = (field: { sites?: readonly string[] }, site: string): boolean =>
    field.sites === undefined || site === DEFAULT_SITE || field.sites.includes(site);

/**
 * Where a document is served: a page's path, or the path an item's content
 * fills into the route that shows it. `undefined` for a global, an item no
 * page shows, and an item whose address fields are empty.
 */
export const addressOf = (target: Target, content: Record<string, unknown> | null | undefined): string | undefined =>
    target.path ?? (target.pattern === undefined ? undefined : fillPath(target.pattern, content));

/**
 * The path an item's collection names in `preview.url`, given the item as
 * its draft stands. `undefined` for anything else.
 */
export const collectionPreviewPath = (target: Target, content: Record<string, unknown> | null | undefined): string | undefined => {
    if (target.ref.type !== 'item') return undefined;
    const preview = (target.definition as Collection).preview;
    if (preview === undefined) return undefined;
    const path: unknown = preview.url({
        item: {
            ...content,
            id: target.ref.id,
        },
    });
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
        throw new Error(
            `defineCollection('${target.ref.collection}') has a preview.url that returned ${JSON.stringify(path)}. It returns a path on the site, like '/team'.`
        );
    }
    return path;
};

/**
 * The page the admin's Live Preview opens a document on: its collection's
 * `preview.url`, where it is served, or the first page that shows it. A
 * global shows on every page, so it opens on the front page. `null` for an
 * item no page shows.
 */
export const previewPathOf = (
    target: Target,
    content: Record<string, unknown> | null | undefined,
    usedOn: { pages: ReadonlyArray<{ path: string }> }
): string | null =>
    collectionPreviewPath(target, content) ??
    addressOf(target, content) ??
    usedOn.pages[0]?.path ??
    (target.kind === 'global' ? '/' : null);

/**
 * A collection, resolved: where its items are stored, what they follow, and
 * the routes that serve them.
 */
export interface Listing {
    name: string;
    /**
     * The site its items are stored under: the default site for a shared
     * collection, the site for a site's own.
     */
    site: string;
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
        throw new Error('Media needs a bucket: set CMS_S3_BUCKET, or pass `media.bucket` or `media.storage` to cms().');
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
    /**
     * Tells the draft preview, on every server instance, when a draft is saved.
     */
    readonly notices: DraftNotices;
    readonly media: MediaService;
    /**
     * The default site's pages.
     */
    readonly pages: PageMap;
    /**
     * Every site's pages, keyed by site name.
     */
    readonly sites: Record<string, PageMap>;
    /**
     * The shared globals.
     */
    readonly globals: Record<string, Global>;
    /**
     * The shared collections.
     */
    readonly collections: Record<string, Collection>;
    /**
     * Each site's own globals, keyed by site and then by name.
     */
    readonly siteGlobals: Record<string, Record<string, Global>>;
    /**
     * Each site's own collections, keyed by site and then by name.
     */
    readonly siteCollections: Record<string, Record<string, Collection>>;
    readonly identity: string;
    readonly roles: readonly string[] | undefined;
    readonly basePath: '' | `/${string}`;
    readonly mediaPath: string;
    private warned = new Set<string>();
    private readonly siteValueDefinitions = new Map<string, ContentDefinition | null>();

    /**
     * The framework's cache, draft mode and cookies, from the adapter, once
     * the config has assembled.
     */
    runtime: ContentRuntime | undefined;

    constructor(
        readonly options: ResolvedCmsOptions,
        private readonly api: PluginApi
    ) {
        this.store = new DocumentStore(options.db);
        this.notices = new DraftNotices(options.db);
        this.sites = Object.fromEntries(Object.entries(sitesOf(options)).map(([site, declared]) => [site, declared.pages]));
        this.pages = this.sites[DEFAULT_SITE] ?? {};
        this.globals = Object.fromEntries((options.globals ?? []).map((definition) => [definition.name, definition]));
        this.collections = Object.fromEntries((options.collections ?? []).map((definition) => [definition.name, definition]));
        const siteEntries = Object.entries(options.sites?.entries ?? {});
        this.siteGlobals = Object.fromEntries(
            siteEntries.map(([site, entry]) => [
                site,
                Object.fromEntries((entry.globals ?? []).map((definition) => [definition.name, definition])),
            ])
        );
        this.siteCollections = Object.fromEntries(
            siteEntries.map(([site, entry]) => [
                site,
                Object.fromEntries((entry.collections ?? []).map((definition) => [definition.name, definition])),
            ])
        );
        this.identity = options.auth.identity;
        this.roles =
            options.auth.roles === undefined
                ? undefined
                : typeof options.auth.roles === 'string'
                  ? [options.auth.roles]
                  : options.auth.roles;
        this.basePath = routePrefix(options.path);
        this.mediaPath = (options.media?.publicPath ?? `${options.apiPath ?? '/api'}${this.basePath}/content/media`).replace(/\/$/, '');
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

    /**
     * A shared collection, or with a site, that site's own.
     */
    collection(name: string, site = DEFAULT_SITE): Collection {
        const found = site === DEFAULT_SITE ? this.collections[name] : this.siteCollections[site]?.[name];
        if (found === undefined) {
            throw new CmsHttpError(404, {
                detail:
                    site === DEFAULT_SITE
                        ? `There is no collection named '${name}'.`
                        : `The ${site} site has no collection of its own named '${name}'.`,
            });
        }
        return found;
    }

    /**
     * A shared collection resolved, or with a site, that site's own.
     */
    listing(name: string, site = DEFAULT_SITE): Listing {
        const definition = this.collection(name, site);
        const routes =
            site === DEFAULT_SITE
                ? Object.entries(this.sites).flatMap(([pagesSite, pages]) => routesOf(definition.name, pages, pagesSite))
                : routesOf(definition.name, this.sites[site] ?? {}, site);
        const pathFields = [...new Set(routes.flatMap((route) => route.params))];
        return {
            name: definition.name,
            site,
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
                ...(site === DEFAULT_SITE
                    ? {}
                    : {
                          site,
                      }),
            }),
        };
    }

    /**
     * The collection a site's page shows: the site's own when it has one by
     * that name, the shared one otherwise.
     */
    servedListing(name: string, site: string): Listing {
        return this.listing(name, this.siteCollections[site]?.[name] === undefined ? DEFAULT_SITE : site);
    }

    /**
     * Every shared collection, and every site's own.
     */
    listings(): Listing[] {
        return [
            ...Object.keys(this.collections).map((name) => this.listing(name)),
            ...Object.entries(this.siteCollections).flatMap(([site, collections]) =>
                Object.keys(collections).map((name) => this.listing(name, site))
            ),
        ];
    }

    /**
     * The collection an item belongs to. `undefined` for anything else, and
     * for a site's values on a shared item.
     */
    listingOf(ref: DocumentRef): Listing | undefined {
        if (ref.type !== 'item') return undefined;
        if (ref.site !== undefined && ref.site !== DEFAULT_SITE && this.siteCollections[ref.site]?.[ref.collection] === undefined) {
            return undefined;
        }
        return this.listing(ref.collection, ref.site);
    }

    /**
     * What a site stores of a shared global or collection: its `perSite`
     * fields, each of which it may leave empty, and the fields whose `sites`
     * name it.
     */
    siteValuesOf(definition: ContentDefinition, site: string, what: string): ContentDefinition {
        if (!this.siteNames().includes(site)) throw new CmsHttpError(404, { detail: `There is no site named '${site}'.` });
        const key = `${site}:${definition.name}`;
        if (!this.siteValueDefinitions.has(key)) {
            const fields = dataFields(definition.fields)
                .filter((field) => field.perSite === true || field.sites?.includes(site) === true)
                .map(
                    ({ condition: _, ...field }): Field =>
                        field.perSite === true
                            ? {
                                  ...field,
                                  schema: field.schema.optional(),
                              }
                            : field
                );
            this.siteValueDefinitions.set(
                key,
                fields.length === 0
                    ? null
                    : {
                          name: definition.name,
                          ...(definition.label === undefined
                              ? {}
                              : {
                                    label: definition.label,
                                }),
                          fields,
                          schema: objectOf(fields),
                      }
            );
        }
        const found = this.siteValueDefinitions.get(key);
        if (found === null || found === undefined) {
            throw new CmsHttpError(404, {
                detail: `${what} has no field the ${site} site sets. Mark one \`perSite\`, or name the site in its \`sites\`.`,
            });
        }
        return found;
    }

    /**
     * Shared content as a site shows it: its fields for that site, with the
     * site's values in place of the shared ones it sets.
     */
    withSiteValues(
        definition: ContentDefinition,
        content: Record<string, unknown>,
        values: Record<string, unknown> | undefined,
        site: string
    ): Record<string, unknown> {
        const shown: Record<string, unknown> = {
            ...content,
        };
        for (const field of dataFields(definition.fields)) {
            if (!fieldOnSite(field, site)) {
                delete shown[field.name];
                continue;
            }
            const value = values?.[field.name];
            if (field.sites !== undefined) {
                if (value === undefined) delete shown[field.name];
                else shown[field.name] = value;
                continue;
            }
            if (field.perSite === true && isSet(value)) shown[field.name] = value;
        }
        return shown;
    }

    /**
     * Whether a site reads a document with values of its own: shared content
     * with fields that differ by site.
     */
    private readsSiteValues(ref: DocumentRef, site: string): boolean {
        if (site === DEFAULT_SITE || ref.type === 'page' || (ref.site !== undefined && ref.site !== DEFAULT_SITE)) return false;
        return variesBySite(this.target(ref).definition);
    }

    /**
     * The ref of a site's values on a shared document.
     */
    private siteValuesRef(ref: DocumentRef, site: string): DocumentRef {
        return {
            ...ref,
            site,
        } as DocumentRef;
    }

    /**
     * A site's own values on a shared document, `undefined` when it sets
     * none or has no field of its own there.
     */
    private async siteValues(ref: DocumentRef, site: string, copy: 'draft' | 'published'): Promise<Record<string, unknown> | undefined> {
        const definition = this.target(ref).definition;
        if (!dataFields(definition.fields).some((field) => field.perSite === true || field.sites?.includes(site) === true))
            return undefined;
        const values = this.siteValuesRef(ref, site);
        if (copy === 'draft') {
            const draft = await this.draft(values);
            if (draft !== undefined) return draft.content;
        }
        return (await this.published(values))?.content;
    }

    /**
     * The listing items stored under a site and a collection belong to, if
     * the config still declares it.
     */
    private storedListing(collection: string, site: string): Listing | undefined {
        const declared = site === DEFAULT_SITE ? this.collections[collection] : this.siteCollections[site]?.[collection];
        return declared === undefined ? undefined : this.listing(collection, site);
    }

    addressOf(target: Target, content: Record<string, unknown> | null | undefined): string | undefined {
        return addressOf(target, content);
    }

    /**
     * The id of the item whose address fields hold these values, read from
     * the draft or the published copy.
     */
    async findItem(
        collection: string,
        params: Record<string, string>,
        copy: 'draft' | 'published',
        site = DEFAULT_SITE
    ): Promise<string | undefined> {
        const listing = this.listing(collection, site);
        const result = await this.store.query({
            kind: 'item',
            keyPrefix: listing.keyPrefix,
            site: listing.site,
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
            const listing = this.servedListing(entry.page.collection.name, site);
            const id =
                (await this.findItem(listing.name, params, 'draft', listing.site)) ??
                (await this.findItem(listing.name, params, 'published', listing.site));
            if (id !== undefined) return listing.refOf(id);
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
            // Stored by name, so moving the route's folder keeps the content.
            return {
                ref,
                kind: 'page',
                site,
                key: ref.name,
                definition: entry.page,
                path: entry.path,
            };
        }
        if (ref.type === 'global') {
            const site = ref.site ?? DEFAULT_SITE;
            const shared = this.globals[ref.name];
            if (site !== DEFAULT_SITE && shared !== undefined) {
                return {
                    ref,
                    kind: 'global',
                    site,
                    key: ref.name,
                    definition: this.siteValuesOf(shared, site, `The ${ref.name} global`),
                    shared: {
                        type: 'global',
                        name: ref.name,
                    },
                };
            }
            const found = site === DEFAULT_SITE ? shared : this.siteGlobals[site]?.[ref.name];
            if (found === undefined) {
                throw new CmsHttpError(404, {
                    detail:
                        site === DEFAULT_SITE
                            ? `There is no global named '${ref.name}'.`
                            : `The ${site} site has no global of its own named '${ref.name}'.`,
                });
            }
            return {
                ref,
                kind: 'global',
                site,
                key: ref.name,
                definition: found,
            };
        }
        if (ref.site !== undefined && ref.site !== DEFAULT_SITE && this.siteCollections[ref.site]?.[ref.collection] === undefined) {
            const shared = this.listing(ref.collection);
            return {
                ref,
                kind: 'item',
                site: ref.site,
                key: `${shared.keyPrefix}${ref.id}`,
                definition: this.siteValuesOf(shared.definition, ref.site, `The ${ref.collection} collection`),
                shared: shared.refOf(ref.id),
            };
        }
        const listing = this.listing(ref.collection, ref.site);
        return {
            ref,
            kind: 'item',
            site: listing.site,
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

    /**
     * The row with both copies brought up to the definition's latest
     * migration step, in memory. Reads never write: a save stores the result,
     * and `kizuna cms migrate-content` stores it for every document.
     */
    migrated(target: Target, found: DocumentRow | undefined): DocumentRow | undefined {
        if (found === undefined || pendingMigrations(target.definition, found.migrationVersion).length === 0) return found;
        const migration = migrationOf(target.definition);
        return {
            ...found,
            published: found.published === null ? null : migration.run(found.published, found.migrationVersion),
            draft: found.draft === null ? null : migration.run(found.draft, found.migrationVersion),
            migrationVersion: migration.version,
        };
    }

    /**
     * The stored document, brought up to its definition's latest migration
     * step.
     */
    async document(ref: DocumentRef): Promise<{ target: Target; row: DocumentRow | undefined }> {
        const target = this.target(ref);
        return {
            target,
            row: this.migrated(target, await this.store.get(target.kind, target.key, target.site)),
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
        return parsed.success ? (parsed.data as Record<string, unknown>) : undefined;
    }

    private warnOnce(key: string, message: string): void {
        if (this.warned.has(key)) return;
        this.warned.add(key);
        console.warn(`[kizuna-cms] ${message}`);
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
     * Published content as a site shows it.
     */
    async publishedOn(
        ref: DocumentRef,
        site: string
    ): Promise<{ content: Record<string, unknown>; version: number; updatedAt: Date } | undefined> {
        const shared = await this.published(ref);
        if (shared === undefined || !this.readsSiteValues(ref, site)) return shared;
        return {
            ...shared,
            content: this.withSiteValues(this.target(ref).definition, shared.content, await this.siteValues(ref, site, 'published'), site),
        };
    }

    /**
     * The draft as a site shows it in draft mode: the shared draft, or with
     * `fallBack` the published copy, with the site's draft values, or else
     * its published ones, in place.
     */
    async draftOn(ref: DocumentRef, site: string, fallBack: boolean): Promise<Record<string, unknown> | undefined> {
        const content = (await this.draft(ref))?.content ?? (fallBack ? (await this.published(ref))?.content : undefined);
        if (content === undefined || !this.readsSiteValues(ref, site)) return content;
        return this.withSiteValues(this.target(ref).definition, content, await this.siteValues(ref, site, 'draft'), site);
    }

    /**
     * Published content as it is stored, image references and crops
     * included, for copying between environments. When the live copy no
     * longer passes its schema, the newest earlier version that went live and
     * still passes stands in, so a schema change that slipped past a check
     * shows older content instead of taking the page down.
     */
    async publishedAsStored(ref: DocumentRef): Promise<{ content: Record<string, unknown>; version: number; updatedAt: Date } | undefined> {
        const { target, row } = await this.document(ref);
        if (row === undefined || row.publishedVersion === null || row.published === null) return undefined;
        const live = target.definition.schema.safeParse(row.published);
        if (live.success) {
            return {
                content: live.data as Record<string, unknown>,
                version: row.publishedVersion,
                updatedAt: row.updatedAt,
            };
        }
        const label = formatRef(ref);
        const issues = describeIssues(live.error).join('; ');
        const earlier = await this.lastPassing(target, row);
        if (earlier !== undefined) {
            this.warnOnce(
                `${label}@${row.publishedVersion}`,
                `The published content of '${label}' no longer passes its schema (${issues}). Visitors see version ${earlier.version} until it is fixed and published again.`
            );
            return earlier;
        }
        this.warnOnce(
            `${label}@${row.publishedVersion}`,
            `The published content of '${label}' no longer passes its schema (${issues}), and no earlier version does, so it reads as unpublished.`
        );
        return undefined;
    }

    /**
     * The newest version before the live one that went live and still passes
     * the schema once migrated.
     */
    private async lastPassing(
        target: Target,
        row: DocumentRow
    ): Promise<{ content: Record<string, unknown>; version: number; updatedAt: Date } | undefined> {
        const migration = migrationOf(target.definition);
        for (const earlier of await this.store.publishedVersions(row.id, row.publishedVersion ?? 0)) {
            const parsed = target.definition.schema.safeParse(migration.run(earlier.data, earlier.migrationVersion));
            if (!parsed.success) continue;
            return {
                content: parsed.data as Record<string, unknown>,
                version: earlier.version,
                updatedAt: earlier.publishedAt ?? earlier.createdAt,
            };
        }
        return undefined;
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
            label: string | null;
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
                const listing = this.servedListing(entry.page.collection.name, site);
                for (const row of await this.store.list('item', listing.site)) {
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
                label: state.target.definition.label ?? null,
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

    /**
     * The shared globals, or with a site, its own, each with its status.
     */
    async globalSummaries(
        site = DEFAULT_SITE
    ): Promise<
        Array<{ name: string; label: string | null; group: string | null; status: PageStatus; version: number; updatedAt: string | null }>
    > {
        const summaries = [];
        const globals = site === DEFAULT_SITE ? this.globals : this.siteGlobals[site];
        if (globals === undefined) throw new CmsHttpError(404, { detail: `There is no site named '${site}'.` });
        for (const [name, definition] of Object.entries(globals)) {
            const state = await this.draftState({
                type: 'global',
                name,
                ...(site === DEFAULT_SITE
                    ? {}
                    : {
                          site,
                      }),
            });
            summaries.push({
                name,
                label: definition.label ?? null,
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
        const schema = dataFields(listing.definition.fields).find((candidate) => candidate.name === field)!.schema;
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
        },
        site = DEFAULT_SITE,
        readingSite = site
    ): Promise<{ items: Array<Record<string, unknown>>; next: string | undefined }> {
        const listing = this.listing(name, site);
        const result = await this.store.query({
            kind: 'item',
            keyPrefix: listing.keyPrefix,
            site: listing.site,
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
            const migrated = this.migrated(target, row)!;
            const content =
                (query.draft ? this.passes(target, migrated.draft) : undefined) ??
                this.passes(target, migrated.published) ??
                (migrated.published === null ? undefined : (await this.publishedAsStored(target.ref))?.content);
            if (content === undefined) continue;
            const presented = await this.present(target, content);
            items.push(
                this.readsSiteValues(target.ref, readingSite)
                    ? this.withSiteValues(
                          listing.definition,
                          presented,
                          await this.siteValues(target.ref, readingSite, query.draft ? 'draft' : 'published'),
                          readingSite
                      )
                    : presented
            );
        }
        return {
            items,
            next: result.next,
        };
    }

    /**
     * The shared collections, or with a site, its own, with what editors call
     * each and how many items it holds.
     */
    async collectionSummaries(site = DEFAULT_SITE): Promise<Array<{ name: string; label: string; count: number }>> {
        const collections = site === DEFAULT_SITE ? this.collections : this.siteCollections[site];
        if (collections === undefined) throw new CmsHttpError(404, { detail: `There is no site named '${site}'.` });
        const rows = await this.store.list('item', site);
        return Object.values(collections).map((definition) => {
            const listing = this.listing(definition.name, site);
            return {
                name: definition.name,
                label:
                    definition.label ??
                    definition.name
                        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
                        .toLowerCase()
                        .replace(/^./, (first) => first.toUpperCase()),
                count: rows.filter((row) => row.key.startsWith(listing.keyPrefix)).length,
            };
        });
    }

    /**
     * Every item of a collection as editors list it, by title.
     */
    async editorItems(name: string, site = DEFAULT_SITE): Promise<EditorItem[]> {
        return (await this.editorList(name, {}, site)).items;
    }

    /**
     * The fields a collection's editing list can show: its indexes, then its
     * `columns`.
     */
    listColumnsOf(listing: Listing): string[] {
        return [...new Set([...listing.indexes, ...(listing.definition.columns ?? [])])];
    }

    /**
     * Items of a collection as editors list them, drafts and incomplete items
     * included: searched, filtered and sorted by the store, one page of them,
     * each with its status and, when a page shows it, its address, and how
     * many match in all.
     */
    async editorList(name: string, query: ItemListQuery, site = DEFAULT_SITE): Promise<{ items: EditorItem[]; total: number }> {
        const listing = this.listing(name, site);
        const definition = listing.definition;
        const labelField = labelFieldOf(definition);
        const columns = this.listColumnsOf(listing);
        const unknown = (query.fields ?? []).filter((field) => !columns.includes(field));
        if (unknown.length > 0) {
            throw new CmsHttpError(400, {
                detail: `'${unknown[0]}' is not a column of ${name}. Its list shows ${columns.join(', ') || 'no fields'}.`,
            });
        }
        const groups = await Promise.all(
            (query.groups ?? []).map((group) => Promise.all(group.map((condition) => this.editingCondition(listing, condition))))
        );
        const orderBy = query.orderBy ?? 'title';
        const result = await this.store.editingQuery({
            kind: 'item',
            keyPrefix: listing.keyPrefix,
            site: listing.site,
            groups,
            ...(query.search === undefined || query.search.trim() === ''
                ? {}
                : {
                      search: {
                          term: query.search.trim(),
                          fields: [...new Set([...(labelField === undefined ? [] : [labelField]), ...(listing.routes[0]?.params ?? [])])],
                      },
                  }),
            orderBy:
                orderBy === 'updatedAt' || orderBy === 'status'
                    ? orderBy
                    : orderBy === 'title' && !listing.indexes.includes('title')
                      ? labelField === undefined
                          ? 'key'
                          : {
                                field: labelField,
                                type: 'text',
                            }
                      : this.sortIndexOf(listing, orderBy),
            direction: query.direction ?? (orderBy === 'updatedAt' ? 'desc' : 'asc'),
            ...(query.limit === undefined
                ? {}
                : {
                      limit: query.limit,
                  }),
            offset: query.offset ?? 0,
        });
        const placements = definition.tree === undefined ? undefined : await this.treePlacements(listing);
        const items = result.rows.map((stored): EditorItem & { content: Record<string, unknown> } => {
            const id = stored.key.slice(listing.keyPrefix.length);
            const row = this.migrated(this.target(listing.refOf(id)), stored)!;
            const content = row.draft ?? row.published ?? {};
            const placement = placements?.get(id);
            return {
                id,
                ref: formatRef(listing.refOf(id)),
                label: itemLabelOf(content, labelField),
                path: listing.routes[0] === undefined ? null : (fillPath(listing.routes[0].pattern, content) ?? null),
                status: this.statusOf(row, stored.latestVersion),
                complete: missingFields(definition, row.draft).length === 0 && row.draft !== null,
                updatedAt: row.updatedAt.toISOString(),
                updatedBy: row.updatedBy,
                ...(placement === undefined
                    ? definition.tree === undefined
                        ? {}
                        : {
                              parent: null,
                              treeLabel: itemLabelOf(content, labelField),
                          }
                    : placement),
                content,
            };
        });
        const fields = query.fields ?? [];
        const labels = fields.length === 0 ? undefined : await this.columnLabels(listing, fields, items, query.headers ?? {});
        return {
            items: items.map(({ content, ...item }) =>
                fields.length === 0
                    ? item
                    : {
                          ...item,
                          values: Object.fromEntries(fields.map((field) => [field, content[field] ?? null])),
                          labels: Object.fromEntries(
                              fields.flatMap((field) => {
                                  const label = labels?.get(field)?.(content[field]);
                                  return label === undefined ? [] : [[field, label]];
                              })
                          ),
                      }
            ),
            total: result.total,
        };
    }

    /**
     * How the editing list sorts by a field, which must be an index.
     */
    private sortIndexOf(listing: Listing, field: string): ListField {
        if (!listing.indexes.includes(field)) {
            throw new CmsHttpError(400, {
                detail: `The list of ${listing.name} cannot sort by '${field}'. It sorts by ${['title', 'status', 'updatedAt', ...listing.indexes].join(', ')}.`,
            });
        }
        return this.indexOf(listing, field);
    }

    /**
     * One condition as the store reads it: the item's status, or a field of
     * the collection's indexes holding the value, or with `within` and
     * `outside`, the value or an item under it.
     */
    private async editingCondition(listing: Listing, condition: ItemCondition): Promise<EditingCondition> {
        const negate = condition.operator === 'isNot' || condition.operator === 'outside';
        const nested = condition.operator === 'within' || condition.operator === 'outside';
        if (condition.field === 'status') {
            if (!ITEM_STATUSES.includes(condition.value) || nested) {
                throw new CmsHttpError(400, {
                    detail: `A filter on status is status:is:<status> or status:isNot:<status>, with ${ITEM_STATUSES.join(', ')}.`,
                });
            }
            return {
                kind: 'status',
                values: [condition.value],
                negate,
            };
        }
        if (!listing.indexes.includes(condition.field)) {
            throw new CmsHttpError(400, {
                detail: `The list of ${listing.name} cannot filter by '${condition.field}', since it is not one of its indexes. It filters by ${['status', ...listing.indexes].join(', ')}.`,
            });
        }
        const field = this.indexOf(listing, condition.field);
        const schema = dataFields(listing.definition.fields).find((candidate) => candidate.name === condition.field)!.schema;
        const list = readDef(unwrapOptionalWrappers(schema).inner).type === 'array';
        if (nested) {
            const brand = brandOf(schema);
            const held = brand === undefined ? undefined : this.listingFor(brand, listing.site);
            if (held?.definition.tree === undefined) {
                throw new CmsHttpError(400, {
                    detail: `The ${condition.field} field holds no ids of a collection with a tree, so nothing sits under '${condition.value}'.`,
                });
            }
            return {
                kind: 'field',
                field,
                list,
                values: [...descendantsOf(await loadParents(this, held, 'latest'), condition.value)],
                negate,
            };
        }
        const value =
            list || field.type === 'text' ? condition.value : field.type === 'numeric' ? Number(condition.value) : condition.value;
        if (
            (!list && field.type === 'numeric' && (condition.value.trim() === '' || !Number.isFinite(value))) ||
            (!list && field.type === 'boolean' && condition.value !== 'true' && condition.value !== 'false')
        ) {
            throw new CmsHttpError(400, {
                detail: `The ${condition.field} field holds ${field.type === 'numeric' ? 'a number' : 'true or false'}, not '${condition.value}'.`,
            });
        }
        return {
            kind: 'field',
            field,
            list,
            values: [value],
            negate,
        };
    }

    /**
     * Each item's parent and its labels from the top of the tree, for a
     * collection with a `tree`, from every item it holds.
     */
    private async treePlacements(listing: Listing): Promise<Map<string, { parent: string | null; treeLabel: string }>> {
        const labelField = labelFieldOf(listing.definition);
        const parents = new Map<string, string | undefined>();
        const items: Array<{ id: string; label: string }> = [];
        for (const stored of await this.store.list('item', listing.site)) {
            if (!stored.key.startsWith(listing.keyPrefix)) continue;
            const id = stored.key.slice(listing.keyPrefix.length);
            const row = this.migrated(this.target(listing.refOf(id)), stored)!;
            const content = row.draft ?? row.published ?? {};
            items.push({
                id,
                label: itemLabelOf(content, labelField),
            });
            parents.set(id, parentIn(content, listing.definition.tree!));
        }
        return new Map(
            placeInTree(items, parents).map((item) => [
                item.id,
                {
                    parent: item.parent,
                    treeLabel: item.treeLabel,
                },
            ])
        );
    }

    /**
     * For each column holding a choice or an id, what an editor reads for a
     * value of it: an option's label, or the title of the item or record an
     * id names, a list of them joined by commas. A relationship whose
     * `options` fails leaves its ids unlabelled.
     */
    private async columnLabels(
        listing: Listing,
        fields: readonly string[],
        items: ReadonlyArray<{ content: Record<string, unknown> }>,
        headers: Record<string, string>
    ): Promise<Map<string, (value: unknown) => string | undefined>> {
        const labels = new Map<string, (value: unknown) => string | undefined>();
        const each = (read: (entry: string) => string | undefined) => (value: unknown) => {
            const entries = (Array.isArray(value) ? value : [value]).filter((entry): entry is string => typeof entry === 'string');
            const found = entries.map(read);
            return entries.length === 0 || found.some((label) => label === undefined) ? undefined : found.join(', ');
        };
        for (const name of fields) {
            const field = dataFields(listing.definition.fields).find((candidate) => candidate.name === name)!;
            const options = field.options;
            if (options !== undefined) {
                labels.set(
                    name,
                    each((entry) => options[entry] ?? entry)
                );
                continue;
            }
            const brand = this.referenceBrandOf(field.schema);
            if (brand === undefined) continue;
            const ids = [
                ...new Set(
                    items.flatMap((item) => {
                        const value = item.content[name];
                        return (Array.isArray(value) ? value : [value]).filter((entry): entry is string => typeof entry === 'string');
                    })
                ),
            ];
            const named = await this.idLabels(brand, ids, headers);
            labels.set(
                name,
                each((entry) => named.get(entry))
            );
        }
        return labels;
    }

    /**
     * The title of each id of a brand: an item's, by its path in the tree
     * when it has one, or what a relationship's `options` names it.
     */
    private async idLabels(brand: string, ids: readonly string[], headers: Record<string, string>): Promise<Map<string, string>> {
        const named = new Map<string, string>();
        if (ids.length === 0) return named;
        const owned = this.listingFor(brand);
        if (owned !== undefined) {
            const placements = owned.definition.tree === undefined ? undefined : await this.treePlacements(owned);
            const labelField = labelFieldOf(owned.definition);
            for (const id of ids) {
                const stored = await this.store.get('item', `${owned.keyPrefix}${id}`, owned.site);
                if (stored === undefined) continue;
                const row = this.migrated(this.target(owned.refOf(id)), stored)!;
                named.set(id, placements?.get(id)?.treeLabel ?? itemLabelOf(row.draft ?? row.published ?? {}, labelField));
            }
            return named;
        }
        for (let start = 0; start < ids.length; start += 50) {
            try {
                for (const option of await this.searchItems(brand, {
                    ids: ids.slice(start, start + 50),
                    headers,
                })) {
                    named.set(option.id, option.label);
                }
            } catch {
                // The ids show as they are stored.
            }
        }
        return named;
    }

    /**
     * A new item of a collection, as a draft with the values given.
     */
    async createItem(
        name: string,
        values: Record<string, unknown>,
        caller: Caller,
        author: string,
        site = DEFAULT_SITE
    ): Promise<DraftState> {
        const listing = this.listing(name, site);
        const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
        const id = Array.from(randomBytes(12), (byte) => alphabet[byte % alphabet.length]).join('');
        const ref = listing.refOf(id);
        if (Object.keys(values).length === 0) {
            await this.store.saveDraft({
                kind: 'item',
                key: this.target(ref).key,
                site: listing.site,
                draft: {},
                author,
                summary: 'Created',
                migration: migrationOf(listing.definition),
            });
            await this.notices.publish({
                ref: formatRef(ref),
                paths: null,
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

    async deleteItem(name: string, id: string, site = DEFAULT_SITE): Promise<void> {
        const listing = this.listing(name, site);
        const ref = listing.refOf(id);
        const target = this.target(ref);
        if (!(await this.store.delete('item', target.key, target.site))) {
            throw new CmsHttpError(404, { detail: `There is no item '${id}' in '${listing.name}'.` });
        }
        await this.revalidateDocument(ref);
    }

    /**
     * The tool name of the CMS's own search route, which finds ids for any
     * collection or relationship, once the api has assembled.
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
                (route as RouteDefinition).path.endsWith(`${this.basePath}/editing/items/:brand`) &&
                (route as RouteDefinition).tool !== undefined
        );
        return found === undefined ? undefined : toToolName(found.routeKey);
    }

    /**
     * The collection whose ids carry a brand, so a reference to one of its
     * items needs no relationship.
     */
    listingFor(brand: string, site = DEFAULT_SITE): Listing | undefined {
        const found = this.listings().filter((candidate) => candidate.brand === brand);
        return found.find((candidate) => candidate.site === site) ?? found[0];
    }

    /**
     * The relationship whose ids carry a brand.
     */
    relationshipFor(brand: string): CmsRelationship | undefined {
        return (this.options.relationships ?? []).find((relationship) => brandOf(relationship.id) === brand);
    }

    /**
     * The brand of a field's ids when a collection or relationship holds
     * them, which is what the editor's picker searches. A brand on a plain
     * value, like a `PhoneNumber`, answers `undefined`.
     */
    referenceBrandOf(schema: z.core.$ZodType): string | undefined {
        const brand = brandOf(schema);
        return brand !== undefined && this.holdsIds(brand) ? brand : undefined;
    }

    private holdsIds(brand: string): boolean {
        return this.listingFor(brand) !== undefined || this.relationshipFor(brand) !== undefined;
    }

    /**
     * A field's JSON Schema as `describe` hands it out. It keeps `brand` only
     * where a collection or relationship holds the ids, so the editor offers a
     * picker there and an ordinary input everywhere else.
     */
    fieldJsonSchema(schema: z.core.$ZodType): Record<string, unknown> {
        return z.toJSONSchema(schema as z.ZodType, {
            unrepresentable: 'any',
            reused: 'inline',
            io: 'input',
            override: (context) => {
                encodeForWire(context);
                const brand = context.jsonSchema.brand;
                if (typeof brand === 'string' && !this.holdsIds(brand)) delete context.jsonSchema.brand;
            },
        }) as Record<string, unknown>;
    }

    /**
     * The relationship with a name, for `invalidate`.
     */
    relationship(name: string): CmsRelationship {
        const found = (this.options.relationships ?? []).find((relationship) => relationship.name === name);
        if (found === undefined) {
            const known = (this.options.relationships ?? []).map((relationship) => relationship.name);
            throw new CmsHttpError(404, {
                detail: `There is no relationship named '${name}'.${known.length === 0 ? ' Define one with defineRelationship().' : ` The CMS knows ${known.join(', ')}.`}`,
            });
        }
        return found;
    }

    /**
     * What the picker lists for a brand: the items of the collection it
     * names, or what its relationship's `options` answers, run as the editor.
     */
    async searchItems(
        brand: string,
        input: {
            query?: string;
            ids?: readonly string[];
            headers: Record<string, string>;
        }
    ): Promise<Array<RelationshipOption & { parent?: string | null; treeLabel?: string }>> {
        const owned = this.listingFor(brand);
        if (owned !== undefined) {
            const items = await this.editorItems(owned.name, owned.site);
            const term = (input.query ?? '').toLowerCase();
            return items
                .filter((item) =>
                    input.ids === undefined
                        ? term === '' || (item.treeLabel ?? item.label).toLowerCase().includes(term)
                        : input.ids.includes(item.id)
                )
                .slice(0, 50)
                .map((item) => ({
                    id: item.id,
                    label: item.label,
                    ...(item.treeLabel === undefined
                        ? {}
                        : {
                              parent: item.parent ?? null,
                              treeLabel: item.treeLabel,
                          }),
                }));
        }
        const relationship = this.relationshipFor(brand);
        if (relationship === undefined) {
            throw new CmsHttpError(404, {
                detail: `No collection or relationship holds ids of the brand '${brand}'. Define a relationship for it with defineRelationship().`,
            });
        }
        let found: readonly RelationshipOption[];
        try {
            found = await relationship.options({
                ...(input.query === undefined
                    ? {}
                    : {
                          query: input.query,
                      }),
                ...(input.ids === undefined
                    ? {}
                    : {
                          ids: [...input.ids],
                      }),
                headers: input.headers,
            });
        } catch (error) {
            throw new CmsHttpError(502, {
                detail: `The options of the ${relationship.name} relationship failed: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
        return found.slice(0, 50).map((option) => ({
            id: String(option.id),
            label: option.label,
            ...(option.image === undefined
                ? {}
                : {
                      image: option.image,
                  }),
            ...(option.detail === undefined
                ? {}
                : {
                      detail: option.detail,
                  }),
        }));
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
        const relationship = this.relationshipFor(brand);
        return relationship === undefined || own === undefined
            ? `${what}.`
            : `${what}; ids of ${relationship.name}, found with ${own}, brand ${brand}.`;
    }

    /**
     * Every field of a document as editors and tools meet it. With sites,
     * each is marked `Shared` or with the label of the site whose value it
     * is, and a site's value carries the shared one it stands in for.
     */
    describe(
        ref: DocumentRef,
        draft: Record<string, unknown> | null,
        caller: Caller,
        shared?: Record<string, unknown> | null
    ): z.output<typeof import('./wire.js').DescribedFieldSchema>[] {
        const target = this.target(ref);
        const { definition } = target;
        const listing = this.listingOf(ref);
        const belongsTo =
            this.siteNames().length === 0
                ? undefined
                : target.site === DEFAULT_SITE
                  ? 'Shared'
                  : String(this.siteInfo(target.site)['label']);
        const declared = dataFields(definition.fields);
        const described: z.output<typeof import('./wire.js').DescribedFieldSchema>[] = [];
        const push = (field: DescribedField, parent: string | undefined): void => {
            const own = parent === undefined ? declared.find((candidate) => candidate.name === field.path) : undefined;
            if (own !== undefined && own.sites !== undefined && !own.sites.includes(target.site)) return;
            const sharedValue =
                target.shared !== undefined && own?.perSite === true ? getAtPath(shared ?? undefined, field.path) : undefined;
            const brand = this.referenceBrandOf(field.schema);
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
            const hidden = draft !== null && hiddenIn(field, draft, parent);
            const description = [
                field.description,
                brand === undefined ? undefined : this.brandHint(brand, isList),
                field.blocks === undefined ? undefined : blocksHint(field.blocks),
                address,
                field.condition === undefined ? undefined : conditionText(field.condition),
            ]
                .filter(Boolean)
                .join(' ');
            const help = [
                field.description,
                route === undefined ? undefined : 'In the address, so changing it after publishing breaks links.',
            ]
                .filter(Boolean)
                .join(' ');
            described.push({
                path: field.path,
                name: field.name,
                ...(field.label === undefined ? {} : { label: field.label }),
                ...(field.options === undefined ? {} : { options: { ...field.options } }),
                ...(description === '' ? {} : { description }),
                ...(help === '' ? {} : { help }),
                ...(field.block === undefined ? {} : { block: field.block }),
                ...(field.blocks === undefined
                    ? {}
                    : {
                          blocks: blocksForWire(field.blocks),
                      }),
                ...(parent === undefined ? {} : { parent }),
                ...(field.position === undefined
                    ? {}
                    : {
                          position: field.position,
                      }),
                ...(field.width === undefined
                    ? {}
                    : {
                          width: field.width,
                      }),
                ...(field.layout.length === 0
                    ? {}
                    : {
                          layout: field.layout,
                      }),
                readOnly: field.readOnly,
                required: field.required,
                ...(field.condition === undefined
                    ? {}
                    : {
                          condition: field.condition,
                      }),
                ...(hidden
                    ? {
                          hidden,
                      }
                    : {}),
                writable: pathRefusal(definition.fields, field.path, caller) === undefined,
                ...(roles === undefined ? {} : { roles }),
                ...(brand === undefined ? {} : { brand }),
                ...(brand === undefined ? {} : { searchTool: this.ownSearchTool() ?? `editing.searchItems` }),
                schema: this.fieldJsonSchema(field.schema),
                ...(draft === null ? {} : { value: getAtPath(draft, field.path) }),
                ...(belongsTo === undefined
                    ? {}
                    : {
                          belongsTo,
                      }),
                ...(sharedValue === undefined
                    ? {}
                    : {
                          sharedValue,
                      }),
            });
            for (const inner of field.fields ?? []) push(inner, field.path);
        };
        for (const field of describeFields(definition)) push(field, undefined);
        return described;
    }

    /**
     * The tabs, rows and collapsibles that arrange a document's fields.
     */
    describeLayout(ref: DocumentRef): z.output<typeof import('./wire.js').DescribedLayoutSchema>[] {
        return describeLayout(this.target(ref).definition).map((item) => ({
            id: item.id,
            type: item.type,
            ...(item.label === undefined
                ? {}
                : {
                      label: item.label,
                  }),
            ...(item.position === undefined
                ? {}
                : {
                      position: item.position,
                  }),
        }));
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
        const row = this.migrated(target, await this.store.get(target.kind, target.key, target.site));
        const fields = target.definition.fields;
        const paths = Object.keys(input.changes);
        if (paths.length === 0) throw new CmsHttpError(400, { detail: 'No changes were sent.' });
        if (target.shared !== undefined && (await this.store.get(target.kind, target.key, DEFAULT_SITE)) === undefined) {
            throw new CmsHttpError(404, {
                detail: `'${formatRef(target.shared)}' has no content yet. Save the shared item first, then the values the ${target.site} site sets.`,
            });
        }
        for (const path of paths) {
            const top = dataFields(fields).find((field) => field.name === path.split('.')[0]);
            if (top !== undefined && top.sites !== undefined && !top.sites.includes(target.site)) {
                throw new CmsHttpError(422, {
                    detail: `'${top.name}' is stored by only the ${top.sites.join(', ')} site${top.sites.length === 1 ? '' : 's'}. Set it on ${formatRef(this.siteValuesRef(input.ref, top.sites[0]!))}.`,
                    errors: [
                        {
                            code: 'custom',
                            path: path.split('.'),
                            message: 'Set per site',
                        },
                    ],
                });
            }
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
        for (const path of paths) {
            const value = input.changes[path];
            // JSON has no undefined, so null is how a save empties a field that may be left out.
            draft =
                value === null && clearsWithNull(target.definition.schema, path) ? unsetAtPath(draft, path) : setAtPath(draft, path, value);
        }
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
        await this.assertMediaOnSite(target, stored);
        const listing = this.listingOf(input.ref);
        if (listing !== undefined && paths.some((path) => listing.pathFields.includes(path.split('.')[0]!))) {
            await this.assertFreeAddress(listing, target.key, stored);
        }
        if (listing?.definition.tree !== undefined && paths.includes(listing.definition.tree)) {
            await this.assertNoLoop(input.ref, stored, 'latest');
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
                migration: migrationOf(target.definition),
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
        await this.notices.publish({
            ref: formatRef(input.ref),
            paths,
        });
        return this.draftState(input.ref);
    }

    /**
     * Refuses an image of another site: shared content holds shared images,
     * and a site's content its own and shared ones.
     */
    private async assertMediaOnSite(target: Target, content: Record<string, unknown>): Promise<void> {
        if (this.siteNames().length === 0) return;
        for (const id of mediaIdsOf(target.definition, content)) {
            const owner = (await this.media.get(id))?.site;
            if (owner === undefined || owner === target.site) continue;
            throw new CmsHttpError(422, {
                detail:
                    target.site === DEFAULT_SITE
                        ? `The image '${id}' belongs to the ${owner} site, so shared content cannot hold it. Use a shared image.`
                        : `The image '${id}' belongs to the ${owner} site. Use one of the ${target.site} site's images, or a shared one.`,
                errors: [],
            });
        }
    }

    /**
     * Which library a media route works in: a declared site's, or the shared
     * one when `site` is left out.
     */
    mediaSiteOf(site: string | undefined): string | undefined {
        if (site === undefined) return undefined;
        if (!this.siteNames().includes(site)) throw new CmsHttpError(404, { detail: `There is no site named '${site}'.` });
        return site;
    }

    /**
     * Refuses a change to an image from another library than its own.
     */
    assertOwnMedia(record: MediaRecord, site: string | undefined): void {
        if (record.site === site) return;
        throw new CmsHttpError(403, {
            detail:
                record.site === undefined
                    ? `The image '${record.id}' is shared. Change it in the shared library.`
                    : `The image '${record.id}' belongs to the ${record.site} site. Change it in that site's library.`,
        });
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
                    site: listing.site,
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

    /**
     * Refuses a parent that is the item itself or sits under it, in a
     * collection with a `tree`, among each item's latest or published copy.
     */
    private async assertNoLoop(
        ref: DocumentRef,
        content: Record<string, unknown> | null | undefined,
        copy: 'latest' | 'published'
    ): Promise<void> {
        const listing = this.listingOf(ref);
        const tree = listing?.definition.tree;
        if (listing === undefined || tree === undefined || ref.type !== 'item') return;
        const refusal = loopRefusal(listing, await loadParents(this, listing, copy), ref.id, parentIn(content, tree));
        if (refusal !== undefined) {
            throw new CmsHttpError(409, {
                detail: refusal,
            });
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
        await this.assertNoLoop(ref, state.row?.draft, 'published');
        await this.store.publish(state.target.kind, state.target.key, author, state.target.site);
        await this.revalidateDocument(ref);
        return this.draftState(ref);
    }

    /**
     * Withdraws the published copy and drops the same cached reads publishing
     * does. The draft and every version stay.
     */
    async unpublish(ref: DocumentRef, author: string): Promise<DraftState> {
        const { target, row } = await this.document(ref);
        if (row === undefined && ref.type === 'item') {
            throw new CmsHttpError(404, {
                detail: `There is no item '${ref.id}' in '${ref.collection}'.`,
            });
        }
        if ((await this.store.unpublish(target.kind, target.key, author, target.site)) === undefined) {
            throw new CmsHttpError(409, {
                detail: `'${formatRef(ref)}' is not published.`,
            });
        }
        await this.revalidateDocument(ref);
        return this.draftState(ref);
    }

    /**
     * An earlier version's content, migrated to the current schema.
     */
    async versionContent(
        ref: DocumentRef,
        version: number
    ): Promise<{ content: Record<string, unknown>; summary: string | null; createdAt: Date; createdBy: string }> {
        const { target, row } = await this.document(ref);
        if (row === undefined) throw new CmsHttpError(404, { detail: `'${formatRef(ref)}' has no versions.` });
        const found = await this.store.version(row.id, version);
        if (found === undefined) throw new CmsHttpError(404, { detail: `'${formatRef(ref)}' has no version ${version}.` });
        return {
            content: migrateContent(target.definition, found.data, found.migrationVersion),
            summary: found.summary,
            createdAt: found.createdAt,
            createdBy: found.createdBy,
        };
    }

    async rollback(ref: DocumentRef, version: number, author: string): Promise<DraftState> {
        const { target } = await this.document(ref);
        const migrated = (await this.versionContent(ref, version)).content;
        await this.assertNoLoop(ref, migrated, 'latest');
        await this.store.saveDraft({
            kind: target.kind,
            key: target.key,
            site: target.site,
            draft: migrated,
            author,
            summary: `Restored version ${version}`,
            refs: refsOf(target.definition, migrated),
            migration: migrationOf(target.definition),
        });
        await this.notices.publish({
            ref: formatRef(ref),
            paths: null,
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
                const entry = this.sites[row.site]?.[row.key];
                if (entry !== undefined) {
                    used.push({
                        name: row.key,
                        site: row.site,
                        path: entry.path,
                        fieldPaths: row.fieldPaths,
                    });
                }
                continue;
            }
            // An item holding the id shows it on every page that serves the item.
            if (row.kind !== 'item') continue;
            const listing = this.storedListing(row.key.slice(0, row.key.indexOf('/')), row.site);
            if (listing === undefined) continue;
            for (const route of listing.routes) {
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
     * Every document that holds each image, by media id: in its published
     * content, its draft, or both, with the fields that hold it. Read from the
     * content itself, so it is right however the content was written.
     */
    async mediaUses(): Promise<Map<string, MediaUse[]>> {
        const found = new Map<string, MediaUse[]>();
        for (const { target, row: stored } of await this.declaredDocuments()) {
            const row = this.migrated(target, stored)!;
            const published = new Set(mediaUsesOf(target.definition, row.published ?? {}).map((use) => use.id));
            const byId = new Map<string, Set<string>>();
            for (const content of [row.published, row.draft]) {
                for (const use of mediaUsesOf(target.definition, content ?? {})) {
                    byId.set(use.id, (byId.get(use.id) ?? new Set()).add(use.fieldPath));
                }
            }
            if (byId.size === 0) continue;
            const content = row.draft ?? row.published ?? {};
            const labelField =
                target.kind === 'item'
                    ? dataFields(target.definition.fields).find(
                          (field) => readDef(unwrapOptionalWrappers(field.schema).inner).type === 'string'
                      )?.name
                    : undefined;
            const itemLabel = labelField === undefined ? undefined : content[labelField];
            const label =
                target.kind === 'item'
                    ? typeof itemLabel === 'string' && itemLabel !== ''
                        ? itemLabel
                        : null
                    : (target.definition.label ?? null);
            for (const [id, fieldPaths] of byId) {
                found.set(id, [
                    ...(found.get(id) ?? []),
                    {
                        ref: formatRef(target.ref),
                        label,
                        fieldPaths: [...fieldPaths].sort(),
                        published: published.has(id),
                    },
                ]);
            }
        }
        return found;
    }

    /**
     * Refreshes every page that shows an image, once its own alt text or
     * focal point changed or it was deleted.
     */
    async revalidateMedia(uses: readonly MediaUse[]): Promise<void> {
        for (const use of uses) {
            const ref = parseRef(use.ref);
            if (ref !== undefined) await this.revalidateDocument(ref);
        }
    }

    /**
     * Stored page content no declared page claims: what is left when a page
     * is renamed or deleted in code.
     */
    /**
     * Every stored document something in code still declares, with its
     * target. Orphans are left to `orphanedPages`.
     */
    private async declaredDocuments(): Promise<Array<{ target: Target; row: DocumentRow }>> {
        const found: Array<{ target: Target; row: DocumentRow }> = [];
        for (const row of await this.store.list('page')) {
            const entry = this.sites[row.site]?.[row.key];
            if (entry === undefined || servesCollection(entry.page)) continue;
            found.push({
                target: this.target({
                    type: 'page',
                    name: row.key,
                    ...(row.site === DEFAULT_SITE
                        ? {}
                        : {
                              site: row.site,
                          }),
                }),
                row,
            });
        }
        for (const row of await this.store.list('global')) {
            const declared = row.site === DEFAULT_SITE ? this.globals[row.key] : this.siteGlobals[row.site]?.[row.key];
            if (declared === undefined) continue;
            found.push({
                target: this.target({
                    type: 'global',
                    name: row.key,
                    ...(row.site === DEFAULT_SITE
                        ? {}
                        : {
                              site: row.site,
                          }),
                }),
                row,
            });
        }
        const listings = this.listings();
        for (const row of await this.store.list('item')) {
            const listing = listings.find((candidate) => candidate.site === row.site && row.key.startsWith(candidate.keyPrefix));
            if (listing === undefined) continue;
            found.push({
                target: this.target(listing.refOf(row.key.slice(listing.keyPrefix.length))),
                row,
            });
        }
        return found;
    }

    /**
     * Every published document that fails its schema once migrated, with the
     * earlier version visitors see instead. Drafts are left out, since one
     * fails its schema while an editor is still working on it.
     */
    async contentProblems(): Promise<ContentProblem[]> {
        const problems: ContentProblem[] = [];
        for (const { target, row: stored } of await this.declaredDocuments()) {
            const row = this.migrated(target, stored)!;
            if (row.published === null) continue;
            const parsed = target.definition.schema.safeParse(row.published);
            if (parsed.success) continue;
            const earlier = await this.lastPassing(target, row);
            problems.push({
                ref: formatRef(target.ref),
                issues: describeIssues(parsed.error),
                ...(earlier === undefined
                    ? {}
                    : {
                          serving: earlier.version,
                      }),
            });
        }
        return problems;
    }

    /**
     * Stores every document at its definition's latest migration step, so
     * reads stop migrating it. Answers how many were behind.
     */
    async migrateStoredContent(): Promise<number> {
        let migrated = 0;
        for (const { target, row } of await this.declaredDocuments()) {
            if (pendingMigrations(target.definition, row.migrationVersion).length === 0) continue;
            const moved = await this.store.migrateStored(
                row.id,
                migrationOf(target.definition),
                (content) => refsOf(target.definition, content),
                MIGRATION_AUTHOR
            );
            if (moved) migrated += 1;
        }
        return migrated;
    }

    async orphanedPages(): Promise<Array<{ site: string; name: string; updatedAt: string; published: boolean }>> {
        const rows = await this.store.list('page');
        return rows
            .filter((row) => this.sites[row.site]?.[row.key] === undefined)
            .map((row) => ({
                site: row.site,
                name: row.key,
                updatedAt: row.updatedAt.toISOString(),
                published: row.publishedVersion !== null,
            }));
    }

    /**
     * Moves a page's stored content, versions and history to another name,
     * after the page was renamed in code.
     */
    async renamePage(from: string, to: string, site = DEFAULT_SITE): Promise<void> {
        if (this.sites[site]?.[to] === undefined) {
            throw new CmsHttpError(404, {
                detail: `No page named '${to}'${site === DEFAULT_SITE ? '' : ` on the ${site} site`}. Rename the page in its content.ts first.`,
            });
        }
        if (this.sites[site]?.[from] !== undefined) {
            throw new CmsHttpError(409, {
                detail: `'${from}' is still a page, so its content stays. Rename it in its content.ts first.`,
            });
        }
        if ((await this.store.get('page', from, site)) === undefined) {
            throw new CmsHttpError(404, { detail: `Nothing is stored for '${from}'.` });
        }
        if ((await this.store.get('page', to, site)) !== undefined) {
            throw new CmsHttpError(409, { detail: `'${to}' has content of its own. Delete it before moving '${from}' there.` });
        }
        await this.store.rekey('page', from, to, site);
        const moved: DocumentRef = {
            type: 'page',
            name: to,
            ...(site === DEFAULT_SITE
                ? {}
                : {
                      site,
                  }),
        };
        const row = await this.store.get('page', to, site);
        if (row !== undefined) await this.store.readdressReviews(row.id, formatRef(moved));
        await this.revalidateDocument(moved);
    }

    /**
     * Drops cached renders for the tags given: through the `revalidate`
     * option when the site runs elsewhere, else through the adapter.
     */
    async revalidateTags(tags: readonly string[]): Promise<void> {
        if (tags.length === 0) return;
        if (this.options.revalidate !== undefined) {
            await this.options.revalidate(tags);
            return;
        }
        await this.runtime?.revalidate(tags);
    }

    /**
     * Drops the cached renders of every page holding one of a relationship's ids,
     * and returns their names.
     */
    async invalidateRelationship(name: string, id: string): Promise<string[]> {
        const brand = brandOf(this.relationship(name).id);
        if (brand === undefined) {
            throw new CmsHttpError(500, {
                detail: `The ${name} relationship's id has no brand. Make it with Kizuna.brand.`,
            });
        }
        return this.invalidate(brand, id);
    }

    /**
     * Drops the cached renders of every page holding the id, and returns
     * their names.
     */
    async invalidate(brand: string | z.core.$ZodType, id: string): Promise<string[]> {
        const brandName = typeof brand === 'string' ? brand : brandOf(brand);
        if (brandName === undefined) throw new Error('invalidate() takes a brand name or a schema made with Kizuna.brand.');
        const used = await this.whereUsed(brandName, id);
        if (used.length > 0) await this.revalidateTags([...new Set(used.map((page) => pageCacheTag(page.name, page.site)))]);
        return used.map((page) => (page.site === DEFAULT_SITE ? page.name : `${page.site}:${page.name}`));
    }

    /**
     * Drops every cached read a changed document reaches: its own, its
     * collection's lists, and the pages that reference an item.
     */
    async revalidateDocument(ref: DocumentRef): Promise<void> {
        const readers = this.readersOf(ref);
        const tags = readers.flatMap((site) => [
            ref.type === 'page' ? pageCacheTag(ref.name, ref.site) : documentCacheTag(ref, site),
            ...(ref.type === 'item' ? [collectionCacheTag(ref.collection, site)] : []),
        ]);
        const brand = ref.type === 'item' ? this.servedListing(ref.collection, ref.site ?? DEFAULT_SITE).brand : undefined;
        if (brand !== undefined && ref.type === 'item') {
            tags.push(
                ...(await this.whereUsed(brand, ref.id))
                    .filter((used) => readers.includes(used.site))
                    .map((used) => pageCacheTag(used.name, used.site))
            );
        }
        await this.revalidateTags([...new Set(tags)]);
    }

    /**
     * The sites that read a document: its own site, or for shared content,
     * every site.
     */
    private readersOf(ref: DocumentRef): string[] {
        if (ref.site !== undefined && ref.site !== DEFAULT_SITE) return [ref.site];
        if (ref.type === 'page') return [DEFAULT_SITE];
        const names = this.siteNames();
        return names.length === 0 ? [DEFAULT_SITE] : names;
    }

    /**
     * Whether a preview token was signed with this CMS's secret and has not
     * expired.
     */
    verifiesPreview(token: string): boolean {
        return verifyPreviewToken(previewSecret(this.options.previewSecret), token);
    }

    previewToken(): string {
        return signPreviewToken(previewSecret(this.options.previewSecret));
    }

    /**
     * The declared sites, by name, or none for a single-site project.
     */
    siteNames(): string[] {
        return Object.keys(this.options.sites?.entries ?? {});
    }

    /**
     * The site this deployment shows, as `site` on `cms()` names it.
     */
    currentSite(): string {
        const names = this.siteNames();
        if (names.length === 0) return DEFAULT_SITE;
        if (this.options.site === undefined) {
            throw new Error(
                'cms() serves several sites, so reading content in process needs the one this deployment shows. Name it with `site`, like `site: () => process.env.KIZUNA_SITE`.'
            );
        }
        const picked = this.options.site();
        if (picked === undefined || picked === '') {
            throw new Error(
                `\`site\` on cms() named no site, so the reader cannot tell which to show. It shows one of ${names.join(', ')}.`
            );
        }
        if (!names.includes(picked)) {
            throw new Error(`\`site\` on cms() named '${picked}', which declareSites() does not declare. It declares ${names.join(', ')}.`);
        }
        return picked;
    }

    /**
     * A declared site as the reader hands it out: its name as `key`, beside
     * its fields.
     */
    siteInfo(name: string): Record<string, unknown> & { key: string } {
        const values = this.options.sites?.values[name];
        if (values === undefined) throw new CmsHttpError(404, { detail: `There is no site named '${name}'.` });
        return {
            key: name,
            ...values,
        };
    }

    /**
     * The roles the editor identity declares, once the api has assembled.
     */
    identityRoles(): Roles | undefined {
        const schemes = (this.api as { securitySchemes?: Record<string, { roles?: Roles }> }).securitySchemes;
        return schemes?.[this.identity]?.roles;
    }
}
