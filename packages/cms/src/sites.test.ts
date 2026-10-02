import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { definePage } from './page.js';
import { defineGlobal } from './definitions.js';
import { cms } from './provider.js';
import { definePages } from './options.js';
import { memoryMediaStorage } from './media/storage.js';
import { DocumentStore } from './storage/store.js';
import { stripPaths } from './source-path.js';

const revalidated: string[][] = [];

const k = new Kizuna();
const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
    })
    .guard(({ bearer, deny }) =>
        bearer?.token === 'editor-token'
            ? {
                  userId: 'ada',
              }
            : deny({
                  status: 401,
                  body: {
                      detail: 'Unauthorized',
                  },
              })
    );

const WebFrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'heading',
            schema: z.string().min(1),
        },
    ],
});

const CampaignFrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'offer',
            schema: z.string().min(1),
        },
    ],
});

const Footer = defineGlobal({
    name: 'footer',
    fields: [
        {
            name: 'text',
            schema: z.string(),
        },
    ],
});

const pglite = new PGlite();
const db = drizzle(pglite);
const content = cms({
    db,
    sites: {
        web: {
            pages: definePages({
                frontPage: {
                    path: '/',
                    page: WebFrontPage,
                },
            }),
            app: 'src/__fixtures__/app',
        },
        campaign: {
            pages: definePages({
                frontPage: {
                    path: '/',
                    page: CampaignFrontPage,
                },
            }),
            app: 'src/__fixtures__/app',
        },
    },
    globals: [Footer],
    auth: {
        identity: 'editor',
    },
    media: {
        storage: memoryMediaStorage(),
    },
    revalidate: (tags) => {
        revalidated.push([...tags]);
    },
});
const config = defineConfig({
    adapter: expressAdapter(),
    auth: {
        identities: {
            editor,
        },
    },
    content,
});
const app = express();
config.api.mount(app);

const asEditor = (call: request.Test) => call.set('authorization', 'Bearer editor-token');

const publish = async (site: string, changes: Record<string, string>): Promise<void> => {
    expect(
        (
            await asEditor(request(app).patch(`/editing/sites/${site}/pages/frontPage/draft`)).send({
                changes,
            })
        ).status
    ).toBe(200);
    expect((await asEditor(request(app).post(`/editing/sites/${site}/pages/frontPage/publish`)).send({})).status).toBe(200);
};

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

describe('several sites sharing one CMS', () => {
    it('keeps each site’s page apart, even with the same name and path', async () => {
        await publish('web', {
            heading: 'Plants for every room',
        });
        await publish('campaign', {
            offer: 'Twenty percent off bulbs',
        });
        expect((await request(app).get('/content/sites/web/pages/frontPage')).body.content).toEqual({
            heading: 'Plants for every room',
        });
        expect((await request(app).get('/content/sites/campaign/pages/frontPage')).body.content).toEqual({
            offer: 'Twenty percent off bulbs',
        });
        expect(revalidated).toContainEqual(['kizuna-cms:page:campaign:frontPage']);
    });

    it('describes the page at a URL on the site the overlay names', async () => {
        const described = await asEditor(request(app).get('/editing/describe').query({ url: '/', site: 'campaign' }));
        expect(described.body).toMatchObject({
            ref: 'page:campaign:frontPage',
            path: '/',
        });
        expect(described.body.fields.map((field: { path: string }) => field.path)).toEqual(['offer']);
    });

    it('lists every site’s pages with their site', async () => {
        const listed = await asEditor(request(app).get('/editing/pages'));
        expect(listed.body.pages.map((page: { site: string; ref: string }) => [page.site, page.ref])).toEqual([
            ['web', 'page:web:frontPage'],
            ['campaign', 'page:campaign:frontPage'],
        ]);
    });

    it('reads one site’s pages, typed from that site', async () => {
        await publish('campaign', {
            offer: 'Twenty percent off bulbs',
        });
        const page = await config.content.sites.campaign.pages.frontPage.get();
        expectTypeOf(page.offer).toEqualTypeOf<string>();
        expect(stripPaths(page.offer)).toBe('Twenty percent off bulbs');
        expect(Object.keys(config.content.sites)).toEqual(['web', 'campaign']);
    });

    it('takes pages for one app or sites for several, not both', () => {
        expect(() =>
            defineConfig({
                auth: {
                    identities: {
                        editor,
                    },
                },
                content: cms({
                    db,
                    pages: {},
                    sites: {},
                    auth: {
                        identity: 'editor',
                    },
                }),
            })
        ).toThrow('not both');
    });
});
