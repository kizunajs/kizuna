import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { block, readBlock } from './block.js';
import { ImageSchema } from './image.js';

const HeroBlockSchema = block({
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
            block({
                slug: 'Hero',
                fields: [
                    {
                        name: 'heading',
                        schema: z.string(),
                    },
                ],
            })
        ).toThrow("block() has the slug 'Hero'");
    });

    it('throws on a field listed twice', () => {
        expect(() =>
            block({
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
        ).toThrow("block('hero') lists the field 'heading' twice.");
    });

    it('throws on a field name that is not an identifier', () => {
        expect(() =>
            block({
                slug: 'hero',
                fields: [
                    {
                        name: 'cta.label',
                        schema: z.string(),
                    },
                ],
            })
        ).toThrow("block('hero') has a field named 'cta.label'");
    });

    it('throws without fields', () => {
        expect(() =>
            block({
                slug: 'hero',
                fields: [],
            })
        ).toThrow("block('hero') lists no fields.");
    });

    it('throws on a field whose schema is not Zod', () => {
        expect(() =>
            block({
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
