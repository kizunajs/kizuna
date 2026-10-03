import { z } from 'zod';
import { definePage } from '@kizunajs/cms';
import { HeroBlockSchema } from '../../cms/blocks';
import { ArticleId } from '../../models';
import { Products } from '../../cms/relationships';
import { SeoSchema } from '@kizunajs/cms/schemas';

export default definePage({
    name: 'frontPage',
    label: 'Front Page',
    fields: [
        {
            name: 'hero',
            label: 'Hero',
            schema: HeroBlockSchema,
        },
        {
            name: 'featured',
            label: 'Featured products',
            schema: z.array(Products.id).max(6),
            description: 'Products shown in the grid, in this order. Up to six.',
        },
        {
            name: 'articles',
            label: 'Featured articles',
            schema: z.array(ArticleId).max(3).default([]),
            description: 'Articles shown under the products, in this order. Up to three; none shows the latest.',
        },
        {
            name: 'seo',
            label: 'SEO',
            schema: SeoSchema,
        },
    ],
});
