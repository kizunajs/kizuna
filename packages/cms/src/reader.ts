import type { ContentRuntime } from 'kizunajs/plugin';
import { DEFAULT_SITE, type PageMap } from './options.js';
import type { DeclaredSites, SiteEntriesOf, SiteFieldsOf } from './site.js';
import type { Output } from './output.js';
import { CmsHttpError, collectionCacheTag, documentCacheTag, localeCacheTag, pageCacheTag, type CmsService, type Listing } from './cms.js';
import { servesCollection } from './page.js';
import type { ParamsOf } from './dynamic.js';
import type { Collection, ContentDefinition, Global } from './definitions.js';
import { latestMigration } from './content.js';
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
    if (source === undefined) throw new Error('Pass `kizuna.content`, or a view `of()` returns, from a config with `content: cms(...)`.');
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
     * the setup screen. With sites, `locale` is one the site serves, and
     * without it the site's first.
     *
     * @example
     * const page = await kizuna.content.pages.frontPage.get({ locale });
     */
    get(input?: LocaleInput): Promise<Output<P>>;
}

/**
 * The language a read is in, like `nb`: one `locales` on `cms()` lists, or
 * with sites, one the site serves. Without it, the first.
 */
export interface LocaleInput {
    locale?: string;
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
    get(input?: LocaleInput): Promise<Output<G>>;
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
export interface ListInput<C> extends LocaleInput {
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
     * published one. None calls `notFound()`. A `locale` among the params,
     * as a `[locale]` folder passes it, picks the language.
     *
     * @example
     * const article = await cms.pages.articlePage.get(await params);
     */
    get(params: Params & LocaleInput): Promise<Output<C>>;
}

/**
 * One collection as a server component reads it.
 */
export interface CmsCollectionReader<C> {
    /**
     * One item by id. A missing or unpublished item calls `notFound()`.
     */
    get(input: { id: string } & LocaleInput): Promise<Output<C>>;
    /**
     * Items in the order of the ids given, skipping the ones that are missing
     * or unpublished.
     */
    getMany(input: { ids: readonly string[] } & LocaleInput): Promise<Array<Output<C>>>;
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
 * The site this deployment shows, as `kizuna.content.site` reads it.
 */
export interface CmsSiteReader<Site, Key extends string> {
    /**
     * The declared site: its name as `key`, and its fields.
     *
     * @example
     * const site = await kizuna.content.site.get();
     */
    get(): Promise<Site & { key: Key }>;
}

type ElementOf<List> = List extends readonly (infer Each)[] ? Each : never;

type OwnOf<Entry, Key extends 'globals' | 'collections'> = Entry extends { readonly [Name in Key]?: infer List } ? ElementOf<List> : never;

/**
 * A site's pages, leaving out those whose `sites` names only others.
 */
type PagesOf<Entry, Key extends string> = Entry extends { readonly pages?: infer Pages extends PageMap }
    ? {
          [Name in keyof Pages as Pages[Name]['page'] extends { readonly sites: readonly (infer Named)[] }
              ? Key extends Named
                  ? Name
                  : never
              : Name]: Pages[Name];
      }
    : {};

/**
 * One site's content, as `kizuna.content.of()` narrows to: its pages, the
 * shared globals and collections beside its own, and its name as `site`.
 */
export interface CmsSiteView<Key extends string, Pages extends PageMap, Globals, Collections> extends CmsReader<
    Pages,
    Globals,
    Collections
> {
    /**
     * The site's name, to narrow a view of several sites on.
     */
    site: Key;
}

/**
 * Every declared site's view, keyed by site.
 */
export type CmsSiteViews<Sites, Globals, Collections> = {
    [Key in keyof SiteEntriesOf<Sites> & string]: CmsSiteView<
        Key,
        PagesOf<SiteEntriesOf<Sites>[Key], Key>,
        readonly (ElementOf<Globals> | OwnOf<SiteEntriesOf<Sites>[Key], 'globals'>)[],
        readonly (ElementOf<Collections> | OwnOf<SiteEntriesOf<Sites>[Key], 'collections'>)[]
    >;
};

/**
 * What `kizuna.content` holds when the CMS serves several sites: the view of
 * the site this deployment shows, typed as any declared site's, so only
 * what every site has is reachable without `of()`.
 */
export interface CmsSitesContent<Sites, Globals, Collections> {
    pages: CmsSiteViews<Sites, Globals, Collections>[keyof SiteEntriesOf<Sites> & string]['pages'];
    globals: CmsSiteViews<Sites, Globals, Collections>[keyof SiteEntriesOf<Sites> & string]['globals'];
    collections: CmsSiteViews<Sites, Globals, Collections>[keyof SiteEntriesOf<Sites> & string]['collections'];
    site: CmsSiteReader<SiteFieldsOf<Sites>, keyof SiteEntriesOf<Sites> & string>;
    /**
     * The view of the site this deployment shows, for an app that serves the
     * sites named. Narrow it on `site` to reach what only one of them has.
     *
     * @example
     * const content = kizuna.content.of(['uk', 'norway']);
     * if (content.site === 'uk') await content.collections.events.list();
     */
    of<const Keys extends readonly (keyof SiteEntriesOf<Sites> & string)[]>(
        keys: Keys
    ): CmsSiteViews<Sites, Globals, Collections>[Keys[number]];
}

/**
 * What `kizuna.content` holds: the pages, globals and collections of a
 * single-site project, or with several sites, the view of the one this
 * deployment shows.
 */
export type CmsContent<Pages extends PageMap, Globals, Collections, Sites extends DeclaredSites<any, any> | undefined> = [Sites] extends [
    undefined,
]
    ? CmsReader<Pages, Globals, Collections>
    : CmsSitesContent<Sites, Globals, Collections>;

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

    /**
     * A cache key that names the definition's latest migrate step, since a
     * framework's cache can outlive a restart: content cached in an earlier
     * shape is never read back once a definition migrates it.
     */
    const keyOf = (definition: ContentDefinition, ...parts: string[]): string[] => [
        'kizuna-cms',
        ...parts,
        `migration:${latestMigration(definition)}`,
    ];

    const missing = async (what: string): Promise<never> => {
        if (runtime !== undefined) return runtime.notFound();
        throw new CmsHttpError(404, {
            detail: `${what} is not published.`,
        });
    };

    /**
     * The language a read asks for, checked against the ones the site
     * serves. One it does not serve is not found.
     */
    const localeOf = async (locale: string | undefined): Promise<string | undefined> => {
        try {
            return service.readLocale(site, locale);
        } catch (error) {
            if (error instanceof CmsHttpError && runtime !== undefined) return runtime.notFound();
            throw error;
        }
    };

    /**
     * One cached read per language, made on first use.
     */
    const perLocale = <Read>(make: (locale: string | undefined) => Read) => {
        const made = new Map<string, Read>();
        return (locale: string | undefined): Read => {
            const key = locale ?? '';
            let read = made.get(key);
            if (read === undefined) {
                read = make(locale);
                made.set(key, read);
            }
            return read;
        };
    };

    const inLocale = (parts: string[], locale: string | undefined): string[] =>
        locale === undefined ? parts : [...parts, `locale:${locale}`];

    const tagsIn = (tag: string, locale: string | undefined): string[] =>
        locale === undefined ? [tag] : [tag, localeCacheTag(tag, locale)];

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
        const readPublished = perLocale((locale) =>
            cached(
                async () => (await service.publishedOn(ref, site, locale))?.content ?? null,
                keyOf(
                    service.target(ref).definition,
                    ...inLocale(['published', site === DEFAULT_SITE ? formatRef(ref) : `${site}:${formatRef(ref)}`], locale)
                ),
                tagsIn(ref.type === 'page' ? pageCacheTag(ref.name, ref.site) : documentCacheTag(ref, site), locale)
            )
        );
        return async (asked?: string): Promise<Record<string, unknown> | undefined> => {
            const locale = await localeOf(asked);
            if (await showsDrafts()) {
                const draft = await service.draftOn(ref, site, fallBack, locale);
                return draft === undefined
                    ? undefined
                    : encodeSourcePaths(
                          service.target(ref).definition,
                          draft,
                          formatRef(service.shownRef(ref, site, locale)),
                          plainOf(ref)
                      );
            }
            return (await readPublished(locale)()) ?? undefined;
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
                get: async (input?: LocaleInput) => (await read(input?.locale)) ?? (await missing(entry.path)),
            };
            continue;
        }
        const listing = service.servedListing(entry.page.collection.name, site);
        const readPublished = perLocale((locale) =>
            cached(
                async (params: string) => {
                    const id = await service.findItem(
                        listing.name,
                        JSON.parse(params) as Record<string, string>,
                        'published',
                        listing.site
                    );
                    return id === undefined ? null : ((await service.publishedOn(listing.refOf(id), site, locale))?.content ?? null);
                },
                keyOf(
                    listing.definition,
                    ...inLocale(
                        [
                            'published',
                            formatRef({
                                type: 'page',
                                name,
                                site,
                            }),
                        ],
                        locale
                    )
                ),
                tagsIn(collectionCacheTag(listing.name, site), locale)
            )
        );
        const readAt = async (params: Record<string, string>, asked: string | undefined): Promise<Record<string, unknown> | undefined> => {
            const locale = await localeOf(asked);
            if (!(await showsDrafts())) return (await readPublished(locale)(JSON.stringify(params))) ?? undefined;
            const drafted = await service.findItem(listing.name, params, 'draft', listing.site);
            if (drafted !== undefined) {
                const draft = await service.draftOn(listing.refOf(drafted), site, false, locale);
                if (draft !== undefined)
                    return encodeSourcePaths(
                        listing.definition,
                        draft,
                        formatRef(service.shownRef(listing.refOf(drafted), site, locale)),
                        listing.pathFields
                    );
            }
            const live = await service.findItem(listing.name, params, 'published', listing.site);
            const published = live === undefined ? undefined : await service.publishedOn(listing.refOf(live), site, locale);
            return published === undefined || live === undefined
                ? undefined
                : encodeSourcePaths(
                      listing.definition,
                      published.content,
                      formatRef(service.shownRef(listing.refOf(live), site, locale)),
                      listing.pathFields
                  );
        };
        pages[name] = {
            get: async (input: Record<string, string>) => {
                const { locale, ...params } = input;
                return (await readAt(decodeParams(params), locale)) ?? (await missing(entry.path));
            },
        };
    }

    const globals: Record<string, unknown> = {};
    const globalRefs: DocumentRef[] = [
        ...Object.keys(service.globals).map(
            (name): DocumentRef => ({
                type: 'global',
                name,
            })
        ),
        ...Object.keys(service.siteGlobals[site] ?? {}).map(
            (name): DocumentRef => ({
                type: 'global',
                name,
                site,
            })
        ),
    ];
    for (const ref of globalRefs) {
        if (ref.type !== 'global') continue;
        const read = reader(ref, true);
        globals[ref.name] = {
            get: async (input?: LocaleInput) => (await read(input?.locale)) ?? (await missing(`The ${ref.name} global`)),
        };
    }

    /**
     * A collection's `list()`: published and cached outside draft mode,
     * drafts included and marked in it.
     */
    const listOf = (listing: Listing) => {
        const listPublished = perLocale((locale) =>
            cached(
                async (input: string) =>
                    service.listItems(
                        listing.name,
                        {
                            draft: false,
                            ...(JSON.parse(input) as ListInput<unknown>),
                        },
                        listing.site,
                        site,
                        locale
                    ),
                keyOf(listing.definition, ...inLocale(['list', site === DEFAULT_SITE ? listing.name : `${site}:${listing.name}`], locale)),
                tagsIn(collectionCacheTag(listing.name, site), locale)
            )
        );
        return async ({ locale: asked, ...input }: ListInput<unknown> = {}) => {
            const locale = await localeOf(asked);
            if (!(await showsDrafts())) return listPublished(locale)(JSON.stringify(input));
            const result = await service.listItems(
                listing.name,
                {
                    draft: true,
                    ...input,
                    where: input.where as Record<string, unknown> | undefined,
                },
                listing.site,
                site,
                locale
            );
            return {
                items: result.items.map((content) =>
                    encodeSourcePaths(
                        listing.definition,
                        content,
                        formatRef(service.shownRef(listing.refOf(String(content['id'])), site, locale)),
                        listing.pathFields
                    )
                ),
                next: result.next,
            };
        };
    };

    const collections: Record<string, unknown> = {};
    const listings = [
        ...Object.keys(service.collections).map((name) => service.listing(name)),
        ...Object.keys(service.siteCollections[site] ?? {}).map((name) => service.listing(name, site)),
    ];
    for (const listing of listings) {
        const name = listing.name;
        const items = new Map<string, (locale?: string) => Promise<Record<string, unknown> | undefined>>();
        const item = (id: string, locale: string | undefined) => {
            let read = items.get(id);
            if (read === undefined) {
                read = reader(listing.refOf(id), true);
                items.set(id, read);
            }
            return read(locale);
        };
        collections[name] = {
            get: async (input: { id: string } & LocaleInput) =>
                (await item(input.id, input.locale)) ?? (await missing(`The ${name} item '${input.id}'`)),
            getMany: async (input: { ids: readonly string[] } & LocaleInput) => {
                const found = await Promise.all(input.ids.map((id) => item(id, input.locale)));
                return found.filter((content) => content !== undefined);
            },
            list: listOf(listing),
        };
    }

    return Object.defineProperty(
        {
            ...(site === DEFAULT_SITE
                ? {}
                : {
                      site,
                  }),
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
 * What `kizuna.content` reads: a single-site project's pages beside the
 * globals and collections, or with several sites, the view of the site
 * `site` names, read again on every access.
 */
export const createReader = (service: CmsService, runtime: ContentRuntime | undefined): unknown => {
    service.runtime = runtime;
    const names = service.siteNames();
    if (names.length === 0) return siteReader(service, DEFAULT_SITE);
    const views = Object.fromEntries(names.map((name) => [name, siteReader(service, name)]));
    const current = (): CmsReader<PageMap> => views[service.currentSite()]!;
    const content = {
        get pages() {
            return current().pages;
        },
        get globals() {
            return current().globals;
        },
        get collections() {
            return current().collections;
        },
        site: {
            get: async () => service.siteInfo(service.currentSite()),
        },
        of: (keys: readonly string[]) => {
            const site = service.currentSite();
            if (!keys.includes(site)) {
                throw new Error(`This app shows ${keys.join(', ')}, but \`site\` on cms() names ${site}.`);
            }
            return views[site];
        },
    };
    return Object.defineProperty(content, READER, {
        get: (): ReaderSource => ({
            service,
            get site() {
                return service.currentSite();
            },
        }),
        enumerable: false,
    });
};
