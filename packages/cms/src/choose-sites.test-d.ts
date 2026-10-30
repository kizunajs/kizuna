import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { defineCollection } from './definitions.js';
import type { CmsCollections } from './reader.js';

const ArticleId = Kizuna.brand('ArticleId', z.string());

describe('chooseSites', () => {
    it('adds showsOn, the keys of the sites that show an item', async () => {
        const Articles = defineCollection({
            name: 'articles',
            id: ArticleId,
            chooseSites: true,
            fields: [
                {
                    name: 'title',
                    schema: z.string(),
                },
            ],
        });
        expectTypeOf<z.output<typeof Articles.schema>>().toEqualTypeOf<{
            title: string;
            showsOn: string[];
        }>();
        const articles = {} as CmsCollections<readonly [typeof Articles]>['articles'];
        expectTypeOf((await articles.get({ id: 'winter-care' })).showsOn).toEqualTypeOf<string[]>();
    });

    it('adds nothing without it', () => {
        const Articles = defineCollection({
            name: 'articles',
            id: ArticleId,
            fields: [
                {
                    name: 'title',
                    schema: z.string(),
                },
            ],
        });
        expectTypeOf<z.output<typeof Articles.schema>>().toEqualTypeOf<{
            title: string;
        }>();
    });

    it('takes only true or false', () => {
        defineCollection({
            name: 'articles',
            id: ArticleId,
            // @ts-expect-error chooseSites is a boolean
            chooseSites: 'yes',
            fields: [
                {
                    name: 'title',
                    schema: z.string(),
                },
            ],
        });
    });
});
