/**
 * What picking an entry in the slash menu does, the same as its button in the
 * toolbar.
 */
export type SlashAction =
    | {
          kind: 'style';
          style: string;
      }
    | {
          kind: 'list';
          listItem: string;
      }
    | {
          kind: 'image';
      }
    | {
          kind: 'link';
      }
    | {
          kind: 'block';
          name: string;
      };

/**
 * One entry in the slash menu, under a heading, matched by its label and
 * keywords.
 */
export interface SlashItem {
    key: string;
    label: string;
    group: 'Text' | 'Lists' | 'Insert' | 'Blocks';
    keywords: readonly string[];
    action: SlashAction;
}

/**
 * Everything a rich text field allows, as the slash menu lists it: the text
 * styles, the lists, an image, a link to a page, and each block the field
 * holds by its label.
 */
export const slashItemsOf = (blocks: ReadonlyArray<{ name: string; label: string }>): SlashItem[] => [
    {
        key: 'normal',
        label: 'Paragraph',
        group: 'Text',
        keywords: ['text', 'normal'],
        action: {
            kind: 'style',
            style: 'normal',
        },
    },
    {
        key: 'h2',
        label: 'Heading',
        group: 'Text',
        keywords: ['h2', 'title'],
        action: {
            kind: 'style',
            style: 'h2',
        },
    },
    {
        key: 'h3',
        label: 'Subheading',
        group: 'Text',
        keywords: ['h3', 'heading'],
        action: {
            kind: 'style',
            style: 'h3',
        },
    },
    {
        key: 'blockquote',
        label: 'Quote',
        group: 'Text',
        keywords: ['quotation', 'citation'],
        action: {
            kind: 'style',
            style: 'blockquote',
        },
    },
    {
        key: 'bullet',
        label: 'Bulleted list',
        group: 'Lists',
        keywords: ['ul', 'unordered', 'bullet'],
        action: {
            kind: 'list',
            listItem: 'bullet',
        },
    },
    {
        key: 'number',
        label: 'Numbered list',
        group: 'Lists',
        keywords: ['ol', 'ordered', 'number'],
        action: {
            kind: 'list',
            listItem: 'number',
        },
    },
    {
        key: 'image',
        label: 'Image',
        group: 'Insert',
        keywords: ['picture', 'photo', 'media'],
        action: {
            kind: 'image',
        },
    },
    {
        key: 'link',
        label: 'Link to a page',
        group: 'Insert',
        keywords: ['link', 'page', 'item'],
        action: {
            kind: 'link',
        },
    },
    ...blocks.map(
        (block): SlashItem => ({
            key: `block:${block.name}`,
            label: block.label,
            group: 'Blocks',
            keywords: [block.name, 'block'],
            action: {
                kind: 'block',
                name: block.name,
            },
        })
    ),
];

/**
 * Text as the menu compares it: lower case, without spaces, hyphens or
 * underscores, so `numberedlist` finds Numbered list.
 */
const comparable = (text: string): string => text.toLowerCase().replace(/[\s\-_]/g, '');

/**
 * How well an item matches what was typed after the slash, best first, or
 * `undefined` when it does not.
 */
const rankOf = (item: SlashItem, query: string): number | undefined => {
    const label = item.label.toLowerCase();
    if (label.startsWith(query.toLowerCase())) return 0;
    if (
        label
            .split(/\s+/)
            .slice(1)
            .some((word) => word.startsWith(query.toLowerCase()))
    )
        return 1;
    const wanted = comparable(query);
    if (item.keywords.some((keyword) => comparable(keyword).startsWith(wanted))) return 2;
    if (wanted.length < 2) return undefined;
    if (comparable(item.label).includes(wanted) || item.keywords.some((keyword) => comparable(keyword).includes(wanted))) return 3;
    return undefined;
};

/**
 * The items matching what was typed after the slash, the closest first and
 * otherwise in the menu's order. An empty query keeps every item.
 */
export const filterSlashItems = (items: readonly SlashItem[], query: string): SlashItem[] => {
    if (comparable(query) === '') return [...items];
    return items
        .map((item, index) => ({
            item,
            index,
            rank: rankOf(item, query),
        }))
        .filter((candidate): candidate is { item: SlashItem; index: number; rank: number } => candidate.rank !== undefined)
        .sort((left, right) => left.rank - right.rank || left.index - right.index)
        .map((candidate) => candidate.item);
};

/**
 * The items under their headings, each heading where its first item falls,
 * so the closest match stays on top. Each item keeps its place in the flat
 * list the arrow keys move through.
 */
export const groupSlashItems = (
    items: readonly SlashItem[]
): Array<{ group: SlashItem['group']; items: Array<{ item: SlashItem; index: number }> }> => {
    const groups = [...new Set(items.map((item) => item.group))].map((group) => ({
        group,
        items: items.filter((item) => item.group === group),
    }));
    let index = 0;
    return groups.map((entry) => ({
        group: entry.group,
        items: entry.items.map((item) => ({
            item,
            index: index++,
        })),
    }));
};

/**
 * The slash being typed in a line, from the text before and after the caret:
 * a `/` at the start of an empty line or after a space, and the word typed
 * after it. `offset` is where the slash sits in the line.
 */
export const slashQueryOf = (before: string, after: string): { query: string; offset: number } | undefined => {
    const match = /(^|\s)\/([^\s/]{0,40})$/.exec(before);
    if (match === null) return undefined;
    const lead = match[1]!;
    if (lead === '' && after !== '') return undefined;
    return {
        query: match[2]!,
        offset: match.index + lead.length,
    };
};

/**
 * The next item the arrow keys land on, wrapping at either end.
 */
export const stepSlashIndex = (index: number, step: 1 | -1, count: number): number => (count === 0 ? 0 : (index + step + count) % count);
