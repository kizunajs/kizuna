import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { definePage } from './page.js';
import { defineCollection, defineGlobal } from './definitions.js';
import { declareSites, SiteSchema } from './site.js';
import { cms } from './provider.js';
import { definePages } from './options.js';
import { memoryMediaStorage } from './media/storage.js';
import { DocumentStore } from './storage/store.js';
import { stripPaths } from './source-path.js';

const revalidated: string[][] = [];

const showing: { site: string | undefined } = {
    site: 'campaign',
};

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
const Site = SiteSchema.extend({
    companyName: z.string(),
});

const sites = declareSites(Site, {
    web: {
        label: 'Hagen',
        url: 'https://hagen.example.com',
        icon: '/icons/web.svg',
        companyName: 'Hagen AS',
        pages: definePages({
            frontPage: {
                path: '/',
                page: WebFrontPage,
            },
        }),
    },
    campaign: {
        label: 'Hagen Campaign',
        url: 'https://campaign.hagen.example.com',
        icon: 'https://cdn.hagen.example.com/campaign.svg',
        companyName: 'Hagen AS',
        pages: definePages({
            frontPage: {
                path: '/',
                page: CampaignFrontPage,
            },
        }),
    },
});

const content = cms({
    db,
    sites,
    site: () => showing.site,
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
    showing.site = 'campaign';
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

    it('takes pages for one site or sites for several, not both', () => {
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
                    sites,
                    auth: {
                        identity: 'editor',
                    },
                }),
            })
        ).toThrow('not both');
    });
});

const EventId = Kizuna.brand('EventId', z.string());

const Events = defineCollection({
    name: 'events',
    id: EventId,
    fields: [
        {
            name: 'title',
            schema: z.string(),
        },
    ],
});

const configWith = (siteSites: ReturnType<typeof declareSites>) =>
    defineConfig({
        auth: {
            identities: {
                editor,
            },
        },
        content: cms({
            db,
            sites: siteSites,
            globals: [Footer],
            collections: [Events],
            auth: {
                identity: 'editor',
            },
        }),
    });

describe('the site a deployment shows', () => {
    it('reads the site `site` names, with its fields and its key', async () => {
        const site = await config.content.site.get();
        expectTypeOf(site.key).toEqualTypeOf<'web' | 'campaign'>();
        expectTypeOf(site.companyName).toEqualTypeOf<string>();
        expect(site).toEqual({
            key: 'campaign',
            label: 'Hagen Campaign',
            url: 'https://campaign.hagen.example.com',
            icon: 'https://cdn.hagen.example.com/campaign.svg',
            companyName: 'Hagen AS',
        });
        showing.site = 'web';
        expect((await config.content.site.get()).key).toBe('web');
    });

    it('names the sites it knows when `site` names none of them', async () => {
        showing.site = undefined;
        await expect(config.content.site.get()).rejects.toThrow('named no site');
        showing.site = 'denmark';
        await expect(config.content.site.get()).rejects.toThrow(
            "named 'denmark', which declareSites() does not declare. It declares web, campaign."
        );
    });

    it('asks for `site` when cms() has none', async () => {
        await expect(configWith(sites).content.site.get()).rejects.toThrow('Name it with `site`');
    });
});

describe('declaring sites', () => {
    it('parses each site against its schema and keeps its fields', () => {
        expect(sites.values.campaign).toEqual({
            label: 'Hagen Campaign',
            url: 'https://campaign.hagen.example.com',
            icon: 'https://cdn.hagen.example.com/campaign.svg',
            companyName: 'Hagen AS',
        });
        expectTypeOf(sites.values.web.companyName).toEqualTypeOf<string>();
        expectTypeOf<keyof typeof sites.entries>().toEqualTypeOf<'web' | 'campaign'>();
    });

    it('names the site and the field that fails its schema', () => {
        expect(() =>
            declareSites(SiteSchema, {
                uk: {
                    label: 'Hagen UK',
                    url: 'not a url',
                    icon: '/icons/uk.svg',
                },
            })
        ).toThrow('declareSites() gives the uk site a `url` that fail');
        expect(() =>
            declareSites(SiteSchema, {
                uk: {
                    label: 'Hagen UK',
                    url: 'https://hagen.example.co.uk',
                    icon: 'icons/uk.svg',
                },
            })
        ).toThrow('`icon`');
    });

    it('refuses a site named like shared storage, or not lowercase', () => {
        const entry = {
            label: 'Hagen',
            url: 'https://hagen.example.com',
            icon: '/icon.svg',
        };
        expect(() =>
            declareSites(SiteSchema, {
                default: entry,
            })
        ).toThrow("site named 'default'");
        expect(() =>
            declareSites(SiteSchema, {
                Norway: entry,
            })
        ).toThrow('lowercase');
    });

    it('refuses a site of its own named like shared content', () => {
        expect(() =>
            configWith(
                declareSites(SiteSchema, {
                    uk: {
                        label: 'Hagen UK',
                        url: 'https://hagen.example.co.uk',
                        icon: '/icons/uk.svg',
                        collections: [Events],
                    },
                })
            )
        ).toThrow("The uk site has its own 'events', which repeats a shared global or collection");
        expect(() =>
            configWith(
                declareSites(SiteSchema, {
                    uk: {
                        label: 'Hagen UK',
                        url: 'https://hagen.example.co.uk',
                        icon: '/icons/uk.svg',
                        globals: [Footer],
                    },
                })
            )
        ).toThrow("The uk site has its own 'footer'");
    });
});

describe('two sites sharing one pages module', () => {
    const countryPages = definePages({
        frontPage: {
            path: '/',
            page: WebFrontPage,
        },
    });
    const shared = defineConfig({
        adapter: expressAdapter(),
        auth: {
            identities: {
                editor,
            },
        },
        content: cms({
            db,
            sites: declareSites(SiteSchema, {
                uk: {
                    label: 'Hagen UK',
                    url: 'https://hagen.example.co.uk',
                    icon: '/icons/uk.svg',
                    pages: countryPages,
                },
                norway: {
                    label: 'Hagen Norge',
                    url: 'https://hagen.example.no',
                    icon: '/icons/norway.svg',
                    pages: countryPages,
                },
            }),
            auth: {
                identity: 'editor',
            },
            media: {
                storage: memoryMediaStorage(),
            },
        }),
    });
    const countries = express();
    shared.api.mount(countries);

    it('keeps a page document for each site', async () => {
        for (const [site, heading] of [
            ['uk', 'Plants for every room'],
            ['norway', 'Planter til hvert rom'],
        ]) {
            await asEditor(request(countries).patch(`/editing/sites/${site}/pages/frontPage/draft`)).send({
                changes: {
                    heading,
                },
            });
            await asEditor(request(countries).post(`/editing/sites/${site}/pages/frontPage/publish`)).send({});
        }
        expect((await request(countries).get('/content/sites/uk/pages/frontPage')).body.content).toEqual({
            heading: 'Plants for every room',
        });
        expect((await request(countries).get('/content/sites/norway/pages/frontPage')).body.content).toEqual({
            heading: 'Planter til hvert rom',
        });
        const norway = await shared.content.sites.norway.pages.frontPage.get();
        expectTypeOf(norway.heading).toEqualTypeOf<string>();
        expect(stripPaths(norway.heading)).toBe('Planter til hvert rom');
    });

    it('generates no pages module, since the content package holds it', () => {
        expect(shared.generators.filter((file) => file.output.endsWith('cms.pages.ts'))).toHaveLength(0);
    });
});
