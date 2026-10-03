import { PreviewOverlay } from '@kizunajs/cms/next/preview';
import type { Resolved } from './output.js';
import { PortableText, type PortableTextComponents } from '@portabletext/react';
import type { RichTextValue } from './rich-text.js';
import type { ResolvedImage } from './image.js';
import { sourceOf } from './reader.js';

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
}

/**
 * The site's preview in draft mode: inside the editor, it outlines the fields
 * and tells the editor which one was clicked. Open in a tab of its own, it
 * shows a bar to leave draft mode. Renders nothing outside draft mode, so
 * production HTML carries none of it.
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
    const apiPath = source.service.options.apiPath ?? '/api';
    return <PreviewOverlay draftPath={`${apiPath}${source.service.basePath}/draft`} />;
}
