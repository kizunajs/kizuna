import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { definePage } from './page.js';
import { defineGlobal } from './definitions.js';
import { cmsPlugin } from './plugin.js';
import { cmsRoutes } from './routes.js';
import { definePages } from './options.js';
import { memoryMediaStorage } from './media/storage.js';
import { DocumentStore } from './storage/store.js';
import { stripPaths } from './source-path.js';

const revalidated: string[][] = [];

vi.mock('next/headers', () => ({
    draftMode: async () => ({
        isEnabled: false,
    }),
}));

vi.mock('next/navigation', () => ({
    notFound: () => {
        throw new Error('NEXT_NOT_FOUND');
    },
}));

vi.mock('next/cache', () => ({
    unstable_cache:
        (callback: (...args: unknown[]) => Promise<unknown>) =>
        async (...args: unknown[]) =>
            callback(...args),
    revalidateTag: () => undefined,
}));

vi.mock('@kizunajs/cms/next/preview', () => ({
    PreviewOverlay: () => null,
}));

const { createCms } = await import('./next.js');

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

const webFrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'heading',
            schema: z.string().min(1),
        },
    ],
});

const campaignFrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'offer',
            schema: z.string().min(1),
        },
    ],
});

const footer = defineGlobal({
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
const plugin = cmsPlugin({
    db,
    sites: {
        web: {
            pages: definePages({
                frontPage: {
                    path: '/',
                    page: webFrontPage,
                },
            }),
            app: 'src/__fixtures__/app',
        },
        campaign: {
            pages: definePages({
                frontPage: {
                    path: '/',
                    page: campaignFrontPage,
                },
            }),
            app: 'src/__fixtures__/app',
        },
    },
    globals: [footer],
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
    routes: {
        cms: cmsRoutes(plugin),
    },
    plugins: [plugin],
});
const app = express();
config.api.mount(app);

const asEditor = (call: request.Test) => call.set('authorization', 'Bearer editor-token');

const publish = async (site: string, changes: Record<string, string>): Promise<void> => {
    expect(
        (
            await asEditor(request(app).patch(`/cms/sites/${site}/pages/frontPage/draft`)).send({
                changes,
            })
        ).status
    ).toBe(200);
    expect((await asEditor(request(app).post(`/cms/sites/${site}/pages/frontPage/publish`)).send({})).status).toBe(200);
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
        expect((await request(app).get('/cms/content/sites/web/pages/frontPage')).body.content).toEqual({
            heading: 'Plants for every room',
        });
        expect((await request(app).get('/cms/content/sites/campaign/pages/frontPage')).body.content).toEqual({
            offer: 'Twenty percent off bulbs',
        });
        expect(revalidated).toContainEqual(['kizuna-cms:page:campaign:frontPage']);
    });

    it('describes the page at a URL on the site the overlay names', async () => {
        const described = await asEditor(request(app).get('/cms/describe').query({ url: '/', site: 'campaign' }));
        expect(described.body).toMatchObject({
            ref: 'page:campaign:frontPage',
            path: '/',
        });
        expect(described.body.fields.map((field: { path: string }) => field.path)).toEqual(['offer']);
    });

    it('lists every site’s pages with their site', async () => {
        const listed = await asEditor(request(app).get('/cms/pages'));
        expect(listed.body.pages.map((page: { site: string; ref: string }) => [page.site, page.ref])).toEqual([
            ['web', 'page:web:frontPage'],
            ['campaign', 'page:campaign:frontPage'],
        ]);
    });

    it('reads one site’s pages, typed from that site', async () => {
        await publish('campaign', {
            offer: 'Twenty percent off bulbs',
        });
        const campaign = createCms(config.api, {
            site: 'campaign',
        });
        const content = await campaign.pages.frontPage.get();
        expectTypeOf(content.offer).toEqualTypeOf<string>();
        expect(stripPaths(content.offer)).toBe('Twenty percent off bulbs');
        expect(() =>
            createCms(config.api, {
                site: 'shop',
            })
        ).toThrow("no site named 'shop'");
    });

    it('takes pages for one app or sites for several, not both', () => {
        expect(() =>
            defineConfig({
                auth: {
                    identities: {
                        editor,
                    },
                },
                routes: {},
                plugins: [
                    cmsPlugin({
                        db,
                        pages: {},
                        sites: {},
                        auth: {
                            identity: 'editor',
                        },
                    }),
                ],
            })
        ).toThrow('not both');
    });
});
