import { z } from 'zod';
import { defineCollection } from '@kizunajs/cms';
import { ImageSchema } from '@kizunajs/cms/schemas';
import { OfficeId } from './ids';

/**
 * Hagen's shops. Every site shows them, and each site may answer the phones
 * with its own number. Only the UK lists opening hours.
 */
export const Offices = defineCollection({
    name: 'offices',
    id: OfficeId,
    group: 'Company',
    fields: [
        {
            type: 'row',
            fields: [
                {
                    name: 'name',
                    schema: z.string().min(1).max(60),
                },
                {
                    name: 'city',
                    schema: z.string().min(1).max(60),
                },
            ],
        },
        {
            name: 'address',
            schema: z.string().min(1).max(120),
        },
        {
            name: 'phone',
            schema: z.string().min(1).max(30),
            perSite: true,
        },
        {
            name: 'openingHours',
            schema: z.string().max(120).optional(),
            sites: ['uk'],
        },
        {
            name: 'photo',
            schema: ImageSchema.optional(),
            position: 'sidebar',
        },
        {
            name: 'order',
            label: 'Sort order',
            schema: z.int().min(0).default(0).describe('Lower comes first.'),
            position: 'sidebar',
        },
    ],
    indexes: ['order', 'name'],
});
