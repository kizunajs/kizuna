import { z } from 'zod';
import { definePage } from '@kizunajs/cms';
import { HeroBlockSchema } from '../../cms/blocks';
import { ArticleId, ProductId } from '../../models';
import { SeoSchema } from '../../cms/schemas';

export default definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'hero',
            schema: HeroBlockSchema,
        },
        {
            name: 'featured',
            schema: z.array(ProductId).max(6),
            description: 'Products shown in the grid, in this order. Up to six.',
        },
        {
            name: 'articles',
            schema: z.array(ArticleId).max(3).default([]),
            description: 'Articles shown under the products, in this order. Up to three; none shows the latest.',
        },
        {
            name: 'seo',
            schema: SeoSchema,
            auth: {
                roles: 'admin',
            },
        },
    ],
    labels: {
        hero: 'Hero',
        featured: 'Featured products',
        articles: 'Featured articles',
        seo: 'Search engines',
    },
});
