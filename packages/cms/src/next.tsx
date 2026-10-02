import type { CSSProperties } from 'react';
import { ContentEditor, PreviewOverlay } from '@kizunajs/cms/next/preview';
import { DEFAULT_SITE } from './options.js';
import type { Resolved } from './output.js';
import { PortableText, type PortableTextComponents } from '@portabletext/react';
import type { RichTextValue } from './rich-text.js';
import type { ResolvedImage } from './image.js';
import { parseRef } from './refs.js';
import { sourceOf, type ReaderSource } from './reader.js';

export { inStoredOrder } from './in-order.js';

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
     * `kizuna.content`, or one of its `sites` when several apps share the CMS.
     */
    content: unknown;
    /**
     * Where editors sign in, for a signed-out editor in draft mode. Defaults
     * to the `signInPath` on `cms()`.
     */
    signInPath?: string;
    /**
     * Headers the overlay sends with every call, such as the editor's bearer
     * token. Cookies travel on their own.
     */
    headers?: Record<string, string>;
}

/**
 * Where the overlay and the content editor reach the CMS from the browser.
 */
const browserPaths = (source: ReaderSource) => {
    const apiPath = source.service.options.apiPath ?? '/api';
    return {
        apiPath,
        basePath: `${source.service.basePath}/editing`,
        draftPath: `${apiPath}${source.service.basePath}/draft`,
    };
};

/**
 * The preview overlay: draft status, click-to-edit, the setup screen and the
 * publish button. Renders nothing outside draft mode, so production HTML
 * carries none of it.
 *
 * ```tsx
 * <body>
 *     {children}
 *     <KizunaPreview content={kizuna.content} />
 * </body>
 * ```
 */
export async function KizunaPreview(props: KizunaPreviewProps) {
    const source = sourceOf(props.content);
    const runtime = source.service.runtime;
    if (runtime === undefined || !(await runtime.draftMode()).enabled) return null;
    const signInPath = props.signInPath ?? source.service.options.signInPath;
    return (
        <PreviewOverlay
            {...browserPaths(source)}
            {...(signInPath === undefined
                ? {}
                : {
                      signInPath,
                  })}
            headers={props.headers}
            site={source.site === DEFAULT_SITE ? undefined : source.site}
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
     * `kizuna.content`, or one of its `sites`, whose pages are listed, since
     * their previews open on this app.
     */
    content: unknown;
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
    const source = sourceOf(props.content);
    const { service, site } = source;
    const { apiPath, basePath, draftPath } = browserPaths(source);
    const summaries = (await service.summaries()).filter((summary) => summary.site === site);
    const orphans = (await service.orphanedPages()).filter((orphan) => orphan.site === site);
    const problems = (await service.contentProblems()).filter((problem) => {
        const ref = parseRef(problem.ref);
        return ref?.type !== 'page' || (ref.site ?? DEFAULT_SITE) === site;
    });
    const histories = await Promise.all(summaries.map((summary) => service.history(parseRef(summary.ref)!)));

    const media = await service.media.list();

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
                                <a style={styles.link} href={`${draftPath}?redirect=${encodeURIComponent(summary.path)}`}>
                                    Open preview
                                </a>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {orphans.length > 0 ? (
                <section
                    style={{
                        marginTop: '1.5rem',
                    }}>
                    <h2
                        style={{
                            fontSize: '1.1rem',
                            margin: '0 0 0.5rem',
                        }}>
                        Content with no page
                    </h2>
                    <p style={styles.muted}>
                        These pages were renamed or removed in code, and their content is still stored. Move it to the new name, or leave
                        it.
                    </p>
                    <pre
                        style={{
                            background: '#f4f4f4',
                            padding: '0.75rem',
                            overflow: 'auto',
                            fontSize: '0.8rem',
                        }}>
                        {orphans
                            .map(
                                (orphan) =>
                                    `kizuna cms rename-page ${orphan.name} <new name>${orphan.site === DEFAULT_SITE ? '' : ` --site ${orphan.site}`}`
                            )
                            .join('\n')}
                    </pre>
                </section>
            ) : null}
            {problems.length > 0 ? (
                <section
                    style={{
                        marginTop: '1.5rem',
                    }}>
                    <h2
                        style={{
                            fontSize: '1.1rem',
                            margin: '0 0 0.5rem',
                        }}>
                        Published content that fails its schema
                    </h2>
                    <p style={styles.muted}>
                        The code changed and this content no longer fits it. Visitors see the earlier version named here, or nothing when no
                        earlier version fits. Fix the content and publish it again, or add a migrate step.
                    </p>
                    <table style={styles.table}>
                        <tbody>
                            {problems.map((problem) => (
                                <tr key={problem.ref}>
                                    <td style={styles.cell}>
                                        <strong>{problem.ref}</strong>
                                        <div style={styles.muted}>
                                            {problem.serving === undefined
                                                ? 'Reads as unpublished'
                                                : `Visitors see version ${problem.serving}`}
                                        </div>
                                    </td>
                                    <td style={styles.cell}>
                                        {problem.issues.map((issue) => (
                                            <div key={issue}>{issue}</div>
                                        ))}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            ) : null}
            {Object.keys(service.collections).length > 0 || Object.keys(service.globals).length > 0 ? (
                <>
                    <h2 style={{ fontSize: '1.1rem', margin: '2rem 0 0.75rem' }}>Edit content</h2>
                    <ContentEditor
                        apiPath={apiPath}
                        basePath={basePath}
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
