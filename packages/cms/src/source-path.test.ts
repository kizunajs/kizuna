import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { block } from './block.js';
import { ImageSchema } from './image.js';
import { page } from './page.js';
import { decodePath, encodeSourcePaths, stripPaths, withSourcePath } from './source-path.js';

const springPage = page({
    name: 'springPage',
    fields: [
        {
            name: 'hero',
            schema: block({
                slug: 'hero',
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
            }),
        },
        {
            name: 'tags',
            schema: z.array(z.string()),
        },
        {
            name: 'count',
            schema: z.number(),
        },
    ],
});

describe('source paths', () => {
    it('round-trip through stega and clean away', () => {
        const marked = withSourcePath('Spring', 'hero.heading');
        expect(marked).not.toBe('Spring');
        expect(decodePath(marked)).toBe('hero.heading');
        expect(stripPaths(marked)).toBe('Spring');
        expect(decodePath('Spring')).toBeUndefined();
    });

    it('ignore hidden data another tool wrote', () => {
        expect(decodePath('x​')).toBeUndefined();
    });

    it('mark strings and images, and leave other values alone', () => {
        const encoded = encodeSourcePaths(springPage, {
            hero: {
                heading: 'Spring',
                image: {
                    id: 'med_1',
                    url: '/api/cms/media/med_1/image',
                    alt: 'Tulips',
                    width: 10,
                    height: 10,
                },
            },
            tags: ['one', 'two'],
            count: 3,
        }) as {
            hero: {
                heading: string;
                image: {
                    url: string;
                    alt: string;
                    width: number;
                };
            };
            tags: string[];
            count: number;
        };
        expect(decodePath(encoded.hero.heading)).toBe('hero.heading');
        expect(encoded.hero.image.url).toBe('/api/cms/media/med_1/image#kizuna-cms=hero.image');
        expect(decodePath(encoded.hero.image.alt)).toBe('hero.image');
        expect(encoded.hero.image.width).toBe(10);
        expect(decodePath(encoded.tags[1]!)).toBe('tags.1');
        expect(encoded.count).toBe(3);
        expect(stripPaths(encoded).hero.heading).toBe('Spring');
    });
});
