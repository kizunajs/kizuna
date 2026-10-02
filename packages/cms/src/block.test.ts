import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineBlock, readBlock } from './block.js';
import { ImageSchema } from './image.js';

const HeroBlockSchema = defineBlock({
    slug: 'hero',
    fields: [
        {
            name: 'heading',
            schema: z.string().max(60),
        },
        {
            name: 'image',
            schema: ImageSchema,
        },
    ],
});

describe('block', () => {
    it('returns a Zod object with one property per field', () => {
        expect(Object.keys(HeroBlockSchema.shape)).toEqual(['heading', 'image']);
        expect(
            HeroBlockSchema.safeParse({
                heading: 'Spring is here',
                image: {
                    id: 'media_1',
                    alt: 'Tulips',
                },
            }).success
        ).toBe(true);
    });

    it('enforces the limits the fields declare', () => {
        const result = HeroBlockSchema.safeParse({
            heading: 'x'.repeat(61),
            image: {
                id: 'media_1',
                alt: 'Tulips',
            },
        });
        expect(result.success).toBe(false);
    });

    it('reads the block back off its schema, through .optional()', () => {
        expect(readBlock(HeroBlockSchema)?.slug).toBe('hero');
        expect(readBlock(HeroBlockSchema.optional())?.fields.map((field) => field.name)).toEqual(['heading', 'image']);
        expect(readBlock(z.object({}))).toBeUndefined();
    });

    it('throws on a slug that is not kebab-case', () => {
        expect(() =>
            defineBlock({
                slug: 'Hero',
                fields: [
                    {
                        name: 'heading',
                        schema: z.string(),
                    },
                ],
            })
        ).toThrow("defineBlock() has the slug 'Hero'");
    });

    it('throws on a field listed twice', () => {
        expect(() =>
            defineBlock({
                slug: 'hero',
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
            })
        ).toThrow("defineBlock('hero') lists the field 'heading' twice.");
    });

    it('throws on a field name that is not an identifier', () => {
        expect(() =>
            defineBlock({
                slug: 'hero',
                fields: [
                    {
                        name: 'cta.label',
                        schema: z.string(),
                    },
                ],
            })
        ).toThrow("defineBlock('hero') has a field named 'cta.label'");
    });

    it('throws without fields', () => {
        expect(() =>
            defineBlock({
                slug: 'hero',
                fields: [],
            })
        ).toThrow("defineBlock('hero') lists no fields.");
    });

    it('throws on a field whose schema is not Zod', () => {
        expect(() =>
            defineBlock({
                slug: 'hero',
                fields: [
                    {
                        name: 'heading',
                        schema: 'string' as unknown as z.ZodType,
                    },
                ],
            })
        ).toThrow("gives the field 'heading' something other than a Zod schema");
    });
});
