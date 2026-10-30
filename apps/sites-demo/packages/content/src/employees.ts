import { z } from 'zod';
import { defineCollection } from '@kizunajs/cms';
import { EmployeeId, OfficeId } from './ids';

/**
 * Everyone at Hagen, in every country. Every site shows them.
 */
export const Employees = defineCollection({
    name: 'employees',
    id: EmployeeId,
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
                    name: 'role',
                    schema: z.string().min(1).max(60).describe('Their title, as on a business card.'),
                },
            ],
        },
        {
            name: 'bio',
            schema: z.string().max(280).optional().describe('Two sentences at most.'),
        },
        {
            name: 'email',
            schema: z.email().optional(),
        },
        {
            name: 'office',
            schema: OfficeId,
            position: 'sidebar',
        },
        {
            name: 'order',
            label: 'Sort order',
            schema: z.int().min(0).default(0).describe('Lower comes first within an office.'),
            position: 'sidebar',
        },
    ],
    indexes: ['office', 'order', 'name'],
});
