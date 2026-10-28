import { z } from 'zod';
import { definePage } from '@kizunajs/cms';
import { SeoSchema } from '@kizunajs/cms/schemas';
import { EmployeeId } from '../../models';
import { EyebrowSchema, HeadingSchema } from '../../cms/schemas';

export default definePage({
    name: 'contactPage',
    label: 'Contact',
    requireReview: true,
    fields: [
        {
            type: 'tab',
            label: 'Content',
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
                    name: 'intro',
                    schema: z.string().max(240).describe('Why someone should write, in a sentence or two.'),
                },
                {
                    name: 'directions',
                    schema: z.string().max(240).optional().describe('How to find the shop, beside the address.'),
                },
            ],
        },
        {
            type: 'tab',
            label: 'Form',
            fields: [
                {
                    name: 'subjects',
                    schema: z.array(z.string().min(1).max(40)).max(5).default([]),
                    description: 'What a message can be about, offered as a choice above the message. Leave empty to hide the choice.',
                },
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
            type: 'tab',
            label: 'SEO',
            fields: [
                {
                    name: 'seo',
                    label: 'SEO',
                    schema: SeoSchema.optional(),
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
