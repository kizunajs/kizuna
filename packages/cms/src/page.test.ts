import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { defineBlock } from './block.js';
import { fieldDescription, undeclaredFieldRoles } from './field.js';
import { isPage, definePage } from './page.js';

const ProductId = Kizuna.brand('ProductId', z.string());

const HeroBlockSchema = defineBlock({
    name: 'hero',
    fields: [
        {
            name: 'heading',
            schema: z.string().max(60),
        },
    ],
});

const FrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'hero',
            label: 'Hero',
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
    migrate: {
        1: (document) => ({
            ...document,
            featured: [],
        }),
    },
});

describe('page', () => {
    it('keeps the definition and marks it as a page', () => {
        expect(FrontPage.name).toBe('frontPage');
        expect(FrontPage.fields.map((field) => field.name)).toEqual(['hero', 'featured', 'seo']);
        expect(isPage(FrontPage)).toBe(true);
        expect(isPage(HeroBlockSchema)).toBe(false);
    });

    it('builds a schema the whole page is checked against', () => {
        const result = FrontPage.schema.safeParse({
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
            definePage({
                name: 'front-page',
                fields: [
                    {
                        name: 'heading',
                        schema: z.string(),
                    },
                ],
            })
        ).toThrow("definePage() has the name 'front-page'");
    });

    it('throws on options for a field that is not an enum, or a value the enum lacks', () => {
        expect(() =>
            definePage({
                name: 'teamPage',
                fields: [
                    {
                        name: 'heading',
                        schema: z.string(),
                        options: {
                            design: 'Design',
                        },
                    },
                ],
            })
        ).toThrow("definePage('teamPage') gives the field 'heading' options, which only an enum takes.");
        expect(() =>
            definePage({
                name: 'teamPage',
                fields: [
                    {
                        name: 'department',
                        schema: z.enum(['design', 'engineering']),
                        options: {
                            sales: 'Sales',
                        },
                    },
                ],
            })
        ).toThrow("definePage('teamPage') labels the option 'sales' of 'department', which its enum does not have.");
    });

    it('throws on a migrate step that is not a version number', () => {
        expect(() =>
            definePage({
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
        ).toThrow("definePage('aboutPage') has a migrate step '0'");
    });
});

describe('fieldDescription', () => {
    it('prefers the field description over the schema text', () => {
        expect(fieldDescription(FrontPage.fields[1])).toBe('Products shown in the grid, in this order.');
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
        expect(fieldDescription(FrontPage.fields[0])).toBeUndefined();
    });
});

describe('undeclaredFieldRoles', () => {
    it('names every role the identity does not declare', () => {
        expect(undeclaredFieldRoles(FrontPage.fields, ['editor'])).toEqual([
            {
                field: 'seo',
                role: 'admin',
            },
        ]);
        expect(undeclaredFieldRoles(FrontPage.fields, ['editor', 'admin'])).toEqual([]);
    });
});
