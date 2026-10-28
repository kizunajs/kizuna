import { z } from 'zod';
import { definePage } from '@kizunajs/cms';
import { ImageSchema, SeoSchema } from '@kizunajs/cms/schemas';
import { EyebrowSchema, HeadingSchema } from '../../cms/schemas';

export default definePage({
    name: 'teamPage',
    label: 'Team',
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
                    schema: z.string().max(240).describe('Who the team is, in a sentence or two.'),
                },
                {
                    name: 'photo',
                    schema: ImageSchema.optional(),
                },
                {
                    name: 'caption',
                    schema: z.string().max(80).optional().describe('A few words under the photo.'),
                },
            ],
        },
        {
            type: 'tab',
            label: 'Hiring',
            fields: [
                {
                    name: 'hiringHeading',
                    label: 'Hiring heading',
                    schema: HeadingSchema.optional().describe('Leave empty to hide the band at the end of the page.'),
                },
                {
                    name: 'hiringText',
                    label: 'Hiring text',
                    schema: z.string().max(200).optional(),
                },
                {
                    name: 'hiringEmail',
                    label: 'Hiring email',
                    schema: z.email().optional(),
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
            name: 'photoLayout',
            schema: z.enum(['wide', 'beside']).default('wide'),
            options: {
                wide: 'Wide, under the heading',
                beside: 'Tall, beside the heading',
            },
            position: 'sidebar',
        },
    ],
});
