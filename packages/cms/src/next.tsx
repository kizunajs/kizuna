import type { ReactNode } from 'react';
import { PreviewOverlay } from '@kizunajs/cms/next/preview';
import type { Resolved } from './output.js';
import { PortableText, type PortableTextComponents } from '@portabletext/react';
import type { RichTextValue } from './rich-text.js';
import type { ResolvedImage } from './image.js';
import { sourceOf } from './reader.js';
import { DRAFT_EVENTS_PATH } from './draft-events.js';
import { PREVIEW_COOKIE } from './preview-token.js';

export { inStoredOrder } from './in-order.js';

/**
 * Rich text as a component receives it: Portable Text with its images
 * resolved.
 */
export type RichTextContent = Resolved<RichTextValue>;

/**
 * The nodes of rich text that are blocks, read off a `richText()` field's
 * value: every node but its text and images.
 */
export type RichTextBlockNode<Value extends readonly RichTextNode[]> = BlockNodeOf<Value[number]>;

type BlockNodeOf<Node> = Node extends RichTextNode
    ? Node['_type'] extends 'block' | 'image'
        ? never
        : string extends Node['_type']
          ? never
          : Node
    : never;

/**
 * A component for each block rich text may hold, keyed by the block's name.
 * Each receives the block's fields as its props.
 */
export type RichTextBlockComponents<Node extends RichTextNode> = {
    [Name in Node['_type']]: (
        props: Extract<
            Node,
            {
                _type: Name;
            }
        >
    ) => ReactNode;
};

/**
 * Any node of rich text, a text block, an image or a block.
 */
export interface RichTextNode {
    _type: string;
    _key: string;
}

export type RichTextProps<Value extends readonly RichTextNode[] = RichTextContent> = {
    value: Value;
    /**
     * Overrides for any element, keyed the way `@portabletext/react` keys
     * them: `block.h2`, `list.bullet`, `marks.link`, `types.image`, and so on.
     */
    components?: PortableTextComponents;
} & ([RichTextBlockNode<Value>] extends [never]
    ? {
          blocks?: undefined;
      }
    : {
          /**
           * The component for each block the field may hold, by name.
           */
          blocks: RichTextBlockComponents<RichTextBlockNode<Value>>;
      });

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
 *
 * Rich text made with `richText()` names a component for each block it may
 * hold, which receives the block's fields:
 *
 * ```tsx
 * <RichText
 *     value={newsletter.body}
 *     blocks={{
 *         article: (props) => <ArticleCard id={props.article} />,
 *     }}
 * />
 * ```
 */
export function RichText<const Value extends readonly RichTextNode[]>(props: RichTextProps<Value>) {
    const blocks = Object.fromEntries(
        Object.entries((props.blocks ?? {}) as Record<string, (node: RichTextNode) => ReactNode>).map(([name, Block]) => [
            name,
            ({ value }: { value: RichTextNode }) => <Block {...value} />,
        ])
    );
    return (
        <PortableText
            value={props.value as unknown as RichTextContent}
            components={{
                ...props.components,
                types: {
                    ...RICH_TEXT_COMPONENTS.types,
                    ...blocks,
                    ...props.components?.types,
                },
            }}
        />
    );
}

export interface KizunaPreviewProps {
    /**
     * `kizuna.content`, or a view `kizuna.content.of()` returns.
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
    const token = (await runtime.cookies()).get(PREVIEW_COOKIE);
    return (
        <PreviewOverlay
            expiresAt={token === undefined ? undefined : source.service.previewExpiry(token)}
            draftPath={`${apiPath}${source.service.basePath}/draft`}
            eventsPath={`${apiPath}${source.service.basePath}${DRAFT_EVENTS_PATH}`}
        />
    );
}
