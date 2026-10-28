import { z } from 'zod';
import { definePage } from '@kizunajs/cms';
import { EmployeeId } from '../../models';
import { HeadingSchema } from '../../cms/schemas';

export default definePage({
    name: 'contactPage',
    label: 'Contact',
    requireReview: true,
    fields: [
        {
            name: 'heading',
            schema: HeadingSchema,
        },
        {
            name: 'intro',
            schema: z.string().max(240).describe('Why someone should write, in a sentence or two.'),
        },
        {
            type: 'row',
            fields: [
                {
                    name: 'buttonLabel',
                    schema: z.string().min(1).max(24).default('Send'),
                },
                {
                    name: 'thanks',
                    schema: z.string().max(200).describe('Shown after the form is sent.'),
                },
            ],
        },
        {
            name: 'contacts',
            schema: z.array(EmployeeId).max(3).default([]),
            description: 'The people shown beside the form. Up to three.',
            position: 'sidebar',
        },
    ],
});
