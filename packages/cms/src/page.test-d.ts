import { expectTypeOf, test } from 'vitest';
import type { KizunaBrand } from 'kizunajs';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { defineBlock } from './block.js';
import { ImageSchema } from './image.js';
import { definePage } from './page.js';
import { defineCollection, type Collection } from './definitions.js';
import type { Output } from './output.js';

const ProductId = Kizuna.brand('ProductId', z.string());

const HeroBlockSchema = defineBlock({
    name: 'hero',
    fields: [
        {
            name: 'heading',
            schema: z.string().max(60),
        },
        {
            name: 'subheading',
            schema: z.string().max(200).optional(),
        },
        {
            name: 'image',
            schema: ImageSchema,
        },
    ],
});

const FrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'hero',
            schema: HeroBlockSchema,
        },
        {
            name: 'featured',
            schema: z.array(ProductId).max(6),
        },
        {
            name: 'gallery',
            schema: z.array(ImageSchema),
        },
        {
            name: 'seo',
            schema: z.object({
                title: z.string(),
            }),
            auth: {
                roles: 'admin',
            },
        },
    ],
});

test('a page name and its field names infer as literals without as const', () => {
    expectTypeOf(FrontPage.name).toEqualTypeOf<'frontPage'>();
    expectTypeOf(FrontPage.fields[0].name).toEqualTypeOf<'hero'>();
    expectTypeOf(FrontPage.fields[3].auth).toEqualTypeOf<{
        readonly roles: 'admin';
    }>();
});

test('a block is a Zod object typed from its fields', () => {
    expectTypeOf(HeroBlockSchema.shape.heading).toEqualTypeOf<z.ZodString>();
    expectTypeOf<z.output<typeof HeroBlockSchema>['subheading']>().toEqualTypeOf<string | undefined>();
});

test('the page schema has one property per field', () => {
    expectTypeOf<keyof z.output<typeof FrontPage.schema>>().toEqualTypeOf<'hero' | 'featured' | 'gallery' | 'seo'>();
});

test('Output resolves every image, in a block, in an array, and keeps brands and optionality', () => {
    type Spring = Output<typeof FrontPage>;
    expectTypeOf<Spring['hero']['image']>().toEqualTypeOf<{
        id: string;
        url: string;
        alt: string;
        width: number;
        height: number;
    }>();
    expectTypeOf<Spring['hero']['heading']>().toEqualTypeOf<string>();
    expectTypeOf<Spring['hero']['subheading']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Spring['featured']>().toEqualTypeOf<(string & KizunaBrand<'ProductId'>)[]>();
    expectTypeOf<Spring['gallery'][number]['url']>().toEqualTypeOf<string>();
    expectTypeOf<Spring['seo']>().toEqualTypeOf<{
        title: string;
    }>();
});

test('Output of a block is the same as the field that holds it', () => {
    expectTypeOf<Output<typeof HeroBlockSchema>>().toEqualTypeOf<Output<typeof FrontPage>['hero']>();
});

test('a field listed twice fails to compile', () => {
    definePage({
        name: 'aboutPage',
        // @ts-expect-error heading is listed twice
        fields: [
            {
                name: 'heading',
                schema: z.string(),
            },
            {
                name: 'heading',
                schema: z.string(),
            },
        ],
    });
});

test('fields is required', () => {
    // @ts-expect-error fields is required
    definePage({
        name: 'aboutPage',
    });
    // @ts-expect-error fields is required
    defineBlock({
        name: 'hero',
    });
});

test('a field option outside the five is rejected', () => {
    definePage({
        name: 'aboutPage',
        // @ts-expect-error there is no initial option
        fields: [
            {
                name: 'heading',
                schema: z.string(),
                initial: 'Hello',
            },
        ],
    });
});

const ArticlePage = definePage({
    name: 'articlePage',
    fields: [
        {
            type: 'tab',
            label: 'Content',
            fields: [
                {
                    name: 'title',
                    schema: z.string().max(80),
                },
                {
                    type: 'row',
                    fields: [
                        {
                            name: 'image',
                            schema: ImageSchema,
                            width: '50%',
                        },
                        {
                            name: 'summary',
                            schema: z.string().max(160).optional(),
                            width: '50%',
                        },
                    ],
                },
            ],
        },
        {
            type: 'collapsible',
            label: 'Publishing',
            position: 'sidebar',
            fields: [
                {
                    name: 'category',
                    schema: z.enum(['news', 'guide']),
                },
            ],
        },
    ],
});

test('a field inside a tab, a row or a collapsible reads at the top level', () => {
    expectTypeOf<keyof z.output<typeof ArticlePage.schema>>().toEqualTypeOf<'title' | 'image' | 'summary' | 'category'>();
    expectTypeOf<Output<typeof ArticlePage>['title']>().toEqualTypeOf<string>();
    expectTypeOf<Output<typeof ArticlePage>['summary']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Output<typeof ArticlePage>['image']['url']>().toEqualTypeOf<string>();
    expectTypeOf<Output<typeof ArticlePage>['category']>().toEqualTypeOf<'news' | 'guide'>();
});

test('a block arranged in a row reads flat too', () => {
    const CardBlockSchema = defineBlock({
        name: 'card',
        fields: [
            {
                type: 'row',
                fields: [
                    {
                        name: 'heading',
                        schema: z.string(),
                    },
                    {
                        name: 'image',
                        schema: ImageSchema,
                    },
                ],
            },
        ],
    });
    expectTypeOf<keyof z.output<typeof CardBlockSchema>>().toEqualTypeOf<'heading' | 'image'>();
});

test('a field listed inside a tab and outside it fails to compile', () => {
    definePage({
        name: 'aboutPage',
        // @ts-expect-error heading is listed twice
        fields: [
            {
                type: 'tab',
                label: 'Content',
                fields: [
                    {
                        name: 'heading',
                        schema: z.string(),
                    },
                ],
            },
            {
                name: 'heading',
                schema: z.string(),
            },
        ],
    });
});

test('a field listed in two tabs fails to compile', () => {
    definePage({
        name: 'aboutPage',
        // @ts-expect-error heading is listed twice
        fields: [
            {
                type: 'tab',
                label: 'Content',
                fields: [
                    {
                        name: 'heading',
                        schema: z.string(),
                    },
                ],
            },
            {
                type: 'tab',
                label: 'Card',
                fields: [
                    {
                        type: 'row',
                        fields: [
                            {
                                name: 'heading',
                                schema: z.string(),
                            },
                        ],
                    },
                ],
            },
        ],
    });
});

test('a row takes no label', () => {
    definePage({
        name: 'aboutPage',
        // @ts-expect-error a row has no label
        fields: [
            {
                type: 'row',
                label: 'Card',
                fields: [
                    {
                        name: 'heading',
                        schema: z.string(),
                    },
                ],
            },
        ],
    });
});

test('a collection indexes a field inside a tab', () => {
    defineCollection({
        name: 'articles',
        id: Kizuna.brand('ArticleId', z.string()),
        fields: [
            {
                type: 'tab',
                label: 'Content',
                fields: [
                    {
                        name: 'slug',
                        schema: z.string(),
                    },
                ],
            },
        ],
        indexes: ['slug'],
    });
    defineCollection({
        name: 'articles',
        id: Kizuna.brand('ArticleId', z.string()),
        fields: [
            {
                type: 'tab',
                label: 'Content',
                fields: [
                    {
                        name: 'slug',
                        schema: z.string(),
                    },
                ],
            },
        ],
        // @ts-expect-error there is no title field
        indexes: ['title'],
    });
});

test("a collection's preview url reads the item as its draft stands", () => {
    const EmployeeId = Kizuna.brand('EmployeeId', z.string());
    const Employees = defineCollection({
        name: 'employees',
        id: EmployeeId,
        preview: {
            url: ({ item }) => {
                expectTypeOf(item.id).toEqualTypeOf<z.output<typeof EmployeeId>>();
                expectTypeOf(item.department).toEqualTypeOf<'design' | 'engineering' | undefined>();
                return `/preview/employees/${item.id}`;
            },
        },
        fields: [
            {
                name: 'department',
                schema: z.enum(['design', 'engineering']),
            },
        ],
    });
    expectTypeOf(Employees).toExtend<Collection>();
});
