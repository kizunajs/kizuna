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
 * The front page, a tab per section. The sidebar picks which sections show
 * and in what order.
 */
export default definePage({
    name: 'frontPage',
    label: 'Front Page',
    fields: [
        {
            type: 'tab',
            label: 'Hero',
            fields: [
                {
                    name: 'hero',
                    schema: HeroBlockSchema,
                },
            ],
        },
        {
            type: 'tab',
            label: 'Statement',
            fields: [
                {
                    name: 'statement',
                    schema: StatementBlockSchema.optional(),
                },
            ],
        },
        {
            type: 'tab',
            label: 'Categories',
            fields: [
                {
                    name: 'categories',
                    schema: CategoriesBlockSchema.optional(),
                },
            ],
        },
        {
            type: 'tab',
            label: 'Products',
            fields: [
                {
                    name: 'products',
                    schema: ProductsBlockSchema.optional(),
                },
            ],
        },
        {
            type: 'tab',
            label: 'Photo',
            fields: [
                {
                    name: 'photo',
                    label: 'Wide photo',
                    schema: MediaBlockSchema.optional(),
                },
            ],
        },
        {
            type: 'tab',
            label: 'Columns',
            fields: [
                {
                    name: 'columns',
                    schema: ContentBlockSchema.optional(),
                },
            ],
        },
        {
            type: 'tab',
            label: 'Journal',
            fields: [
                {
                    name: 'articles',
                    label: 'Articles',
                    schema: ArchiveBlockSchema.optional(),
                },
            ],
        },
        {
            type: 'tab',
            label: 'Call to action',
            fields: [
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
