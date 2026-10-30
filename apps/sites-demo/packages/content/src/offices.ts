import { z } from 'zod';
import { defineCollection } from '@kizunajs/cms';
import { OfficeId } from './ids';

/**
 * Hagen's shops. Every site shows them, and each site may answer the phones
 * with its own number.
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
            // TODO(sites): `perSite: true`, so the UK sets its own number.
        },
        {
            name: 'openingHours',
            schema: z.string().max(120).optional(),
            // TODO(sites): `sites: ['uk']`, so only the UK shows and stores it.
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
