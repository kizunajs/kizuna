import { definePage } from '@kizunajs/cms';
import { SeoSchema } from '@kizunajs/cms/schemas';
import {
    ArchiveBlockSchema,
    CallToActionBlockSchema,
    ContentBlockSchema,
    HeroBlockSchema,
    MediaBlockSchema,
    ProductsBlockSchema,
} from '../../cms/blocks';

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
                    label: 'Hero',
                    schema: HeroBlockSchema,
                },
            ],
        },
        {
            type: 'tab',
            label: 'Content',
            fields: [
                {
                    name: 'intro',
                    label: 'Introduction',
                    schema: ContentBlockSchema.optional(),
                    description: 'Columns of text under the hero.',
                },
                {
                    name: 'shop',
                    label: 'Products',
                    schema: ProductsBlockSchema,
                },
                {
                    name: 'media',
                    label: 'Wide image',
                    schema: MediaBlockSchema.optional(),
                },
                {
                    name: 'latest',
                    label: 'Articles',
                    schema: ArchiveBlockSchema,
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
    ],
    migrate: {
        // The hero's one button became a list of links, and the products and
        // articles moved into blocks with headings of their own.
        1: (document) => {
            const { featured, articles, hero, ...rest } = document;
            const { cta, ...heroRest } = (hero ?? {}) as Record<string, unknown>;
            return {
                ...rest,
                hero: {
                    ...heroRest,
                    impact: 'high',
                    links: cta === undefined ? [] : [cta],
                },
                shop: {
                    heading: 'In the shop this week',
                    products: featured ?? [],
                },
                latest: {
                    heading: 'From the blog',
                    articles: articles ?? [],
                },
            };
        },
    },
});
