import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { pluginExportsOf } from 'kizunajs/adapter';
import type { ContentRuntime } from 'kizunajs/plugin';
import { definePage } from './page.js';
import { definePages } from './options.js';
import type { CmsExports } from './setup.js';
import { cms } from './provider.js';
import { DocumentStore } from './storage/store.js';
import type { DocumentRef } from './refs.js';

/**
 * A cache that outlives the config, as Next's data cache in `.next` outlives
 * a restart of `next dev`.
 */
const store = new Map<string, unknown>();
const reads: string[][] = [];

const runtime: ContentRuntime = {
    cache:
        (read, keys) =>
        async (...args) => {
            const key = JSON.stringify([keys, args]);
            if (store.has(key)) return store.get(key) as never;
            reads.push([...keys]);
            const value = await read(...args);
            store.set(key, value);
            return value;
        },
    revalidate: () => undefined,
    draftMode: async () => ({
        enabled: false,
        enable: () => undefined,
        disable: () => undefined,
    }),
    cookies: async () => ({
        get: () => undefined,
        set: () => undefined,
        delete: () => undefined,
    }),
    notFound: async () => {
        throw new Error('not found');
    },
};

const k = new Kizuna();
const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
    })
    .guard(() => ({
        userId: 'ada',
    }));

const pglite = new PGlite();
const db = drizzle(pglite);

const FeaturedFrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'featured',
            schema: z.array(z.string()),
        },
    ],
});

const ShopFrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'shop',
            schema: z.object({
                products: z.array(z.string()),
            }),
        },
    ],
    migrate: {
        1: (document) => ({
            shop: {
                products: document['featured'],
            },
        }),
    },
});

const configWith = (frontPage: typeof FeaturedFrontPage | typeof ShopFrontPage) =>
    defineConfig({
        adapter: {
            name: 'test',
            mount: () => undefined,
            content: runtime,
        },
        auth: {
            identities: {
                editor,
            },
        },
        content: cms({
            db,
            pages: definePages({
                frontPage: {
                    path: '/',
                    page: frontPage,
                },
            }),
            auth: {
                identity: 'editor',
            },
            appDir: 'src/__fixtures__/app',
        }),
    });

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

afterAll(async () => {
    await pglite.close();
});

describe('the reader cache', () => {
    it('reads afresh once a definition gains a migrate step', async () => {
        const before = configWith(FeaturedFrontPage);
        const service = (pluginExportsOf(before.api)['cms'] as CmsExports).service;
        const ref: DocumentRef = {
            type: 'page',
            name: 'frontPage',
        };
        await service.update({
            ref,
            changes: {
                featured: ['monstera'],
            },
            caller: {},
            author: 'ada',
        });
        await service.publish(ref, 'ada');

        expect(await before.content.pages.frontPage.get()).toEqual({
            featured: ['monstera'],
        });
        await before.content.pages.frontPage.get();
        expect(reads).toEqual([['kizuna-cms', 'published', 'page:frontPage', 'migration:0']]);

        const after = configWith(ShopFrontPage);
        expect(await after.content.pages.frontPage.get()).toEqual({
            shop: {
                products: ['monstera'],
            },
        });
        expect(reads.at(-1)).toEqual(['kizuna-cms', 'published', 'page:frontPage', 'migration:1']);
    });
});
