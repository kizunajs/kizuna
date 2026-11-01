import { z } from 'zod';
import { defineBlock } from '@kizunajs/cms';
import { croppedImage, link, richText, richTextFromPlain } from '@kizunajs/cms/schemas';
import { ArticleId, EmployeeId, ProductId } from './ids';

/**
 * A tip, a warning or a note, set apart from the text around it.
 */
export const CalloutBlockSchema = defineBlock({
    name: 'callout',
    label: 'Callout',
    icon: 'info',
    description: 'A tip, a warning or a note, set apart from the text.',
    fields: [
        {
            name: 'tone',
            schema: z.enum(['tip', 'warning', 'note']).default('tip'),
            options: {
                tip: 'Tip',
                warning: 'Warning',
                note: 'Note',
            },
        },
        {
            name: 'text',
            schema: z.string().min(1).max(400).describe('Two sentences at most.'),
        },
    ],
});

/**
 * A sentence someone at Hagen said, large, with their name and role under it.
 */
export const PullQuoteBlockSchema = defineBlock({
    name: 'pullQuote',
    label: 'Pull quote',
    icon: 'quote',
    description: 'A sentence someone at Hagen said, with their name and role.',
    fields: [
        {
            name: 'quote',
            schema: z.string().min(1).max(280),
        },
        {
            name: 'person',
            schema: EmployeeId,
        },
    ],
});

/**
 * One plant from the shops: its photo, name, price and summary.
 */
export const PlantCardBlockSchema = defineBlock({
    name: 'plantCard',
    label: 'Plant',
    icon: 'leaf',
    description: 'One plant from the shops, with its photo, name and price.',
    fields: [
        {
            name: 'plant',
            schema: ProductId,
        },
    ],
});

/**
 * A photo across the text column, with a line under it.
 */
export const FigureBlockSchema = defineBlock({
    name: 'figure',
    label: 'Image with caption',
    icon: 'image',
    description: 'A photo across the text, with a caption under it.',
    fields: [
        {
            name: 'image',
            schema: croppedImage({
                aspectRatio: '3:2',
            }),
        },
        {
            name: 'caption',
            schema: z.string().max(200).optional(),
        },
    ],
});

/**
 * Two photos side by side, with one caption under both.
 */
export const ImagePairBlockSchema = defineBlock({
    name: 'imagePair',
    label: 'Two images',
    icon: 'gallery',
    description: 'Two photos side by side, like a before and after.',
    fields: [
        {
            name: 'left',
            schema: croppedImage({
                aspectRatio: '4:5',
            }),
        },
        {
            name: 'right',
            schema: croppedImage({
                aspectRatio: '4:5',
            }),
        },
        {
            name: 'caption',
            schema: z.string().max(200).optional(),
        },
    ],
});

/**
 * Questions a reader asks, each answer folded under its question.
 */
export const FaqBlockSchema = defineBlock({
    name: 'faq',
    label: 'Questions',
    icon: 'question',
    description: 'Questions and answers, each answer folded under its question.',
    fields: [
        {
            name: 'questions',
            schema: z
                .array(
                    z.object({
                        question: z.string().min(1).max(160),
                        answer: z.string().min(1).max(600),
                    })
                )
                .min(1)
                .max(12),
        },
    ],
});

/**
 * A link set as a button, for the one thing a reader does next.
 */
export const ButtonBlockSchema = defineBlock({
    name: 'button',
    label: 'Button',
    icon: 'button',
    description: 'A link set as a button, for the one thing to do next.',
    fields: [
        {
            name: 'link',
            schema: link().describe('Give it the words the button shows, like Book a visit.'),
        },
    ],
});

/**
 * Another article from the journal, with its photo and summary.
 */
export const RelatedArticleBlockSchema = defineBlock({
    name: 'relatedArticle',
    label: 'Related article',
    icon: 'article',
    description: 'Another article from the journal, with its photo and summary.',
    fields: [
        {
            name: 'article',
            schema: ArticleId,
        },
    ],
});

/**
 * The text of an article or a page: paragraphs, headings, lists, links and
 * images, with any of the blocks between them.
 */
export const BodyTextSchema = richText({
    blocks: [
        CalloutBlockSchema,
        PullQuoteBlockSchema,
        PlantCardBlockSchema,
        FigureBlockSchema,
        ImagePairBlockSchema,
        FaqBlockSchema,
        ButtonBlockSchema,
        RelatedArticleBlockSchema,
    ],
});

/**
 * A migrate step for a body that was plain text, with a blank line between
 * paragraphs, and is now rich text.
 */
export const bodyAsRichText = (document: Record<string, unknown>): Record<string, unknown> =>
    typeof document['body'] === 'string'
        ? {
              ...document,
              body: richTextFromPlain(document['body']),
          }
        : document;
