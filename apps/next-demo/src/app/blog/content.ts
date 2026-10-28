import { z } from 'zod';
import { definePage } from '@kizunajs/cms';
import { SeoSchema } from '@kizunajs/cms/schemas';
import { ArticleId } from '../../models';
import { EyebrowSchema, HeadingSchema } from '../../cms/schemas';

export default definePage({
    name: 'blogIndexPage',
    label: 'Journal',
    group: 'Journal',
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
                    schema: z.string().max(240).describe('What the journal is about, in a sentence or two.'),
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
            name: 'featured',
            label: 'Featured article',
            schema: ArticleId.optional(),
            description: 'Shown large at the top of the first page. Leave empty to feature the latest.',
            position: 'sidebar',
        },
    ],
});
