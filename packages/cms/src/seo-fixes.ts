import type { z } from 'zod';
import { readMeta, unwrapOptionalWrappers } from 'kizunajs/generator';
import { dataFields } from './field.js';
import type { ContentDefinition } from './definitions.js';

/**
 * The fixes for pages that compete for one search: moving what one page says
 * into another before merging them, and linking one to another on the words
 * where it repeats the topic. Both work on rich text as stored.
 */

/**
 * One node of rich text as stored: a text block, an image, or a block.
 */
export type RichTextNode = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const newKey = (): string => globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12);

const isRichTextSchema = (schema: z.core.$ZodType): boolean =>
    (readMeta(schema)?.['x-kizuna'] ?? readMeta(unwrapOptionalWrappers(schema).inner)?.['x-kizuna']) === 'rich-text';

/**
 * The names of a document's rich text fields, in the order it lists them.
 */
export const richTextFieldsOf = (definition: ContentDefinition): string[] =>
    dataFields(definition.fields)
        .filter((field) => isRichTextSchema(field.schema))
        .map((field) => field.name);

/**
 * The nodes a rich text value holds, or none for anything else.
 */
export const nodesOf = (value: unknown): RichTextNode[] => (Array.isArray(value) ? value.filter(isRecord) : []);

const spansOf = (node: RichTextNode): Array<Record<string, unknown>> =>
    Array.isArray(node['children']) ? (node['children'] as unknown[]).filter(isRecord) : [];

const SKIPPED = new Set(['_key', '_type', 'ref', 'href', 'style', 'listItem', 'level', 'marks', 'markDefs', 'image']);

const wordsIn = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(wordsIn).join(' ');
    if (!isRecord(value)) return '';
    return Object.entries(value)
        .filter(([key]) => !SKIPPED.has(key))
        .map(([, child]) => wordsIn(child))
        .join(' ');
};

/**
 * The words a node shows: a text block's spans, or the text a block's fields
 * hold.
 */
export const nodeText = (node: RichTextNode): string =>
    node['_type'] === 'block'
        ? spansOf(node)
              .map((span) => String(span['text'] ?? ''))
              .join('')
        : wordsIn(node).replace(/\s+/g, ' ').trim();

/**
 * Text as compared between pages: in lower case, with punctuation and runs
 * of spaces read as one space, so "Water weekly." and "water weekly" say the
 * same.
 */
export const normalisedText = (text: string): string =>
    text
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();

const withoutKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(withoutKeys);
    if (!isRecord(value)) return value;
    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => key !== '_key')
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, child]) => [key, withoutKeys(child)])
    );
};

/**
 * What a node says, for telling whether another page says it too: its words,
 * or for a node without words, like an image, the node itself.
 */
const sayingOf = (node: RichTextNode): string | undefined => {
    const text = normalisedText(nodeText(node));
    if (text !== '') return text;
    if (node['_type'] === 'block') return undefined;
    return JSON.stringify(withoutKeys(node));
};

/**
 * The nodes of `other` that `winner` does not say already, compared by their
 * words. An empty paragraph says nothing, so it never counts.
 */
export const unsaidNodes = (winner: readonly RichTextNode[], other: readonly RichTextNode[]): RichTextNode[] => {
    const said = new Set(winner.map(sayingOf).filter((saying) => saying !== undefined));
    return other.filter((node) => {
        const saying = sayingOf(node);
        return saying !== undefined && !said.has(saying);
    });
};

/**
 * What kind of node a part is, as the merge dialog names it.
 */
export type PartKind = 'paragraph' | 'heading' | 'quote' | 'listItem' | 'image' | 'block';

export const partKindOf = (node: RichTextNode): PartKind => {
    if (node['_type'] === 'image') return 'image';
    if (node['_type'] !== 'block') return 'block';
    if (node['listItem'] !== undefined) return 'listItem';
    if (node['style'] === 'blockquote') return 'quote';
    if (typeof node['style'] === 'string' && /^h[1-6]$/.test(node['style'])) return 'heading';
    return 'paragraph';
};

/**
 * A heading of rich text.
 */
const headingNode = (text: string): RichTextNode => ({
    _type: 'block',
    _key: newKey(),
    style: 'h2',
    markDefs: [],
    children: [
        {
            _type: 'span',
            _key: newKey(),
            text,
            marks: [],
        },
    ],
});

/**
 * The winner's rich text with each merged page's parts after it, under a
 * heading with that page's title. Each part takes a new `_key`, so none
 * collides with one the winner holds.
 */
export const mergedRichText = (
    winner: readonly RichTextNode[],
    sections: ReadonlyArray<{
        title: string;
        nodes: readonly RichTextNode[];
    }>
): RichTextNode[] => [
    ...winner,
    ...sections.flatMap((section) =>
        section.nodes.length === 0
            ? []
            : [
                  headingNode(section.title),
                  ...section.nodes.map((node) => ({
                      ...node,
                      _key: newKey(),
                  })),
              ]
    ),
];

/**
 * Where a page repeats the topic: the words that can carry a link, as their
 * place in one text block's text, and the sentence they sit in.
 */
export interface TopicMatch {
    field: string;
    /**
     * The `_key` of the text block.
     */
    block: string;
    /**
     * Where the words start and end in the block's text.
     */
    start: number;
    end: number;
    phrase: string;
    sentence: string;
    /**
     * Where the words start in `sentence`.
     */
    at: number;
}

const DECORATORS = new Set(['strong', 'em', 'code', 'underline']);

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The spans of a block with where each starts and ends in its text.
 */
const placedSpans = (node: RichTextNode): Array<{ span: Record<string, unknown>; start: number; end: number }> => {
    let offset = 0;
    return spansOf(node).map((span) => {
        const start = offset;
        offset += String(span['text'] ?? '').length;
        return {
            span,
            start,
            end: offset,
        };
    });
};

const marksOf = (span: Record<string, unknown>): string[] =>
    Array.isArray(span['marks']) ? (span['marks'] as unknown[]).filter((mark): mark is string => typeof mark === 'string') : [];

/**
 * Whether the words between `start` and `end` may take a link: no span of
 * them is code or a link already.
 */
const mayLink = (node: RichTextNode, start: number, end: number): boolean =>
    placedSpans(node)
        .filter((placed) => placed.end > start && placed.start < end)
        .every((placed) => marksOf(placed.span).every((mark) => mark !== 'code' && DECORATORS.has(mark)));

const sentenceAround = (text: string, start: number, end: number): { sentence: string; at: number } => {
    let from = 0;
    for (const match of text.slice(0, start).matchAll(/[.!?]+\s+/g)) from = match.index + match[0].length;
    const after = /[.!?]+(?=\s|$)/.exec(text.slice(end));
    const to = after === null ? text.length : end + after.index + after[0].length;
    const sentence = text.slice(from, to);
    const trimmed = sentence.trimStart();
    return {
        sentence: trimmed.trimEnd(),
        at: start - from - (sentence.length - trimmed.length),
    };
};

/**
 * The first place a page's rich text says one of `phrases`, the first phrase
 * first, as whole words in any case, in a paragraph, quote or list item
 * whose words carry no link yet.
 */
export const topicMatchOf = (
    fields: ReadonlyArray<{
        field: string;
        nodes: readonly RichTextNode[];
    }>,
    phrases: readonly string[]
): TopicMatch | undefined => {
    for (const phrase of phrases) {
        if (phrase.trim() === '') continue;
        const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped(phrase.trim())}(?![\\p{L}\\p{N}])`, 'giu');
        for (const { field, nodes } of fields) {
            for (const node of nodes) {
                if (node['_type'] !== 'block' || partKindOf(node) === 'heading' || typeof node['_key'] !== 'string') continue;
                const text = nodeText(node);
                for (const found of text.matchAll(pattern)) {
                    const start = found.index;
                    const end = start + found[0].length;
                    if (!mayLink(node, start, end)) continue;
                    return {
                        field,
                        block: node['_key'],
                        start,
                        end,
                        phrase: found[0],
                        ...sentenceAround(text, start, end),
                    };
                }
            }
        }
    }
    return undefined;
};

/**
 * The rich text with a link to `ref` on the words a match found, splitting
 * the spans at its ends so only those words carry it. `undefined` when the
 * block is gone, its words changed, or they carry a link already.
 */
export const withLinkAt = (
    nodes: readonly RichTextNode[],
    match: Pick<TopicMatch, 'block' | 'start' | 'end' | 'phrase'>,
    ref: string
): RichTextNode[] | undefined => {
    const index = nodes.findIndex((node) => node['_type'] === 'block' && node['_key'] === match.block);
    const node = nodes[index];
    if (node === undefined) return undefined;
    if (nodeText(node).slice(match.start, match.end) !== match.phrase || !mayLink(node, match.start, match.end)) return undefined;
    const taken = new Set(spansOf(node).map((span) => span['_key']));
    const markDefs = Array.isArray(node['markDefs']) ? (node['markDefs'] as unknown[]) : [];
    const markKeys = new Set(markDefs.filter(isRecord).map((mark) => mark['_key']));
    let mark = newKey();
    while (markKeys.has(mark) || DECORATORS.has(mark)) mark = newKey();
    const children: Array<Record<string, unknown>> = [];
    for (const { span, start, end } of placedSpans(node)) {
        if (end <= match.start || start >= match.end) {
            children.push(span);
            continue;
        }
        const text = String(span['text'] ?? '');
        const cuts = [
            {
                text: text.slice(0, Math.max(0, match.start - start)),
                linked: false,
            },
            {
                text: text.slice(Math.max(0, match.start - start), Math.min(text.length, match.end - start)),
                linked: true,
            },
            {
                text: text.slice(Math.min(text.length, match.end - start)),
                linked: false,
            },
        ].filter((cut) => cut.text !== '');
        cuts.forEach((cut, position) => {
            let key = String(span['_key']);
            if (position > 0) {
                key = newKey();
                while (taken.has(key)) key = newKey();
                taken.add(key);
            }
            children.push({
                ...span,
                _key: key,
                text: cut.text,
                marks: cut.linked ? [...marksOf(span), mark] : marksOf(span),
            });
        });
    }
    const linked: RichTextNode = {
        ...node,
        markDefs: [
            ...markDefs,
            {
                _type: 'link',
                _key: mark,
                ref,
            },
        ],
        children,
    };
    return nodes.map((each, position) => (position === index ? linked : each));
};
