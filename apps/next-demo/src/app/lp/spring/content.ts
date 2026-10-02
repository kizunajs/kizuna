import { z } from 'zod';
import { page } from '@kizunajs/cms';
import { HeroBlockSchema } from '../../../cms/blocks';
import { ProductId, SeoSchema } from '../../../cms/schemas';

export default page({
    name: 'springPage',
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
        seo: 'Search engines',
    },
});
