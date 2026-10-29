import { blocks, definePage } from '@kizunajs/cms';
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

/**
 * The blocks each section of the front page was stored as before it held a
 * list, in the order they showed when no order was stored.
 */
const earlierSections: Readonly<Record<string, string>> = {
    statement: 'statement',
    categories: 'categories',
    products: 'products',
    photo: 'media',
    columns: 'content',
    articles: 'archive',
    callToAction: 'callToAction',
};

/**
 * The front page: its hero, then the sections editors add under it, in the
 * order they put them.
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
            label: 'Content',
            fields: [
                {
                    name: 'sections',
                    schema: blocks([
                        StatementBlockSchema,
                        CategoriesBlockSchema,
                        ProductsBlockSchema,
                        MediaBlockSchema,
                        ContentBlockSchema,
                        ArchiveBlockSchema,
                        CallToActionBlockSchema,
                    ])
                        .max(12)
                        .default([]),
                    description: 'The page under the hero, top to bottom.',
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
    ],
    migrate: {
        // A field per section, shown in the order `sections` listed, becomes one list. A section left out of that order showed nowhere, so it is dropped.
        1: (document) => {
            const { sections, photoTone, callToActionTone, ...rest } = document;
            const order = Array.isArray(sections) && sections.length > 0 ? sections.map(String) : Object.keys(earlierSections);
            const list = [...new Set(order)].flatMap((section) => {
                const block = earlierSections[section];
                const stored = document[section];
                if (block === undefined || typeof stored !== 'object' || stored === null) return [];
                const tone = block === 'media' ? photoTone : block === 'callToAction' ? callToActionTone : undefined;
                return [
                    {
                        block,
                        ...stored,
                        ...(tone === undefined
                            ? {}
                            : {
                                  tone,
                              }),
                    },
                ];
            });
            for (const section of Object.keys(earlierSections)) delete rest[section];
            return {
                ...rest,
                sections: list,
            };
        },
    },
});
