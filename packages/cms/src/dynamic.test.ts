import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { fillPath, matchPath, routeParamsOf, routeProblems, type ParamsOf } from './dynamic.js';
import { definePage } from './page.js';
import { defineCollection } from './definitions.js';

const ArticleId = Kizuna.brand('ArticleId', z.string());

const articles = defineCollection({
    name: 'articles',
    id: ArticleId,
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
            name: 'views',
            schema: z.int(),
        },
    ],
});

const articlePage = definePage({
    name: 'articlePage',
    collection: articles,
});

describe('route patterns', () => {
    it('reads the params a pattern names, in order', () => {
        expect(routeParamsOf('/blog/[slug]')).toEqual(['slug']);
        expect(routeParamsOf('/[locale]/cases/[slug]')).toEqual(['locale', 'slug']);
        expect(routeParamsOf('/')).toEqual([]);
    });

    it('fills a pattern from content, encoding each value, and gives up on an empty one', () => {
        expect(
            fillPath('/blog/[slug]', {
                slug: 'hello world',
            })
        ).toBe('/blog/hello%20world');
        expect(
            fillPath('/blog/[slug]', {
                slug: '',
            })
        ).toBeUndefined();
        expect(fillPath('/blog/[slug]', null)).toBeUndefined();
    });

    it('matches a path to a pattern and decodes the params', () => {
        expect(matchPath('/blog/[slug]', '/blog/hello%20world')).toEqual({
            slug: 'hello world',
        });
        expect(matchPath('/blog/[slug]', '/blog/hello/')).toEqual({
            slug: 'hello',
        });
        expect(matchPath('/blog/[slug]', '/news/hello')).toBeUndefined();
        expect(matchPath('/blog/[slug]', '/blog/hello/more')).toBeUndefined();
    });

    it('types the params of a pattern', () => {
        expectTypeOf<ParamsOf<'/blog/[slug]'>>().toEqualTypeOf<{
            slug: string;
        }>();
        expectTypeOf<ParamsOf<'/[locale]/cases/[slug]'>>().toMatchTypeOf<{
            locale: string;
            slug: string;
        }>();
    });
});

describe('routeProblems', () => {
    it('accepts a page whose params name text fields of its collection', () => {
        expect(routeProblems('/blog/[slug]', articlePage)).toEqual([]);
    });

    it('names a param without a field, a param on a number, and a catch-all', () => {
        expect(routeProblems('/blog/[handle]', articlePage)).toEqual([
            "/blog/[handle] has the param [handle], but the articles collection has no field named 'handle'. Each route param reads the field it names.",
        ]);
        expect(routeProblems('/blog/[views]', articlePage)).toEqual([
            "The articles collection's 'views' field is part of an address, so it has to be text, like z.string().",
        ]);
        expect(routeProblems('/blog/[...slug]', articlePage)[0]).toContain('catch-all');
    });

    it('wants a collection on a dynamic route and none on a static one', () => {
        const aboutPage = definePage({
            name: 'aboutPage',
            fields: [
                {
                    name: 'heading',
                    schema: z.string(),
                },
            ],
        });
        expect(routeProblems('/about/[slug]', aboutPage)[0]).toContain('Give it the collection');
        expect(routeProblems('/blog', articlePage)[0]).toContain('is a static route');
    });

    it('refuses fields on a page that shows a collection', () => {
        expect(() =>
            // @ts-expect-error A page that shows a collection takes no fields.
            definePage({
                name: 'newsPage',
                collection: articles,
                fields: [
                    {
                        name: 'heading',
                        schema: z.string(),
                    },
                ],
            })
        ).toThrow('its content is the item');
    });
});
