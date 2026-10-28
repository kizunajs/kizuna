import { z } from 'zod';
import { defineBlock } from '@kizunajs/cms';
import { ImageSchema, RichTextSchema } from '@kizunajs/cms/schemas';
import { ArticleId } from '../models';
import { Products } from './relationships';
import { EyebrowSchema, HeadingSchema, LinkSchema, StatementSchema } from './schemas';
import { topics } from './content';

/**
 * What editors see for each hero.
 */
export const impacts = {
    high: 'High: the heading over a photo that fills the window',
    medium: 'Medium: the heading beside a tall photo',
    low: 'Low: the heading alone',
};

/**
 * How large a hero is, which a page sets in its sidebar.
 */
export const ImpactSchema = z.enum(['high', 'medium', 'low']);

/**
 * The top of a page: its heading, and a photo when it has one. How large it
 * shows is the page's setting.
 */
export const HeroBlockSchema = defineBlock({
    name: 'hero',
    fields: [
        {
            name: 'eyebrow',
            schema: EyebrowSchema.optional(),
        },
        {
            name: 'heading',
            schema: HeadingSchema,
        },
        {
            name: 'subheading',
            schema: z.string().max(200).optional().describe('One sentence under the heading.'),
        },
        {
            name: 'image',
            schema: ImageSchema.optional(),
        },
        {
            name: 'caption',
            schema: z.string().max(80).optional().describe('A few words set small in the corner of the photo, like where it was taken.'),
        },
        {
            name: 'links',
            schema: z.array(LinkSchema).max(2).default([]),
            description: 'Under the heading. The first is a button, the second a plain link.',
        },
    ],
});

/**
 * One large sentence, with a row of small photos under it.
 */
export const StatementBlockSchema = defineBlock({
    name: 'statement',
    fields: [
        {
            name: 'eyebrow',
            schema: EyebrowSchema.optional(),
        },
        {
            name: 'text',
            schema: StatementSchema,
        },
        {
            name: 'images',
            schema: z.array(ImageSchema).max(4).default([]),
            description: 'Up to four small photos in a row under the sentence.',
        },
        {
            name: 'link',
            schema: LinkSchema.optional(),
        },
    ],
});

/**
 * Text in one to three columns, side by side from tablet width up.
 */
export const ContentBlockSchema = defineBlock({
    name: 'content',
    fields: [
        {
            name: 'eyebrow',
            schema: EyebrowSchema.optional(),
        },
        {
            name: 'heading',
            schema: HeadingSchema.optional(),
        },
        {
            name: 'columns',
            schema: z
                .array(
                    z.object({
                        heading: z.string().max(40).optional(),
                        body: RichTextSchema,
                    })
                )
                .min(1)
                .max(3),
            description: 'One column runs full width, two split the row, three make thirds.',
        },
    ],
});

/**
 * One photo the width of the window. With a heading, a green band above it
 * introduces it, in the tone the page sets.
 */
export const MediaBlockSchema = defineBlock({
    name: 'media',
    fields: [
        {
            name: 'image',
            schema: ImageSchema,
        },
        {
            name: 'caption',
            schema: z.string().max(120).optional(),
        },
        {
            name: 'heading',
            schema: StatementSchema.optional(),
            description: 'Set in a green band above the photo. Leave empty to show the photo alone.',
        },
        {
            name: 'body',
            schema: z.string().max(240).optional(),
        },
    ],
});

/**
 * A full-width green band that asks the reader to do one thing, in the tone
 * the page sets.
 */
export const CallToActionBlockSchema = defineBlock({
    name: 'callToAction',
    fields: [
        {
            name: 'eyebrow',
            schema: EyebrowSchema.optional(),
        },
        {
            name: 'heading',
            schema: StatementSchema,
        },
        {
            name: 'body',
            schema: z.string().max(240).optional().describe('Why they should, in a sentence or two.'),
        },
        {
            name: 'links',
            schema: z.array(LinkSchema).min(1).max(2),
            description: 'The first is a button, the second a plain link.',
        },
    ],
});

/**
 * Products from the shop's own API, in the order editors put them.
 */
export const ProductsBlockSchema = defineBlock({
    name: 'products',
    fields: [
        {
            name: 'eyebrow',
            schema: EyebrowSchema.optional(),
        },
        {
            name: 'heading',
            schema: HeadingSchema,
        },
        {
            name: 'products',
            schema: z.array(Products.id).max(8),
            description: 'Shown in this order, four to a row. Up to eight.',
        },
        {
            name: 'link',
            schema: LinkSchema.optional(),
            description: 'Beside the heading, like a link to the whole range.',
        },
    ],
});

/**
 * Recent articles, picked by hand or the latest of a topic.
 */
export const ArchiveBlockSchema = defineBlock({
    name: 'archive',
    fields: [
        {
            name: 'eyebrow',
            schema: EyebrowSchema.optional(),
        },
        {
            name: 'heading',
            schema: HeadingSchema,
        },
        {
            name: 'topic',
            schema: z.enum(['care', 'season', 'growers']).optional(),
            options: topics,
            description: 'Without articles picked below, the latest three of this topic show. Leave empty for every topic.',
        },
        {
            name: 'articles',
            schema: z.array(ArticleId).max(3).default([]),
            description: 'Shown in this order. Up to three.',
        },
    ],
});

/**
 * Up to three ways into the shop, each a tall photo with its name over it.
 */
export const CategoriesBlockSchema = defineBlock({
    name: 'categories',
    fields: [
        {
            name: 'eyebrow',
            schema: EyebrowSchema.optional(),
        },
        {
            name: 'heading',
            schema: HeadingSchema,
        },
        {
            name: 'categories',
            schema: z
                .array(
                    z.object({
                        name: z.string().min(1).max(30),
                        image: ImageSchema,
                        href: LinkSchema.shape.href,
                    })
                )
                .min(1)
                .max(3),
        },
    ],
});
