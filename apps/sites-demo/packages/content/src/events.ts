import { z } from 'zod';
import { defineCollection } from '@kizunajs/cms';
import { EventId, OfficeId } from './ids';

/**
 * Workshops and open days at the London shop. Only the UK runs them, so the
 * collection belongs to the UK site.
 */
export const Events = defineCollection({
    name: 'events',
    id: EventId,
    fields: [
        {
            name: 'title',
            schema: z.string().min(1).max(80),
        },
        {
            name: 'summary',
            schema: z.string().min(1).max(280),
        },
        {
            type: 'row',
            fields: [
                {
                    name: 'date',
                    schema: z.iso.date(),
                },
                {
                    name: 'time',
                    schema: z.string().min(1).max(20).describe('Like 10:00 to 12:30.'),
                },
            ],
        },
        {
            name: 'office',
            schema: OfficeId,
            position: 'sidebar',
        },
        {
            name: 'price',
            schema: z.string().max(30).optional().describe('Like £25, or Free.'),
            position: 'sidebar',
        },
    ],
    indexes: ['date'],
});
