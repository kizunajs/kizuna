import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { block } from './block.js';
import { fieldDescription, undeclaredFieldRoles } from './field.js';
import { isPage, page } from './page.js';

const ProductId = Kizuna.brand('ProductId', z.string());

const HeroBlockSchema = block({
    slug: 'hero',
    fields: [
        {
            name: 'heading',
            schema: z.string().max(60),
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
            schema: z.array(ProductId).max(2),
            description: 'Products shown in the grid, in this order.',
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
    migrate: {
        1: (document) => ({
            ...document,
            featured: [],
        }),
    },
});

describe('page', () => {
    it('keeps the definition and marks it as a page', () => {
        expect(springPage.name).toBe('springPage');
        expect(springPage.fields.map((field) => field.name)).toEqual(['hero', 'featured', 'seo']);
        expect(isPage(springPage)).toBe(true);
        expect(isPage(HeroBlockSchema)).toBe(false);
    });

    it('builds a schema the whole page is checked against', () => {
        const result = springPage.schema.safeParse({
            hero: {
                heading: 'Spring',
            },
            featured: ['prod_1', 'prod_2', 'prod_3'],
            seo: {
                title: 'Spring',
            },
        });
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.path).toEqual(['featured']);
    });

    it('throws on a name that is not an identifier', () => {
        expect(() =>
            page({
                name: 'spring-page',
                fields: [
                    {
                        name: 'heading',
                        schema: z.string(),
                    },
                ],
            })
        ).toThrow("page() has the name 'spring-page'");
    });

    it('throws on a label for a field it does not have', () => {
        expect(() =>
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
            })
        ).toThrow("page('aboutPage') labels 'title', which is not one of its fields.");
    });

    it('throws on a migrate step that is not a version number', () => {
        expect(() =>
            page({
                name: 'aboutPage',
                fields: [
                    {
                        name: 'heading',
                        schema: z.string(),
                    },
                ],
                migrate: {
                    0: (document) => document,
                },
            })
        ).toThrow("page('aboutPage') has a migrate step '0'");
    });
});

describe('fieldDescription', () => {
    it('prefers the field description over the schema text', () => {
        expect(fieldDescription(springPage.fields[1])).toBe('Products shown in the grid, in this order.');
    });

    it('falls back to .describe(), through .optional()', () => {
        expect(
            fieldDescription({
                name: 'subheading',
                schema: z.string().describe('Under 20 words.').optional(),
            })
        ).toBe('Under 20 words.');
    });

    it('is undefined when neither says anything', () => {
        expect(fieldDescription(springPage.fields[0])).toBeUndefined();
    });
});

describe('undeclaredFieldRoles', () => {
    it('names every role the identity does not declare', () => {
        expect(undeclaredFieldRoles(springPage.fields, ['editor'])).toEqual([
            {
                field: 'seo',
                role: 'admin',
            },
        ]);
        expect(undeclaredFieldRoles(springPage.fields, ['editor', 'admin'])).toEqual([]);
    });
});
