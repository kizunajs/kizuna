import { z } from 'zod';
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
export const RichTextSchema = z.array(z.discriminatedUnion('_type', [RichTextBlockSchema, RichTextImageSchema])).meta({
    'x-kizuna': 'rich-text',
    description:
        'Portable Text: an array of blocks. A text block has _type "block", a unique _key, a style (normal, h2, h3, h4, blockquote), an optional listItem (bullet, number) and level, markDefs holding links, and children spans with text and marks. An image block has _type "image", a _key and an image.',
});

/**
 * Rich text as stored.
 */
export type RichTextValue = z.output<typeof RichTextSchema>;

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
