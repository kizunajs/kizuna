import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { block } from './block.js';
import { ImageSchema } from './image.js';
import { page } from './page.js';
import type { Output } from './output.js';

const ProductId = Kizuna.brand('ProductId', z.string());

const HeroBlockSchema = block({
    slug: 'hero',
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

const springPage = page({
    name: 'springPage',
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
    labels: {
        hero: 'Hero',
    },
});

test('a page name and its field names infer as literals without as const', () => {
    expectTypeOf(springPage.name).toEqualTypeOf<'springPage'>();
    expectTypeOf(springPage.fields[0].name).toEqualTypeOf<'hero'>();
    expectTypeOf(springPage.fields[3].auth).toEqualTypeOf<{
        readonly roles: 'admin';
    }>();
});

test('a block is a Zod object typed from its fields', () => {
    expectTypeOf(HeroBlockSchema.shape.heading).toEqualTypeOf<z.ZodString>();
    expectTypeOf<z.output<typeof HeroBlockSchema>['subheading']>().toEqualTypeOf<string | undefined>();
});

test('the page schema has one property per field', () => {
    expectTypeOf<keyof z.output<typeof springPage.schema>>().toEqualTypeOf<'hero' | 'featured' | 'gallery' | 'seo'>();
});

test('Output resolves every image, in a block, in an array, and keeps brands and optionality', () => {
    type Spring = Output<typeof springPage>;
    expectTypeOf<Spring['hero']['image']>().toEqualTypeOf<{
        id: string;
        url: string;
        alt: string;
        width: number;
        height: number;
    }>();
    expectTypeOf<Spring['hero']['heading']>().toEqualTypeOf<string>();
    expectTypeOf<Spring['hero']['subheading']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Spring['featured']>().toEqualTypeOf<(string & z.core.$brand<'ProductId'>)[]>();
    expectTypeOf<Spring['gallery'][number]['url']>().toEqualTypeOf<string>();
    expectTypeOf<Spring['seo']>().toEqualTypeOf<{
        title: string;
    }>();
});

test('Output of a block is the same as the field that holds it', () => {
    expectTypeOf<Output<typeof HeroBlockSchema>>().toEqualTypeOf<Output<typeof springPage>['hero']>();
});

test('a field listed twice fails to compile', () => {
    page({
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

test('a label for a field the page does not have fails to compile', () => {
    page({
        name: 'aboutPage',
        fields: [
            {
                name: 'heading',
                schema: z.string(),
            },
        ],
        labels: {
            // @ts-expect-error not a field
            title: 'Title',
        },
    });
});

test('fields is required', () => {
    // @ts-expect-error fields is required
    page({
        name: 'aboutPage',
    });
    // @ts-expect-error fields is required
    block({
        slug: 'hero',
    });
});

test('a field option outside the five is rejected', () => {
    page({
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
