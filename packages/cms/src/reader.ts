import type { ContentRuntime } from 'kizunajs/plugin';
import { DEFAULT_SITE, type PageMap, type SiteOptions } from './options.js';
import type { Output } from './output.js';
import { CmsHttpError, collectionCacheTag, documentCacheTag, pageCacheTag, type CmsService } from './cms.js';
import { servesCollection } from './page.js';
import type { ParamsOf } from './dynamic.js';
import type { Collection, Global } from './definitions.js';
import { formatRef, type DocumentRef } from './refs.js';
import { encodeSourcePaths } from './source-path.js';
import { PREVIEW_COOKIE } from './preview-token.js';

// Registry-global, so a component from another copy of this package still
// finds the service behind a reader.
const READER: unique symbol = Symbol.for('kizuna.cms.reader') as symbol as typeof READER;

/**
 * What the preview and the content overview read off a reader.
 */
export interface ReaderSource {
    service: CmsService;
    site: string;
}

/**
 * The service and site behind a reader, for the components that take one.
 */
export const sourceOf = (reader: unknown): ReaderSource => {
    const source = (reader as Record<symbol, ReaderSource | undefined> | undefined)?.[READER];
    if (source === undefined) throw new Error('Pass `kizuna.content`, or one of its `sites`, from a config with `content: cms(...)`.');
    return source;
};

/**
 * One page as a server component reads it.
 */
export interface CmsPageReader<P> {
    /**
     * The page's content, typed from its fields with media resolved. Outside
     * draft mode it is the published content, cached and tagged, and an
     * unpublished page answers not found. In draft mode it is the draft, and
     * an incomplete draft calls `notFound()` while the preview overlay shows
     * the setup screen.
     */
    get(): Promise<Output<P>>;
}

/**
 * One global as a server component reads it.
 */
export interface CmsGlobalReader<G> {
    /**
     * The global's content. Outside draft mode the published content, cached;
     * in draft mode the draft where it passes the schema. A global with
     * neither calls `notFound()`.
     */
    get(): Promise<Output<G>>;
}

type IndexOf<C> = C extends {
    readonly indexes?: ReadonlyArray<infer Index extends string>;
}
    ? Index
    : never;

/**
 * What a collection's `list()` takes: filters and a sort over its indexes,
 * and the cursor of the page before. A field a route reads from the address
 * is an index too.
 */
export interface ListInput<C> {
    where?: Partial<Record<IndexOf<C>, string | number | boolean>>;
    orderBy?: IndexOf<C> | 'publishedAt' | 'updatedAt';
    direction?: 'asc' | 'desc';
    limit?: number;
    cursor?: string;
}

/**
 * A page that shows a collection's items, one per address, such as
 * `app/blog/[slug]`, as a server component reads it.
 */
export interface CmsCollectionPageReader<C, Params> {
    /**
     * The item at an address, by the params the page component receives.
     * Outside draft mode the published item, cached and tagged with its
     * collection; in draft mode the draft whose address matches, then the
     * published one. None calls `notFound()`.
     *
     * @example
     * const article = await cms.pages.articlePage.get(await params);
     */
    get(params: Params): Promise<Output<C>>;
}

/**
 * One collection as a server component reads it.
 */
export interface CmsCollectionReader<C> {
    /**
     * One item by id. A missing or unpublished item calls `notFound()`.
     */
    get(input: { id: string }): Promise<Output<C>>;
    /**
     * Items in the order of the ids given, skipping the ones that are missing
     * or unpublished.
     */
    getMany(input: { ids: readonly string[] }): Promise<Array<Output<C>>>;
    /**
     * Items filtered and sorted by the collection's indexes, newest
     * `publishedAt` first unless `orderBy` says otherwise, a page at a time.
     * In draft mode the list includes drafts that pass the schema.
     */
    list(input?: ListInput<C>): Promise<{ items: Array<Output<C>>; next: string | undefined }>;
}

export type CmsPages<Pages extends PageMap> = {
    [Name in keyof Pages]: Pages[Name]['page'] extends {
        readonly collection: infer Served extends Collection;
    }
        ? CmsCollectionPageReader<Served, ParamsOf<Pages[Name]['path']>>
        : CmsPageReader<Pages[Name]['page']>;
};

export type CmsGlobals<Globals> = Globals extends readonly Global[]
    ? {
          [Each in Globals[number] as Each['name']]: CmsGlobalReader<Each>;
      }
    : {};

export type CmsCollections<Collections> = Collections extends readonly Collection[]
    ? {
          [Each in Collections[number] as Each['name']]: CmsCollectionReader<Each>;
      }
    : {};

/**
 * One site's content as server components read it.
 */
export interface CmsReader<Pages extends PageMap, Globals = readonly [], Collections = readonly []> {
    pages: CmsPages<Pages>;
    globals: CmsGlobals<Globals>;
    collections: CmsCollections<Collections>;
}

/**
 * What `kizuna.content` holds: the default site's reader, and one per named
 * site when several apps share the CMS.
 */
export type CmsContent<Pages extends PageMap, Globals, Collections, Sites extends Record<string, SiteOptions>> = CmsReader<
    Pages,
    Globals,
    Collections
> & {
    sites: {
        [Site in keyof Sites]: CmsReader<Sites[Site]['pages'], Globals, Collections>;
    };
};

/**
 * Route params as stored: a framework can hand a segment over still encoded.
 */
const decodeParams = (params: Record<string, string>): Record<string, string> =>
    Object.fromEntries(
        Object.entries(params).map(([key, value]) => {
            if (!value.includes('%')) return [key, value];
            try {
                return [key, decodeURIComponent(value)];
            } catch {
                return [key, value];
            }
        })
    );

/**
 * One site's reader. Reads happen in process, so a static build needs no
 * server to call. Outside draft mode they use nobody's credentials, since
 * published content is public.
 */
const siteReader = (service: CmsService, site: string): CmsReader<PageMap> => {
    const runtime = service.runtime;
    const onSite = site === DEFAULT_SITE ? {} : { site };

    const cached = <Args extends unknown[], Result>(read: (...args: Args) => Promise<Result>, keys: string[], tags: string[]) =>
        runtime === undefined ? read : runtime.cache(read, keys, tags);

    const missing = async (what: string): Promise<never> => {
        if (runtime !== undefined) return runtime.notFound();
        throw new CmsHttpError(404, {
            detail: `${what} is not published.`,
        });
    };

    /**
     * Whether this request shows drafts: draft mode is on and the preview
     * cookie still verifies. The preview renews the cookie while the editor is
     * signed in, so a browser left in draft mode stops showing drafts soon
     * after they sign out.
     */
    const showsDrafts = async (): Promise<boolean> => {
        if (runtime === undefined || !(await runtime.draftMode()).enabled) return false;
        const token = (await runtime.cookies()).get(PREVIEW_COOKIE);
        return token !== undefined && service.verifiesPreview(token);
    };

    /**
     * The fields an item's address reads, which draft mode leaves unmarked so
     * links built from them work.
     */
    const plainOf = (ref: DocumentRef): readonly string[] => service.listingOf(ref)?.pathFields ?? [];

    /**
     * One document as a component reads it: the draft in draft mode, falling
     * back to the published content for shared content; the cached published
     * content otherwise.
     */
    const reader = (ref: DocumentRef, fallBack: boolean) => {
        const readPublished = cached(
            async () => (await service.published(ref))?.content ?? null,
            ['kizuna-cms', 'published', formatRef(ref)],
            [ref.type === 'page' ? pageCacheTag(ref.name, ref.site) : documentCacheTag(ref)]
        );
        return async (): Promise<Record<string, unknown> | undefined> => {
            if (await showsDrafts()) {
                const draft = await service.draft(ref);
                if (draft !== undefined)
                    return encodeSourcePaths(draft.state.target.definition, draft.content, formatRef(ref), plainOf(ref));
                if (!fallBack) return undefined;
                const published = await service.published(ref);
                return published === undefined
                    ? undefined
                    : encodeSourcePaths(service.target(ref).definition, published.content, formatRef(ref), plainOf(ref));
            }
            return (await readPublished()) ?? undefined;
        };
    };

    const pages: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(service.sites[site] ?? {})) {
        if (!servesCollection(entry.page)) {
            const read = reader(
                {
                    type: 'page',
                    name,
                    ...onSite,
                },
                false
            );
            pages[name] = {
                get: async () => (await read()) ?? (await missing(entry.path)),
            };
            continue;
        }
        const collection = entry.page.collection.name;
        const listing = service.listing(collection);
        const item = (id: string): DocumentRef => listing.refOf(id);
        const readPublished = cached(
            async (params: string) => {
                const id = await service.findItem(collection, JSON.parse(params) as Record<string, string>, 'published');
                return id === undefined ? null : ((await service.published(item(id)))?.content ?? null);
            },
            ['kizuna-cms', 'published', `page:${name}`],
            [collectionCacheTag(collection)]
        );
        const readAt = async (params: Record<string, string>): Promise<Record<string, unknown> | undefined> => {
            if (!(await showsDrafts())) return (await readPublished(JSON.stringify(params))) ?? undefined;
            const drafted = await service.findItem(collection, params, 'draft');
            if (drafted !== undefined) {
                const draft = await service.draft(item(drafted));
                if (draft !== undefined)
                    return encodeSourcePaths(listing.definition, draft.content, formatRef(item(drafted)), listing.pathFields);
            }
            const live = await service.findItem(collection, params, 'published');
            const published = live === undefined ? undefined : await service.published(item(live));
            return published === undefined || live === undefined
                ? undefined
                : encodeSourcePaths(listing.definition, published.content, formatRef(item(live)), listing.pathFields);
        };
        pages[name] = {
            get: async (params: Record<string, string>) => (await readAt(decodeParams(params))) ?? (await missing(entry.path)),
        };
    }

    const globals: Record<string, unknown> = {};
    for (const name of Object.keys(service.globals)) {
        const read = reader(
            {
                type: 'global',
                name,
            },
            true
        );
        globals[name] = {
            get: async () => (await read()) ?? (await missing(`The ${name} global`)),
        };
    }

    /**
     * A collection's `list()`: published and cached outside draft mode,
     * drafts included and marked in it.
     */
    const listOf = (collection: string) => {
        const listing = service.listing(collection);
        const listPublished = cached(
            async (input: string) =>
                service.listItems(collection, {
                    draft: false,
                    ...(JSON.parse(input) as ListInput<unknown>),
                }),
            ['kizuna-cms', 'list', collection],
            [collectionCacheTag(collection)]
        );
        return async (input: ListInput<unknown> = {}) => {
            if (!(await showsDrafts())) return listPublished(JSON.stringify(input));
            const result = await service.listItems(collection, {
                draft: true,
                ...input,
                where: input.where as Record<string, unknown> | undefined,
            });
            return {
                items: result.items.map((content) =>
                    encodeSourcePaths(listing.definition, content, formatRef(listing.refOf(String(content['id']))), listing.pathFields)
                ),
                next: result.next,
            };
        };
    };

    const collections: Record<string, unknown> = {};
    for (const name of Object.keys(service.collections)) {
        const items = new Map<string, () => Promise<Record<string, unknown> | undefined>>();
        const item = (id: string) => {
            let read = items.get(id);
            if (read === undefined) {
                read = reader(
                    {
                        type: 'item',
                        collection: name,
                        id,
                    },
                    true
                );
                items.set(id, read);
            }
            return read();
        };
        collections[name] = {
            get: async (input: { id: string }) => (await item(input.id)) ?? (await missing(`The ${name} item '${input.id}'`)),
            getMany: async (input: { ids: readonly string[] }) => {
                const found = await Promise.all(input.ids.map((id) => item(id)));
                return found.filter((content) => content !== undefined);
            },
            list: listOf(name),
        };
    }

    return Object.defineProperty(
        {
            pages,
            globals,
            collections,
        },
        READER,
        {
            value: {
                service,
                site,
            } satisfies ReaderSource,
            enumerable: false,
        }
    ) as unknown as CmsReader<PageMap>;
};

/**
 * What `kizuna.content` reads: the default site's pages beside the shared
 * globals and collections, and every named site under `sites`.
 */
export const createReader = (
    service: CmsService,
    runtime: ContentRuntime | undefined
): CmsContent<PageMap, readonly Global[], readonly Collection[], Record<string, SiteOptions>> => {
    service.runtime = runtime;
    const sites: Record<string, CmsReader<PageMap>> = {};
    for (const site of Object.keys(service.sites)) {
        if (site !== DEFAULT_SITE) sites[site] = siteReader(service, site);
    }
    return Object.assign(siteReader(service, DEFAULT_SITE), {
        sites,
    }) as never;
};
