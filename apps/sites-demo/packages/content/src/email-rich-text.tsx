import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { Heading, Img, Link, Text } from '@react-email/components';
import type { Output } from '@kizunajs/cms';
import type { Newsletters } from './newsletters';
import { absolute } from './email-blocks';
import { colors, fonts } from './email-theme';

type RichTextNode = Output<typeof Newsletters>['body'][number];
type TextBlock = Extract<
    RichTextNode,
    {
        _type: 'block';
    }
>;
type Span = TextBlock['children'][number];

/**
 * The nodes of the body that are blocks, like an article card.
 */
type BlockNode = Exclude<
    RichTextNode,
    {
        _type: 'block' | 'image';
    }
>;

/**
 * The component for each block the body may hold, by its name, given the
 * block's fields.
 */
export type EmailBlocks = {
    [Name in BlockNode['_type']]: (
        props: Extract<
            BlockNode,
            {
                _type: Name;
            }
        >
    ) => ReactNode;
};

const styles = {
    paragraph: {
        margin: '0 0 16px',
        fontFamily: fonts.sans,
        fontSize: '16px',
        lineHeight: '26px',
        color: colors.ink,
    },
    heading: {
        margin: '32px 0 12px',
        fontFamily: fonts.serif,
        fontWeight: 400,
        color: colors.ink,
    },
    quote: {
        margin: '0 0 16px',
        paddingLeft: '16px',
        borderLeft: `3px solid ${colors.sage}`,
        fontFamily: fonts.serif,
        fontSize: '18px',
        lineHeight: '28px',
        color: colors.inkMuted,
    },
    list: {
        margin: '0 0 16px',
        paddingLeft: '24px',
        fontFamily: fonts.sans,
        fontSize: '16px',
        lineHeight: '26px',
        color: colors.ink,
    },
    listItem: {
        margin: '0 0 6px',
    },
    link: {
        color: colors.forest,
        textDecoration: 'underline',
    },
    code: {
        padding: '1px 4px',
        fontFamily: 'Menlo, Consolas, monospace',
        fontSize: '14px',
        backgroundColor: colors.sage,
    },
    image: {
        width: '100%',
        height: 'auto',
        margin: '8px 0 24px',
    },
} satisfies Record<string, CSSProperties>;

const HEADING_SIZES = {
    h2: '26px',
    h3: '21px',
    h4: '18px',
} satisfies Record<string, string>;

const spanContent = (span: Span, block: TextBlock, siteUrl: string): ReactNode => {
    let content: ReactNode = span.text;
    for (const mark of span.marks) {
        if (mark === 'strong') content = <strong>{content}</strong>;
        else if (mark === 'em') content = <em>{content}</em>;
        else if (mark === 'underline') content = <u>{content}</u>;
        else if (mark === 'code') content = <code style={styles.code}>{content}</code>;
        else {
            const link = block.markDefs.find((definition) => definition._key === mark);
            if (link !== undefined) {
                content = (
                    <Link href={absolute(link.href, siteUrl)} style={styles.link}>
                        {content}
                    </Link>
                );
            }
        }
    }
    return <Fragment key={span._key}>{content}</Fragment>;
};

const blockContent = (block: TextBlock, siteUrl: string): ReactNode => block.children.map((span) => spanContent(span, block, siteUrl));

/**
 * A block's node handed to the component named for it.
 */
const renderBlock = <Node extends BlockNode>(node: Node, blocks: EmailBlocks): ReactNode =>
    (blocks[node._type] as (props: Node) => ReactNode)(node);

function EmailBlock({ node, siteUrl, blocks }: { node: RichTextNode; siteUrl: string; blocks: EmailBlocks }) {
    if (node._type !== 'block' && node._type !== 'image') return renderBlock(node, blocks);
    if (node._type === 'image') {
        return <Img src={absolute(node.image.url, siteUrl)} alt={node.image.alt} width={node.image.width} style={styles.image} />;
    }
    if (node.style === 'h2' || node.style === 'h3' || node.style === 'h4') {
        return (
            <Heading
                as={node.style}
                style={{
                    ...styles.heading,
                    fontSize: HEADING_SIZES[node.style],
                }}>
                {blockContent(node, siteUrl)}
            </Heading>
        );
    }
    if (node.style === 'blockquote') return <Text style={styles.quote}>{blockContent(node, siteUrl)}</Text>;
    return <Text style={styles.paragraph}>{blockContent(node, siteUrl)}</Text>;
}

function EmailList({ items, siteUrl }: { items: TextBlock[]; siteUrl: string }) {
    const List = items[0]?.listItem === 'number' ? 'ol' : 'ul';
    return (
        <List style={styles.list}>
            {items.map((item) => (
                <li
                    key={item._key}
                    style={{
                        ...styles.listItem,
                        marginLeft: `${((item.level ?? 1) - 1) * 20}px`,
                    }}>
                    {blockContent(item, siteUrl)}
                </li>
            ))}
        </List>
    );
}

/**
 * Rich text as email markup, with inline styles an inbox keeps. Portable Text
 * stores each list item as a block of its own, so consecutive items of one
 * kind of list join into one list. Each block goes to its component in
 * `blocks`.
 */
export function EmailRichText({ value, siteUrl, blocks }: { value: readonly RichTextNode[]; siteUrl: string; blocks: EmailBlocks }) {
    const groups: (RichTextNode | TextBlock[])[] = [];
    for (const node of value) {
        const last = groups.at(-1);
        if (node._type === 'block' && node.listItem !== undefined) {
            if (Array.isArray(last) && last[0]?.listItem === node.listItem) last.push(node);
            else groups.push([node]);
        } else {
            groups.push(node);
        }
    }
    return groups.map((group) =>
        Array.isArray(group) ? (
            <EmailList key={group[0]?._key} items={group} siteUrl={siteUrl} />
        ) : (
            <EmailBlock key={group._key} node={group} siteUrl={siteUrl} blocks={blocks} />
        )
    );
}
