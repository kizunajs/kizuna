import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { pluginExportsOf } from 'kizunajs/adapter';
import { expressAdapter } from '@kizunajs/express';
import { definePage } from './page.js';
import { ImageSchema } from './image.js';
import type { CmsExports } from './plugin.js';
import { cms } from './provider.js';
import { defineRelationship } from './relationships.js';
import { memoryMediaStorage } from './media/storage.js';
import { DocumentStore } from './storage/store.js';

const k = new Kizuna();
const ProductId = Kizuna.brand('ProductId', z.string());
const roles = Kizuna.roles(['editor', 'app']);

const deny = {
    status: 401,
    body: {
        detail: 'Unauthorized',
    },
};

const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
        roles,
    })
    .guard(({ bearer, deny: refuse }) =>
        bearer?.token === 'editor-token'
            ? {
                  userId: 'ada',
                  role: 'editor',
              }
            : refuse(deny)
    );

const app = k.identity
    .apiKey({
        name: 'x-cms-key',
        in: 'header',
        roles,
    })
    .guard(({ apiKey, deny: refuse }) =>
        apiKey?.value === 'app-key'
            ? {
                  role: 'app',
              }
            : refuse(deny)
    );

const FrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'featured',
            schema: z.array(ProductId).max(6),
        },
        {
            name: 'image',
            schema: ImageSchema.optional(),
        },
    ],
});

const catalogue = [
    {
        id: 'prod_tulips',
        name: 'Tulip bundle',
    },
    {
        id: 'prod_seeds',
        name: 'Wildflower seeds',
    },
];

const revalidated: string[][] = [];
const pglite = new PGlite();
const db = drizzle(pglite);
const content = cms({
    db,
    pages: {
        frontPage: {
            path: '/',
            page: FrontPage,
        },
    },
    auth: {
        identity: 'editor',
        invalidate: 'app',
    },
    relationships: [
        defineRelationship({
            name: 'products',
            id: ProductId,
            options: async ({ query }) =>
                catalogue
                    .filter((product) => query === undefined || product.name.toLowerCase().includes(query))
                    .map((product) => ({
                        id: product.id,
                        label: product.name,
                    })),
        }),
    ],
    media: {
        storage: memoryMediaStorage(),
    },
    apiPath: '/cms-api',
    revalidate: (tags) => {
        revalidated.push([...tags]);
    },
    appDir: 'src/__fixtures__/app',
});
const config = defineConfig({
    adapter: expressAdapter(),
    auth: {
        identities: {
            editor,
            app,
        },
    },
    content,
});
const server = express();
config.api.mount(server);
const { service } = pluginExportsOf(config.api)['cms'] as CmsExports;

const asEditor = (call: request.Test) => call.set('authorization', 'Bearer editor-token');

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec('delete from cms_refs; delete from cms_versions; delete from cms_documents;');
    revalidated.length = 0;
});

afterAll(async () => {
    await pglite.close();
});

describe('a config that holds the CMS alone', () => {
    it('serves the routes at the root of the API, and image URLs under its mount path', async () => {
        expect((await asEditor(request(server).get('/editing/describe').query({ url: '/' }))).body.ref).toBe('page:frontPage');
        expect((await asEditor(request(server).get('/editing/pages'))).status).toBe(200);
        expect(service.imageUrl('med_1')).toBe('/cms-api/content/media/med_1/image');
    });

    it("finds ids through a relationship's options, which can call another API", async () => {
        const found = await asEditor(request(server).get('/editing/items/ProductId').query({ q: 'tulip' }));
        expect(found.body.items).toEqual([
            {
                id: 'prod_tulips',
                label: 'Tulip bundle',
            },
        ]);
        const described = await asEditor(request(server).get('/editing/describe').query({ ref: 'page:frontPage' }));
        const featured = (described.body.fields as Array<{ path: string; description?: string; searchTool?: string }>).find(
            (field) => field.path === 'featured'
        );
        expect(featured).toMatchObject({
            searchTool: 'editing_search_items',
            description: 'An array of ProductId; ids of products, found with editing_search_items, brand ProductId.',
        });
    });

    it('lets the app refresh the pages that show an id, with its own key', async () => {
        await asEditor(request(server).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                featured: ['prod_tulips'],
            },
        });
        const refreshed = await request(server).post('/invalidate').set('x-cms-key', 'app-key').send({
            relationship: 'products',
            id: 'prod_tulips',
        });
        expect(refreshed.status).toBe(200);
        expect(refreshed.body.pages).toEqual(['frontPage']);
        expect(revalidated).toEqual([['kizuna-cms:page:frontPage']]);
        const refused = await asEditor(request(server).post('/invalidate')).send({
            relationship: 'products',
            id: 'prod_tulips',
        });
        expect(refused.status).toBe(401);
    });
});
