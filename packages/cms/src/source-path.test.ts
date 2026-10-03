import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { defineBlock } from './block.js';
import { ImageSchema } from './image.js';
import { definePage } from './page.js';
import { decodePath, encodeSourcePaths, stripPaths, withSourcePath } from './source-path.js';

const FrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'hero',
            schema: defineBlock({
                name: 'hero',
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
        const encoded = encodeSourcePaths(FrontPage, {
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

    it('keep what is no field, such as the id a collection item is read with', () => {
        const encoded = encodeSourcePaths(
            FrontPage,
            {
                id: 'item_1',
                count: 3,
            },
            'item:articles:item_1'
        );
        expect(encoded['id']).toBe('item_1');
        expect(encoded['count']).toBe(3);
    });

    it('leave ids, URLs, emails, patterned values and plain fields unmarked, since code compares and links with them', () => {
        const EmployeeId = Kizuna.brand('EmployeeId', z.string());
        const ArticlePage = definePage({
            name: 'articlePage',
            fields: [
                {
                    name: 'title',
                    schema: z.string(),
                },
                {
                    name: 'slug',
                    schema: z.string(),
                },
                {
                    name: 'code',
                    schema: z.string().regex(/^[A-Z]{3}$/),
                },
                {
                    name: 'author',
                    schema: EmployeeId.optional(),
                },
                {
                    name: 'contacts',
                    schema: z.array(EmployeeId),
                },
                {
                    name: 'website',
                    schema: z.url(),
                },
                {
                    name: 'email',
                    schema: z.email(),
                },
            ],
        });
        const content = {
            title: 'Hello',
            slug: 'hello',
            code: 'ABC',
            author: 'emp_1',
            contacts: ['emp_2'],
            website: 'https://example.com',
            email: 'ada@example.com',
        };
        const encoded = encodeSourcePaths(ArticlePage, content, 'item:articles:a1', ['slug']);
        const title = String(encoded['title']);
        expect(decodePath(title)).toBe('title');
        expect({
            ...encoded,
            title: stripPaths(title),
        }).toEqual(content);
    });
});
