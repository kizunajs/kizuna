import { z } from 'zod';
import { defineBlock } from '@kizunajs/cms';
import { ImageSchema, RichTextSchema } from '@kizunajs/cms/schemas';
import { ArticleId } from '../models';
import { Products } from './relationships';
import { HeadingSchema, LinkSchema } from './schemas';
import { topics } from './content';

/**
 * What editors see for each hero.
 */
export const impacts = {
    high: 'High: the heading over a full-width image',
    medium: 'Medium: the heading beside the image',
    low: 'Low: the heading alone',
};

export const HeroBlockSchema = defineBlock({
    name: 'hero',
    fields: [
        {
            name: 'impact',
            schema: z.enum(['high', 'medium', 'low']),
            options: impacts,
        },
        {
            name: 'heading',
            schema: HeadingSchema,
        },
        {
            name: 'subheading',
            schema: z.string().max(200).describe('One sentence under the heading.'),
        },
        {
            name: 'image',
            schema: ImageSchema.optional(),
        },
        {
            name: 'links',
            schema: z.array(LinkSchema).max(2).default([]),
            description: 'Buttons under the heading. The first one stands out.',
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
 * One image, wide, with an optional line under it.
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
            schema: z.string().max(160).optional(),
        },
    ],
});

/**
 * A card that asks the reader to do one thing.
 */
export const CallToActionBlockSchema = defineBlock({
    name: 'callToAction',
    fields: [
        {
            name: 'heading',
            schema: HeadingSchema,
        },
        {
            name: 'body',
            schema: z.string().max(240).describe('Why they should, in a sentence or two.'),
        },
        {
            name: 'links',
            schema: z.array(LinkSchema).min(1).max(2),
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
            name: 'heading',
            schema: HeadingSchema,
        },
        {
            name: 'products',
            schema: z.array(Products.id).max(6),
            description: 'Shown in this order. Up to six.',
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
            name: 'heading',
            schema: HeadingSchema,
        },
        {
            name: 'topic',
            schema: z.enum(['news', 'guides', 'stories']).optional(),
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
