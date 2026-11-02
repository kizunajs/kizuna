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
import { defineCollection } from './definitions.js';
import { cms } from './provider.js';
import { definePages } from './options.js';
import { declareSites, SiteSchema } from './site.js';
import { DocumentStore } from './storage/store.js';
import type { DocumentRef } from './refs.js';
import type { CmsExports } from './setup.js';
import { trashItem } from './trash.js';
import { heldJobs } from './held-jobs.fixture.js';

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

const Shops = defineCollection({
    name: 'shops',
    id: Kizuna.brand('ShopId', z.string()),
    fields: [
        {
            name: 'name',
            schema: z.string(),
        },
        {
            name: 'slug',
            schema: z.string(),
        },
    ],
});

const pglite = new PGlite();
const db = drizzle(pglite);
const config = defineConfig({
    jobRunner: heldJobs,
    adapter: expressAdapter(),
    auth: {
        identities: {
            editor,
        },
    },
    content: cms({
        db,
        locales: ['nb', 'en'],
        sites: declareSites(SiteSchema, {
            norway: {
                label: 'Hagen Norge',
                url: 'https://hagen.example.no',
                icon: '/icons/norway.svg',
                pages: definePages({
                    shopPage: {
                        path: '/butikker/[slug]',
                        page: definePage({
                            name: 'shopPage',
                            collection: Shops,
                        }),
                    },
                }),
            },
        }),
        collections: [Shops],
        auth: {
            identity: 'editor',
        },
    }),
});
const service = (pluginExportsOf(config.api)['cms'] as CmsExports).service;
const app = express();
config.api.mount(app);

const oslo: DocumentRef = {
    type: 'item',
    collection: 'shops',
    id: 'oslo',
};

const publish = async (ref: DocumentRef, changes: Record<string, unknown>): Promise<void> => {
    await service.update({
        ref,
        changes,
        caller: {},
        author: 'ada',
    });
    await service.publish(ref, 'ada');
};

const PATH = '/content/sites/norway/redirects';

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec(
        'delete from cms_redirects; delete from cms_redirect_versions; delete from cms_refs; delete from cms_versions; delete from cms_translations; delete from cms_documents;'
    );
    await publish(oslo, {
        name: 'Oslo',
        slug: 'oslo',
    });
});

afterAll(async () => {
    await pglite.close();
});

describe("a site's redirects", () => {
    it('answers each redirect with its page or item resolved to where it is now, without a token', async () => {
        await publish(oslo, {
            slug: 'oslo-sentrum',
        });
        await publish(oslo, {
            slug: 'oslo-torget',
        });
        const response = await request(app).get(PATH);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            version: await service.redirects.version('norway'),
            redirects: [
                {
                    from: '/butikker/oslo',
                    to: '/butikker/oslo-torget',
                    status: 308,
                },
                {
                    from: '/butikker/oslo-sentrum',
                    to: '/butikker/oslo-torget',
                    status: 308,
                },
            ],
        });
        expect(response.headers['etag']).toBe(`"${response.body.version}"`);
    });

    it('answers 304 to the version the caller holds, until a change moves it on', async () => {
        await publish(oslo, {
            slug: 'oslo-sentrum',
        });
        const first = await request(app).get(PATH);
        const again = await request(app).get(PATH).set('if-none-match', first.headers['etag']!);
        expect(again.status).toBe(304);
        expect(again.headers['etag']).toBe(first.headers['etag']);
        await publish(oslo, {
            slug: 'oslo-torget',
        });
        const changed = await request(app).get(PATH).set('if-none-match', first.headers['etag']!);
        expect(changed.status).toBe(200);
        expect(changed.headers['etag']).not.toBe(first.headers['etag']);
    });

    it('leaves out a redirect whose item is in the trash, and moves the version on', async () => {
        await publish(oslo, {
            slug: 'oslo-sentrum',
        });
        const before = await request(app).get(PATH);
        await trashItem(service, 'shops', 'oslo', 'default', 'ada');
        const after = await request(app).get(PATH).set('if-none-match', before.headers['etag']!);
        expect(after.status).toBe(200);
        expect(after.body.redirects).toEqual([]);
    });

    it('leaves out a redirect whose item is unpublished, and moves the version on', async () => {
        await publish(oslo, {
            slug: 'oslo-sentrum',
        });
        const before = await request(app).get(PATH);
        await service.unpublish(oslo, 'ada');
        const after = await request(app).get(PATH).set('if-none-match', before.headers['etag']!);
        expect(after.status).toBe(200);
        expect(after.body.redirects).toEqual([]);
    });
});
