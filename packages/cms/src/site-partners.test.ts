import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { pluginExportsOf } from 'kizunajs/adapter';
import { expressAdapter } from '@kizunajs/express';
import { definePage } from './page.js';
import { defineCollection, defineGlobal } from './definitions.js';
import { cms } from './provider.js';
import { definePages } from './options.js';
import { declareSites, SiteSchema } from './site.js';
import { DocumentStore } from './storage/store.js';
import { memoryMediaStorage } from './media/storage.js';
import type { CmsExports } from './setup.js';
import { heldJobs } from './held-jobs.fixture.js';

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

const PARTNERS: Record<string, string> = {
    'travel-token': 'travelAgency',
    'stranger-token': 'stranger',
};

const partner = k.identity
    .bearer({
        context: z.object({
            partner: z.string(),
        }),
    })
    .guard(({ bearer, deny }) => {
        const found = PARTNERS[bearer?.token ?? ''];
        if (found !== undefined) {
            return {
                partner: found,
            };
        }
        return deny({
            status: 401,
            body: {
                detail: 'Unauthorized',
            },
        });
    });

const Offices = defineCollection({
    name: 'offices',
    id: Kizuna.brand('OfficeId', z.string()),
    fields: [
        {
            name: 'city',
            schema: z.string(),
        },
    ],
});

const Events = defineCollection({
    name: 'events',
    id: Kizuna.brand('EventId', z.string()),
    fields: [
        {
            name: 'title',
            schema: z.string(),
        },
    ],
});

const PrivacyPolicy = defineGlobal({
    name: 'privacyPolicy',
    fields: [
        {
            name: 'text',
            schema: z.string(),
        },
    ],
});

const FrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
    ],
});

const countryPages = definePages({
    frontPage: {
        path: '/',
        page: FrontPage,
    },
});

const sites = declareSites(SiteSchema, {
    uk: {
        label: 'Hagen UK',
        url: 'https://hagen.example.co.uk',
        icon: '/icons/uk.svg',
        pages: countryPages,
        collections: [Events],
    },
    norway: {
        label: 'Hagen Norge',
        url: 'https://hagen.example.no',
        icon: '/icons/norway.svg',
        pages: countryPages,
    },
});

const travelAgency = {
    label: 'Travel agency',
    reads: ['uk'],
    invalidate: {
        url: 'https://travel.example.com/api/invalidate',
    },
};

const configWith = (read: string | undefined) => {
    const pglite = new PGlite();
    const db = drizzle(pglite);
    const config = defineConfig({
        jobRunner: heldJobs,
        adapter: expressAdapter(),
        auth: {
            identities: {
                editor,
                partner,
            },
        },
        content: cms({
            db,
            sites,
            site: () => 'uk',
            globals: [PrivacyPolicy],
            collections: [Offices],
            partners: {
                travelAgency,
            },
            auth: {
                identity: 'editor',
                ...(read === undefined
                    ? {}
                    : {
                          read,
                      }),
            },
            media: {
                storage: memoryMediaStorage(),
            },
            revalidate: () => undefined,
        }),
    });
    const app = express();
    config.api.mount(app);
    return {
        pglite,
        db,
        app,
        service: (pluginExportsOf(config.api)['cms'] as CmsExports).service,
    };
};

const png = async (shade: number): Promise<Uint8Array> =>
    new Uint8Array(
        await sharp({
            create: {
                width: 2,
                height: 2,
                channels: 3,
                background: {
                    r: shade,
                    g: shade,
                    b: shade,
                },
            },
        })
            .png()
            .toBuffer()
    );

describe('content routes without auth.read', () => {
    const open = configWith(undefined);

    beforeAll(async () => {
        await new DocumentStore(open.db).createTables();
    });

    afterAll(async () => {
        await open.pglite.close();
    });

    it('stay public, and a shared cache may keep them', async () => {
        const response = await request(open.app).get('/content/sites/norway/collections/offices');
        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe('public, max-age=0, stale-while-revalidate=60');
    });
});

describe('content routes with auth.read', () => {
    const guarded = configWith('partner');
    const as = (token: string, path: string) => request(guarded.app).get(path).set('authorization', `Bearer ${token}`);
    let images: Record<'shared' | 'uk' | 'norway', string>;

    beforeAll(async () => {
        await new DocumentStore(guarded.db).createTables();
        images = {
            shared: (await guarded.service.media.storeBytes(await png(10), 'shop.png', 'ada')).id,
            uk: (await guarded.service.media.storeBytes(await png(20), 'thames.png', 'ada', undefined, 'uk')).id,
            norway: (await guarded.service.media.storeBytes(await png(30), 'fjord.png', 'ada', undefined, 'norway')).id,
        };
    });

    afterAll(async () => {
        await guarded.pglite.close();
    });

    it('require the identity auth.read names', async () => {
        expect((await request(guarded.app).get('/content/sites/uk/collections/offices')).status).toBe(401);
    });

    it('let a partner read the shared content and the sites in its reads, privately', async () => {
        const offices = await as('travel-token', '/content/sites/uk/collections/offices');
        expect(offices.status).toBe(200);
        expect(offices.headers['cache-control']).toBe('private, max-age=0');
        expect((await as('travel-token', '/content/sites/uk/collections/events')).status).toBe(200);
        expect((await as('travel-token', '/content/sites/uk/globals/privacyPolicy')).status).toBe(404);
    });

    it('refuse a partner every other site, naming the permission it lacks', async () => {
        for (const path of [
            '/content/sites/norway/collections/offices',
            '/content/sites/norway/globals/privacyPolicy',
            '/content/sites/norway/pages/frontPage',
        ]) {
            const refused = await as('travel-token', path);
            expect(refused.status).toBe(403);
            expect(refused.body.detail).toContain('content.sites.norway:read');
        }
    });

    it('refuse a token naming a partner cms() does not declare', async () => {
        const refused = await as('stranger-token', '/content/sites/uk/collections/offices');
        expect(refused.status).toBe(403);
        expect(refused.body.detail).toContain("'stranger'");
    });

    it("serve a partner shared images and its sites' own, and no other site's", async () => {
        const shared = await as('travel-token', `/content/media/${images.shared}/image`);
        expect(shared.status).toBe(200);
        expect(shared.headers['cache-control']).toBe('private, max-age=31536000, immutable');
        expect((await as('travel-token', `/content/media/${images.uk}/image`)).status).toBe(200);
        const norway = await as('travel-token', `/content/media/${images.norway}/image`);
        expect(norway.status).toBe(403);
        expect(norway.body.detail).toContain('content.sites.norway:read');
        expect((await request(guarded.app).get(`/content/media/${images.shared}/image`)).status).toBe(401);
    });
});

describe('partners', () => {
    it('read only declared sites', () => {
        expect(() =>
            defineConfig({
                jobRunner: heldJobs,
                auth: {
                    identities: {
                        editor,
                    },
                },
                content: cms({
                    db: drizzle(new PGlite()),
                    sites,
                    partners: {
                        travelAgency: {
                            ...travelAgency,
                            reads: ['sweden'],
                        },
                    },
                    auth: {
                        identity: 'editor',
                    },
                }),
            })
        ).toThrow("reads the site 'sweden', which declareSites() does not declare");
    });
});
