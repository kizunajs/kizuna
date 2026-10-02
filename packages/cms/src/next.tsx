import { draftMode } from 'next/headers';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import { revalidateTag, unstable_cache } from 'next/cache';
import { pluginExportsOf } from 'kizunajs/adapter';
import type { PluginDeclaration } from 'kizunajs/plugin';
import { ContentEditor, PreviewOverlay } from '@kizunajs/cms/next/preview';
import type { CmsExports, CmsSetup } from './plugin.js';
import { DEFAULT_SITE, type PageMap } from './options.js';
import type { Output, Resolved } from './output.js';
import { PortableText, type PortableTextComponents } from '@portabletext/react';
import type { RichTextValue } from './rich-text.js';
import type { ResolvedImage } from './image.js';
import { collectionCacheTag, documentCacheTag, pageCacheTag, type CmsService } from './cms.js';
import { servesCollection } from './page.js';
import type { ParamsOf } from './dynamic.js';
import type { Collection, Global } from './definitions.js';
import type { FieldList } from './field.js';
import { formatRef, parseRef, type DocumentRef } from './refs.js';
import type { z } from 'zod';
import { encodeSourcePaths } from './source-path.js';

export { inStoredOrder } from './in-order.js';

type PluginsOf<Api> = Api extends { plugins?: infer Plugins } ? Exclude<Plugins, undefined> : never;

type SetupOf<Api, Slug extends string> = Slug extends keyof PluginsOf<Api>
    ? PluginsOf<Api>[Slug] extends PluginDeclaration<string, infer Setup>
        ? Setup
        : never
    : never;

/**
 * The sites the CMS plugin on an api was given, when several apps share it.
 */
export type SitesOf<Api, Slug extends string = 'cms'> = SetupOf<Api, Slug> extends CmsSetup<any, any, any, infer Sites> ? Sites : {};

/**
 * The pages the CMS plugin on an api declares, read off the api's type: one
 * site's, when several apps share the CMS.
 */
export type PagesOf<Api, Slug extends string = 'cms', Site extends string = 'default'> = Site extends keyof SitesOf<Api, Slug>
    ? SitesOf<Api, Slug>[Site] extends {
          pages: infer Pages extends PageMap;
      }
        ? Pages
        : never
    : SetupOf<Api, Slug> extends CmsSetup<infer Pages, any, any, any>
      ? Pages
      : never;

/**
 * The globals the CMS plugin on an api was given.
 */
export type GlobalsOf<Api, Slug extends string = 'cms'> =
    SetupOf<Api, Slug> extends CmsSetup<any, infer Globals, any> ? Globals : readonly [];

/**
 * The collections the CMS plugin on an api was given.
 */
export type CollectionsOf<Api, Slug extends string = 'cms'> =
    SetupOf<Api, Slug> extends CmsSetup<any, any, infer Collections> ? Collections : readonly [];

/**
 * One page as a server component reads it.
 */
export interface CmsPageReader<P> {
    /**
     * The page's content, typed from its fields with media resolved. Outside
     * draft mode it is the published content, cached and tagged, and an
     * unpublished page calls `notFound()`. In draft mode it is the draft, and
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

export interface Cms<Pages extends PageMap, Globals = readonly [], Collections = readonly []> {
    pages: CmsPages<Pages>;
    globals: CmsGlobals<Globals>;
    collections: CmsCollections<Collections>;
}

const serviceOf = (api: unknown, slug: string): CmsService => {
    const exported = pluginExportsOf(api)[slug] as CmsExports | undefined;
    if (exported?.service === undefined) {
        throw new Error(`createCms() found no CMS plugin at plugins.${slug}. Install cmsPlugin on this config.`);
    }
    return exported.service;
};

const isDraftMode = async (): Promise<boolean> => (await draftMode()).isEnabled;

/**
 * Route params as stored: Next can hand a segment over still encoded.
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
 * The typed reader for server components, from the configured api:
 *
 * ```ts
 * import kizuna from '../kizuna.cms.config';
 *
 * export const cms = createCms(kizuna.api);
 * ```
 *
 * Reads happen in process, so a static build needs no server to call. Outside
 * draft mode the reader uses nobody's credentials: published content is public.
 */
export const createCms = <Api, const Slug extends string = 'cms', const Site extends string = 'default'>(
    api: Api,
    options?: {
        slug?: Slug;
        /**
         * The site this app is, when several apps share the CMS. Its pages
         * are the ones `cms.pages` reads.
         */
        site?: Site;
    }
): Cms<PagesOf<Api, Slug, Site>, GlobalsOf<Api, Slug>, CollectionsOf<Api, Slug>> => {
    const slug = options?.slug ?? 'cms';
    const service = serviceOf(api, slug);
    const site = options?.site ?? DEFAULT_SITE;
    if (service.sites[site] === undefined)
        throw new Error(`createCms() found no site named '${site}'. The CMS knows ${Object.keys(service.sites).join(', ')}.`);
    const onSite = site === DEFAULT_SITE ? {} : { site };

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
        const readPublished = unstable_cache(
            async () => (await service.published(ref))?.content ?? null,
            ['kizuna-cms', 'published', formatRef(ref)],
            {
                tags: [ref.type === 'page' ? pageCacheTag(ref.name, ref.site) : documentCacheTag(ref)],
            }
        );
        return async (): Promise<Record<string, unknown> | undefined> => {
            if (await isDraftMode()) {
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
    for (const [name, entry] of Object.entries(service.sites[site]!)) {
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
                get: async () => (await read()) ?? notFound(),
            };
            continue;
        }
        const collection = entry.page.collection.name;
        const listing = service.listing(collection);
        const item = (id: string): DocumentRef => listing.refOf(id);
        const readPublished = unstable_cache(
            async (params: string) => {
                const id = await service.findItem(collection, JSON.parse(params) as Record<string, string>, 'published');
                return id === undefined ? null : ((await service.published(item(id)))?.content ?? null);
            },
            ['kizuna-cms', 'published', `page:${name}`],
            {
                tags: [collectionCacheTag(collection)],
            }
        );
        const readAt = async (params: Record<string, string>): Promise<Record<string, unknown> | undefined> => {
            if (!(await isDraftMode())) return (await readPublished(JSON.stringify(params))) ?? undefined;
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
            get: async (params: Record<string, string>) => (await readAt(decodeParams(params))) ?? notFound(),
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
            get: async () => (await read()) ?? notFound(),
        };
    }

    /**
     * A collection's `list()`: published and cached outside draft mode,
     * drafts included and marked in it.
     */
    const listOf = (collection: string) => {
        const listing = service.listing(collection);
        const listPublished = unstable_cache(
            async (input: string) =>
                service.listItems(collection, {
                    draft: false,
                    ...(JSON.parse(input) as ListInput<unknown>),
                }),
            ['kizuna-cms', 'list', collection],
            {
                tags: [collectionCacheTag(collection)],
            }
        );
        return async (input: ListInput<unknown> = {}) => {
            if (!(await isDraftMode())) return listPublished(JSON.stringify(input));
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
            get: async (input: { id: string }) => (await item(input.id)) ?? notFound(),
            getMany: async (input: { ids: readonly string[] }) => {
                const found = await Promise.all(input.ids.map((id) => item(id)));
                return found.filter((content) => content !== undefined);
            },
            list: listOf(name),
        };
    }

    return {
        pages,
        globals,
        collections,
    } as unknown as Cms<PagesOf<Api, Slug, Site>, GlobalsOf<Api, Slug>, CollectionsOf<Api, Slug>>;
};

/**
 * Expires Next's cached renders for the tags given, so the next visit renders
 * fresh. Pass it to `cmsPlugin` as `revalidate`.
 */
export const nextRevalidate = (tags: readonly string[]): void => {
    for (const tag of tags) {
        revalidateTag(tag, {
            expire: 0,
        });
    }
};

/**
 * Rich text as a component receives it: Portable Text with its images
 * resolved.
 */
export type RichTextContent = Resolved<RichTextValue>;

export interface RichTextProps {
    value: RichTextContent;
    /**
     * Overrides for any element, keyed the way `@portabletext/react` keys
     * them: `block.h2`, `list.bullet`, `marks.link`, `types.image`, and so on.
     */
    components?: PortableTextComponents;
}

const RICH_TEXT_COMPONENTS: PortableTextComponents = {
    types: {
        image: ({ value }: { value: { image: ResolvedImage } }) => (
            <figure>
                <img
                    src={value.image.url}
                    alt={value.image.alt}
                    width={value.image.width}
                    height={value.image.height}
                    style={{
                        maxWidth: '100%',
                        height: 'auto',
                    }}
                />
            </figure>
        ),
    },
};

/**
 * Renders rich text with plain HTML elements, each of which `components`
 * may replace:
 *
 * ```tsx
 * <RichText
 *     value={article.body}
 *     components={{
 *         block: {
 *             h2: ({ children }) => <h2 className="title">{children}</h2>,
 *         },
 *     }}
 * />
 * ```
 */
export function RichText(props: RichTextProps) {
    return (
        <PortableText
            value={props.value}
            components={{
                ...props.components,
                types: {
                    ...RICH_TEXT_COMPONENTS.types,
                    ...props.components?.types,
                },
            }}
        />
    );
}

export interface KizunaPreviewProps {
    /**
     * Where the api is mounted.
     *
     * @default '/api'
     */
    apiPath?: string;
    /**
     * The plugin's `basePath`.
     *
     * @default '/cms'
     */
    basePath?: string;
    /**
     * Where the draft route is served.
     *
     * @default '/api/draft'
     */
    draftPath?: string;
    /**
     * Where editors sign in. A signed-out editor in draft mode gets a link to
     * it, back to the page they were on as `?next=`.
     *
     * @example
     * signInPath="/login"
     */
    signInPath?: string;
    /**
     * Headers the overlay sends with every call, such as the editor's bearer
     * token. Cookies travel on their own.
     */
    headers?: Record<string, string>;
    /**
     * The site this app is, when several apps share the CMS.
     */
    site?: string;
}

/**
 * The preview overlay: draft status, click-to-edit, the setup screen and the
 * publish button. Renders nothing outside draft mode, so production HTML
 * carries none of it.
 *
 * ```tsx
 * <body>
 *     {children}
 *     <KizunaPreview />
 * </body>
 * ```
 */
export async function KizunaPreview(props: KizunaPreviewProps) {
    const draft = await draftMode();
    if (!draft.isEnabled) return null;
    return (
        <PreviewOverlay
            apiPath={props.apiPath ?? '/api'}
            basePath={props.basePath ?? '/cms'}
            draftPath={props.draftPath ?? '/api/draft'}
            signInPath={props.signInPath}
            headers={props.headers}
            site={props.site}
        />
    );
}

const styles: Record<string, CSSProperties> = {
    page: {
        fontFamily: 'system-ui, sans-serif',
        color: '#111',
        maxWidth: '64rem',
        margin: '0 auto',
        padding: '2rem 1rem',
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '0.9rem',
    },
    cell: {
        textAlign: 'left',
        padding: '0.5rem 0.75rem',
        borderBottom: '1px solid #e5e5e5',
        verticalAlign: 'top',
    },
    muted: {
        color: '#666',
    },
    badge: {
        display: 'inline-block',
        padding: '0.1rem 0.5rem',
        border: '1px solid #ccc',
        borderRadius: '999px',
        fontSize: '0.75rem',
        color: '#333',
    },
    link: {
        color: '#111',
    },
};

export interface CmsOverviewProps {
    /**
     * The configured api, the one `createCms` took.
     */
    api: unknown;
    slug?: string;
    /**
     * Where the draft route is served, for the preview links.
     *
     * @default '/api/draft'
     */
    draftPath?: string;
    /**
     * Where the api is mounted, for the collection and global editor.
     *
     * @default '/api'
     */
    apiPath?: string;
    /**
     * The site this app is, when several apps share the CMS. Only its pages
     * are listed, since their previews open on this app.
     */
    site?: string;
}

const humanizeName = (name: string): string =>
    name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]/g, ' ')
        .toLowerCase()
        .replace(/^./, (first) => first.toUpperCase());

/**
 * The content overview, for a route of the app's own, such as `app/cms/page.tsx`.
 * Lists every page with its status and recent versions, edits collections and
 * globals in place, and shows the media. The app decides who may open it; the
 * preview links it mints open draft mode.
 */
export async function CmsOverview(props: CmsOverviewProps) {
    const service = serviceOf(props.api, props.slug ?? 'cms');
    const draftPath = props.draftPath ?? '/api/draft';
    const summaries = (await service.summaries()).filter((summary) => summary.site === (props.site ?? DEFAULT_SITE));
    const histories = await Promise.all(summaries.map((summary) => service.history(parseRef(summary.ref)!)));

    const media = await service.media.list();
    const token = service.previewToken();

    return (
        <main style={styles.page}>
            <h1 style={{ fontSize: '1.5rem', margin: '0 0 1.5rem' }}>Content</h1>
            <h2 style={{ fontSize: '1.1rem', margin: '0 0 0.75rem' }}>Pages</h2>
            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={styles.cell}>Page</th>
                        <th style={styles.cell}>Status</th>
                        <th style={styles.cell}>Last change</th>
                        <th style={styles.cell}>History</th>
                        <th style={styles.cell}></th>
                    </tr>
                </thead>
                <tbody>
                    {summaries.map((summary, index) => (
                        <tr key={summary.ref}>
                            <td style={styles.cell}>
                                <strong>{summary.name}</strong>
                                <div style={styles.muted}>{summary.path}</div>
                            </td>
                            <td style={styles.cell}>
                                <span style={styles.badge}>{summary.status}</span>
                            </td>
                            <td style={styles.cell}>
                                {summary.updatedAt === null ? (
                                    <span style={styles.muted}>Nothing saved yet</span>
                                ) : (
                                    <>
                                        <div>{summary.updatedBy}</div>
                                        <div style={styles.muted}>{new Date(summary.updatedAt).toLocaleString()}</div>
                                    </>
                                )}
                            </td>
                            <td style={styles.cell}>
                                {(histories[index] ?? []).slice(0, 5).map((version) => (
                                    <div key={version.version} style={{ marginBottom: '0.25rem' }}>
                                        v{version.version}
                                        {version.published ? ' (published)' : ''} <span style={styles.muted}>{version.summary ?? ''}</span>
                                    </div>
                                ))}
                            </td>
                            <td style={styles.cell}>
                                <a
                                    style={styles.link}
                                    href={`${draftPath}?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(summary.path)}`}>
                                    Open preview
                                </a>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {Object.keys(service.collections).length > 0 || Object.keys(service.globals).length > 0 ? (
                <>
                    <h2 style={{ fontSize: '1.1rem', margin: '2rem 0 0.75rem' }}>Edit content</h2>
                    <ContentEditor
                        apiPath={props.apiPath ?? '/api'}
                        basePath={service.basePath}
                        draftPath={draftPath}
                        collections={Object.values(service.collections).map((definition) => ({
                            name: definition.name,
                            label: humanizeName(definition.name),
                            group: definition.group ?? null,
                        }))}
                        globals={Object.values(service.globals).map((definition) => ({
                            name: definition.name,
                            label: humanizeName(definition.name),
                            group: definition.group ?? null,
                        }))}
                    />
                </>
            ) : null}
            <h2 style={{ fontSize: '1.1rem', margin: '2rem 0 0.75rem' }}>Media</h2>
            {media.length === 0 ? (
                <p style={styles.muted}>No uploads yet.</p>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))', gap: '1rem' }}>
                    {media.map((record) => (
                        <figure key={record.id} style={{ margin: 0 }}>
                            <img
                                src={service.imageUrl(record.id)}
                                alt={record.alt}
                                style={{
                                    width: '100%',
                                    aspectRatio: '4 / 3',
                                    objectFit: 'cover',
                                    border: '1px solid #e5e5e5',
                                    filter: 'grayscale(1)',
                                }}
                            />
                            <figcaption style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                                {record.filename}
                                <div style={styles.muted}>
                                    {record.width} × {record.height}
                                </div>
                            </figcaption>
                        </figure>
                    ))}
                </div>
            )}
        </main>
    );
}
