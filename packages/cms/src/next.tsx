import { draftMode } from 'next/headers';
import { notFound } from 'next/navigation';
import { revalidateTag, unstable_cache } from 'next/cache';
import { pluginExportsOf } from 'kizunajs/adapter';
import type { PluginDeclaration } from 'kizunajs/plugin';
import { PreviewOverlay } from '@kizunajs/cms/next/preview';
import type { CmsExports, CmsSetup } from './plugin.js';
import type { PageMap } from './options.js';
import type { Output } from './output.js';
import { pageCacheTag, type CmsService } from './cms.js';
import { encodeSourcePaths } from './source-path.js';

export { inStoredOrder } from './in-order.js';

type PluginsOf<Api> = Api extends { plugins?: infer Plugins } ? Exclude<Plugins, undefined> : never;

/**
 * The pages the CMS plugin on an api declares, read off the api's type.
 */
export type PagesOf<Api, Slug extends string = 'cms'> = Slug extends keyof PluginsOf<Api>
    ? PluginsOf<Api>[Slug] extends PluginDeclaration<string, CmsSetup<infer Pages>>
        ? Pages
        : never
    : never;

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

export type CmsPages<Pages extends PageMap> = {
    [Name in keyof Pages]: CmsPageReader<Pages[Name]['page']>;
};

export interface Cms<Pages extends PageMap> {
    pages: CmsPages<Pages>;
}

const serviceOf = (api: unknown, slug: string): CmsService => {
    const exported = pluginExportsOf(api)[slug] as CmsExports | undefined;
    if (exported?.service === undefined) {
        throw new Error(`createCms() found no CMS plugin at plugins.${slug}. Install cmsPlugin on this config.`);
    }
    return exported.service;
};

/**
 * The typed reader for server components, from the configured api:
 *
 * ```ts
 * import kizuna from '../kizuna.config';
 *
 * export const cms = createCms(kizuna.api);
 * ```
 *
 * Reads happen in process, so a static build needs no server to call. Outside
 * draft mode the reader uses nobody's credentials: published content is public.
 */
export const createCms = <Api, const Slug extends string = 'cms'>(
    api: Api,
    options?: {
        slug?: Slug;
    }
): Cms<PagesOf<Api, Slug>> => {
    const slug = options?.slug ?? 'cms';
    const service = serviceOf(api, slug);
    const pages: Record<string, { get: () => Promise<Record<string, unknown>> }> = {};
    for (const name of Object.keys(service.pages)) {
        const readPublished = unstable_cache(
            async () => (await service.published(name))?.content ?? null,
            ['kizuna-cms', 'published', name],
            {
                tags: [pageCacheTag(name)],
            }
        );
        pages[name] = {
            get: async () => {
                const draft = await draftMode();
                if (draft.isEnabled) {
                    const result = await service.draft(name);
                    if (result === undefined) notFound();
                    return encodeSourcePaths(result.state.entry.page, result.content);
                }
                const published = await readPublished();
                if (published === null) notFound();
                return published;
            },
        };
    }
    return {
        pages,
    } as unknown as Cms<PagesOf<Api, Slug>>;
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
     * Headers the overlay sends with every call, such as the editor's bearer
     * token. Cookies travel on their own.
     */
    headers?: Record<string, string>;
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
            headers={props.headers}
        />
    );
}

const styles = {
    page: {
        fontFamily: 'system-ui, sans-serif',
        color: '#111',
        maxWidth: '64rem',
        margin: '0 auto',
        padding: '2rem 1rem',
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse' as const,
        fontSize: '0.9rem',
    },
    cell: {
        textAlign: 'left' as const,
        padding: '0.5rem 0.75rem',
        borderBottom: '1px solid #e5e5e5',
        verticalAlign: 'top' as const,
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
}

/**
 * The content overview, for a route of the app's own, such as `app/cms/page.tsx`.
 * Lists every page with its status, the recent versions, and the media. The
 * app decides who may open it; the preview links it mints open draft mode.
 */
export async function CmsOverview(props: CmsOverviewProps) {
    const service = serviceOf(props.api, props.slug ?? 'cms');
    const draftPath = props.draftPath ?? '/api/draft';
    const summaries = await service.summaries();
    const histories = await Promise.all(summaries.map((summary) => service.history(summary.name)));
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
                        <tr key={summary.name}>
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
