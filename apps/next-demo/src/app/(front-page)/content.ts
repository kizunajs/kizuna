import { z } from 'zod';
import { definePage } from '@kizunajs/cms';
import { SeoSchema } from '@kizunajs/cms/schemas';
import {
    ArchiveBlockSchema,
    CallToActionBlockSchema,
    CategoriesBlockSchema,
    ContentBlockSchema,
    HeroBlockSchema,
    ImpactSchema,
    impacts,
    MediaBlockSchema,
    ProductsBlockSchema,
    StatementBlockSchema,
} from '../../cms/blocks';
import { ToneSchema, tones } from '../../cms/schemas';

/**
 * The front page. Its sections are filled in under Content, and the sidebar
 * picks which of them show and in what order.
 */
export default definePage({
    name: 'frontPage',
    label: 'Front Page',
    fields: [
        {
            type: 'tab',
            label: 'Content',
            fields: [
                {
                    name: 'hero',
                    schema: HeroBlockSchema,
                },
                {
                    name: 'statement',
                    schema: StatementBlockSchema.optional(),
                },
                {
                    name: 'categories',
                    schema: CategoriesBlockSchema.optional(),
                },
                {
                    name: 'products',
                    schema: ProductsBlockSchema.optional(),
                },
                {
                    name: 'photo',
                    label: 'Wide photo',
                    schema: MediaBlockSchema.optional(),
                },
                {
                    name: 'columns',
                    schema: ContentBlockSchema.optional(),
                },
                {
                    name: 'articles',
                    schema: ArchiveBlockSchema.optional(),
                },
                {
                    name: 'callToAction',
                    label: 'Call to action',
                    schema: CallToActionBlockSchema.optional(),
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
                    schema: SeoSchema,
                },
            ],
        },
        {
            name: 'heroImpact',
            label: 'Hero size',
            schema: ImpactSchema.default('high'),
            options: impacts,
            position: 'sidebar',
        },
        {
            name: 'sections',
            schema: z
                .array(z.enum(['statement', 'categories', 'products', 'photo', 'columns', 'articles', 'callToAction']))
                .max(7)
                .default(['statement', 'categories', 'products', 'photo', 'columns', 'articles', 'callToAction']),
            description: 'The sections under the hero, in this order. Remove one to hide it, or add it again to show it.',
            position: 'sidebar',
        },
        {
            type: 'collapsible',
            label: 'Colours',
            position: 'sidebar',
            fields: [
                {
                    name: 'photoTone',
                    label: 'Wide photo band',
                    schema: ToneSchema.default('sage'),
                    options: tones,
                },
                {
                    name: 'callToActionTone',
                    label: 'Call to action band',
                    schema: ToneSchema.default('forest'),
                    options: tones,
                },
            ],
        },
    ],
});
