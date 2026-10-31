import { z } from 'zod';
import { defineCollection } from '@kizunajs/cms';
import { ImageSchema } from '@kizunajs/cms/schemas';
import { ProductId } from './ids';

/**
 * The plants Hagen sells in its shops, which the newsletter shows. The shops
 * set the price, so a product holds the price as it reads, like `£24`.
 */
export const Products = defineCollection({
    name: 'products',
    id: ProductId,
    group: 'Plants',
    fields: [
        {
            type: 'row',
            fields: [
                {
                    name: 'name',
                    schema: z.string().min(1).max(60),
                },
                {
                    name: 'price',
                    schema: z.string().min(1).max(20).describe('The price as it reads, like £24 or from £18.'),
                    localized: false,
                },
            ],
        },
        {
            name: 'summary',
            schema: z.string().min(1).max(160).describe('One or two sentences, under 25 words.'),
        },
        {
            name: 'photo',
            schema: ImageSchema,
            position: 'sidebar',
        },
    ],
    indexes: ['name'],
});
