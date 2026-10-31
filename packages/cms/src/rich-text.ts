import { z } from 'zod';
import { readDef, unwrapOptionalWrappers } from 'kizunajs/generator';
import { assertWholeItem, readBlock, type Block, type BLOCK, type BlockSchema } from './block.js';
import { dataFields, describedForAgents, objectOf } from './field.js';
import { ImageSchema } from './image.js';

const KEY = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/**
 * The marks rich text may put on a span without data: bold, italic, inline
 * code and underline.
 */
export const RichTextDecoratorSchema = z.enum(['strong', 'em', 'code', 'underline']);

/**
 * What a link may point at: an http or https URL, `mailto:`, `tel:`, a path on
 * this site, or an anchor. Never `javascript:` or `data:`.
 */
export const SAFE_HREF = /^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;

export const RichTextLinkSchema = z.object({
    _type: z.literal('link'),
    _key: KEY,
    href: z
        .string()
        .max(2048)
        .regex(SAFE_HREF)
        .describe('An https or http URL, mailto:, tel:, a path on this site like /blog, or an #anchor.'),
});

export const RichTextSpanSchema = z.object({
    _type: z.literal('span'),
    _key: KEY,
    text: z.string(),
    marks: z.array(KEY).default([]).describe("Decorators (strong, em, code, underline), and the _key of a link in the block's markDefs."),
});

export const RichTextBlockSchema = z
    .object({
        _type: z.literal('block'),
        _key: KEY,
        style: z.enum(['normal', 'h2', 'h3', 'h4', 'blockquote']).default('normal'),
        listItem: z.enum(['bullet', 'number']).optional(),
        level: z.int().min(1).max(3).optional(),
        markDefs: z.array(RichTextLinkSchema).default([]),
        children: z.array(RichTextSpanSchema).min(1),
    })
    .superRefine((block, context) => {
        const known = new Set<string>([...RichTextDecoratorSchema.options, ...block.markDefs.map((link) => link._key)]);
        for (const [index, span] of block.children.entries()) {
            for (const [position, mark] of span.marks.entries()) {
                if (known.has(mark)) continue;
                context.addIssue({
                    code: 'custom',
                    path: ['children', index, 'marks', position],
                    message: `'${mark}' is neither a decorator nor the _key of a link in markDefs.`,
                });
            }
        }
    });

export const RichTextImageSchema = z.object({
    _type: z.literal('image'),
    _key: KEY,
    image: ImageSchema,
});

const RICH_TEXT_DESCRIPTION =
    'Portable Text: an array of blocks. A text block has _type "block", a unique _key, a style (normal, h2, h3, h4, blockquote), an optional listItem (bullet, number) and level, markDefs holding links, and children spans with text and marks. An image block has _type "image", a _key and an image.';

/**
 * Rich text, stored as Portable Text and checked by Zod like every other
 * field: paragraphs, headings, quotes, lists, bold, italic, code and
 * underline, links to safe URLs, and images. Never HTML.
 *
 * @example
 * {
 *     name: 'body',
 *     schema: RichTextSchema,
 * },
 */
export const RichTextSchema = describedForAgents(
    z.array(z.discriminatedUnion('_type', [RichTextBlockSchema, RichTextImageSchema])).meta({
        'x-kizuna': 'rich-text',
        description: RICH_TEXT_DESCRIPTION,
    })
);

/**
 * Rich text as stored.
 */
export type RichTextValue = z.output<typeof RichTextSchema>;

/**
 * The `_type` values rich text keeps for its own nodes, which no block may take
 * as its name.
 */
const OWN_TYPES: readonly string[] = ['block', 'span', 'link', 'image'];

/**
 * A block as a node of rich text: its name under `_type`, a `_key`, and the
 * block's own fields beside them.
 */
export type RichTextBlockNodeSchema<Each> = Each extends z.ZodObject<infer Shape extends z.core.$ZodShape, z.core.$strip> & {
    readonly [BLOCK]: infer Name extends string;
}
    ? z.ZodObject<
          {
              [Key in '_type' | '_key' | keyof Shape]: Key extends '_type'
                  ? z.ZodLiteral<Name>
                  : Key extends '_key'
                    ? z.ZodString
                    : Shape[Key];
          },
          z.core.$strip
      >
    : never;

/**
 * What {@link richText} returns: rich text whose nodes may also be any of the
 * blocks, told apart by `_type`.
 */
export type RichTextWithBlocksSchema<List extends readonly BlockSchema[]> = z.ZodArray<
    z.ZodDiscriminatedUnion<
        [
            typeof RichTextBlockSchema,
            typeof RichTextImageSchema,
            ...{
                -readonly [Index in keyof List]: RichTextBlockNodeSchema<List[Index]>;
            },
        ],
        '_type'
    >
>;

const richTextBlocks = new WeakMap<z.core.$ZodType, readonly Block[]>();

/**
 * Rich text that may also hold blocks between its paragraphs, like a card for
 * an article or a row of products. Each block sits in the text as a node with
 * its name under `_type`, a `_key`, and its own fields beside them, so a
 * relationship field stores the id it picks. Editors insert one from the
 * toolbar, beside Image.
 *
 * @example
 * {
 *     name: 'body',
 *     schema: richText({
 *         blocks: [ArticleBlockSchema, ProductBlockSchema],
 *     }),
 * },
 */
export const richText = <const List extends readonly [BlockSchema, ...BlockSchema[]]>(options: {
    blocks: List;
}): RichTextWithBlocksSchema<List> => {
    const list = options.blocks;
    if (!Array.isArray(list) || list.length === 0) {
        throw new Error('richText() lists no blocks. Name the blocks editors may insert, or use RichTextSchema for text alone.');
    }
    const held: Block[] = [];
    const nodes = list.map((schema, index) => {
        const block = readBlock(schema);
        if (block === undefined) {
            throw new Error(`richText() takes blocks made with defineBlock(), and item ${index + 1} is something else.`);
        }
        if (OWN_TYPES.includes(block.name)) {
            throw new Error(`richText() holds the block '${block.name}', a name rich text keeps for its own nodes. Rename the block.`);
        }
        if (held.some((existing) => existing.name === block.name)) {
            throw new Error(`richText() lists the block '${block.name}' twice.`);
        }
        for (const field of dataFields(block.fields)) {
            if (field.name === '_type' || field.name === '_key') {
                throw new Error(
                    `richText() holds the block '${block.name}', which has a field named '${field.name}'. Rich text keeps that key for itself, so rename the field.`
                );
            }
        }
        assertWholeItem(block.fields, block.name, 'richText()');
        held.push(block);
        const node = objectOf(block.fields, {
            _type: z.literal(block.name),
            _key: KEY,
        });
        return block.description === undefined ? node : node.describe(block.description);
    });
    const union = z.discriminatedUnion('_type', [RichTextBlockSchema, RichTextImageSchema, ...nodes] as unknown as [
        z.ZodObject,
        ...z.ZodObject[],
    ]);
    richTextBlocks.set(union, held);
    const names = held.map((block) => `'${block.name}'`).join(', ');
    return describedForAgents(
        z.array(union).meta({
            'x-kizuna': 'rich-text',
            description: `${RICH_TEXT_DESCRIPTION} A block node has _type naming its block (${names}), a unique _key, and that block's fields beside them.`,
        })
    ) as unknown as RichTextWithBlocksSchema<List>;
};

/**
 * The blocks a {@link richText} field may hold, read through `.optional()`,
 * `.default()` and `.describe()`, or `undefined` for any other schema.
 */
export const readRichTextBlocks = (schema: z.core.$ZodType): readonly Block[] | undefined => {
    const inner = readDef(unwrapOptionalWrappers(schema).inner);
    return inner.type === 'array' && inner.element !== undefined ? richTextBlocks.get(inner.element) : undefined;
};

const newKey = (): string => globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12);

/**
 * Plain text as rich text, one paragraph per blank-line-separated run, for
 * seeding content or a `migrate` step that turns a text field into rich text.
 *
 * @example
 * migrate: {
 *     1: (document) => ({
 *         ...document,
 *         body: richTextFromPlain(String(document['body'] ?? '')),
 *     }),
 * },
 */
export const richTextFromPlain = (text: string): RichTextValue =>
    text
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter((paragraph) => paragraph !== '')
        .map((paragraph) => ({
            _type: 'block',
            _key: newKey(),
            style: 'normal',
            markDefs: [],
            children: [
                {
                    _type: 'span',
                    _key: newKey(),
                    text: paragraph,
                    marks: [],
                },
            ],
        }));

/**
 * Whether a field holds rich text, read off the flag its JSON Schema carries.
 */
export const isRichTextJsonSchema = (schema: Record<string, unknown>): boolean => schema['x-kizuna'] === 'rich-text';
