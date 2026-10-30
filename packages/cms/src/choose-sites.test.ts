import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { defineJobTransport, pluginExportsOf, type JobMessage } from 'kizunajs/adapter';
import { expressAdapter } from '@kizunajs/express';
import { definePage } from './page.js';
import { defineCollection } from './definitions.js';
import { cms } from './provider.js';
import { definePages } from './options.js';
import { declareSites, SiteSchema } from './site.js';
import { DocumentStore } from './storage/store.js';
import { stripPaths } from './source-path.js';
import { heldJobs } from './held-jobs.fixture.js';
import type { CmsExports } from './setup.js';

const k = new Kizuna();
const roles = Kizuna.roles(['editor', 'admin']);

const EDITORS: Record<string, { userId: string; role: 'editor' | 'admin'; sites?: Record<string, 'editor' | 'admin'> }> = {
    'grace-token': {
        userId: 'grace',
        role: 'admin',
    },
    'sam-token': {
        userId: 'sam',
        role: 'editor',
        sites: {
            uk: 'editor',
        },
    },
};

const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
            sites: z.record(z.string(), z.enum(['editor', 'admin'])).optional(),
        }),
        roles,
    })
    .guard(({ bearer, deny }) => {
        const found = EDITORS[bearer?.token ?? ''];
        if (found !== undefined) return found;
        return deny({
            status: 401,
            body: {
                detail: 'Unauthorized',
            },
        });
    });

const Articles = defineCollection({
    name: 'articles',
    id: Kizuna.brand('ArticleId', z.string()),
    chooseSites: true,
    fields: [
        {
            name: 'title',
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
    },
    norway: {
        label: 'Hagen Norge',
        url: 'https://hagen.example.no',
        icon: '/icons/norway.svg',
        pages: countryPages,
    },
});

const showing = {
    site: 'uk',
};
const queued: JobMessage[] = [];
const revalidated: string[] = [];

const pglite = new PGlite();
const db = drizzle(pglite);
const config = defineConfig({
    adapter: expressAdapter(),
    jobRunner: {
        mode: 'in-process',
        transport: defineJobTransport({
            name: 'captured',
            supports: {
                retry: true,
                dedupe: true,
            },
            dispatch: (message) => {
                queued.push(message);
            },
        }),
    },
    auth: {
        identities: {
            editor,
        },
    },
    content: cms({
        db,
        sites,
        site: () => showing.site,
        collections: [Articles],
        partners: {
            travelAgency: {
                label: 'Travel agency',
                reads: ['norway'],
                invalidate: {
                    url: 'https://travel.example.com/api/invalidate',
                },
            },
        },
        auth: {
            identity: 'editor',
            roles: ['editor', 'admin'],
            sites: (signedIn) => signedIn.sites,
        },
        revalidate: (tags) => {
            revalidated.push(...tags);
        },
    }),
});
const service = (pluginExportsOf(config.api)['cms'] as CmsExports).service;
const app = express();
config.api.mount(app);

const as = (token: string) => ({
    get: (path: string) => request(app).get(path).set('authorization', `Bearer ${token}`),
    post: (path: string) => request(app).post(path).set('authorization', `Bearer ${token}`),
    patch: (path: string) => request(app).patch(path).set('authorization', `Bearer ${token}`),
});
const grace = as('grace-token');
const sam = as('sam-token');

/**
 * A published article, by its id.
 */
const article = async (title: string, showsOn?: string[]): Promise<string> => {
    const created = await grace.post('/editing/collections/articles/items').send({
        values: {
            title,
            ...(showsOn === undefined
                ? {}
                : {
                      showsOn,
                  }),
        },
    });
    expect(created.status).toBe(201);
    const id = created.body.ref.split(':').pop() as string;
    expect((await grace.post(`/editing/collections/articles/items/${id}/publish`).send({})).status).toBe(200);
    return id;
};

const titles = (items: ReadonlyArray<{ title: string }>) => items.map((item) => stripPaths(item.title)).sort();

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    queued.length = 0;
    revalidated.length = 0;
    showing.site = 'uk';
    await pglite.exec(
        'delete from cms_refreshes; delete from cms_review_comments; delete from cms_reviews; delete from cms_refs; delete from cms_versions; delete from cms_documents;'
    );
});

afterAll(async () => {
    await pglite.close();
});

describe('chooseSites', () => {
    it('adds showsOn to the sidebar, after the fields', () => {
        expect(Articles.fields.map((field) => field.name)).toEqual(['title', 'showsOn']);
        expect(Articles.fields[1]).toMatchObject({
            name: 'showsOn',
            label: 'Shows on',
            position: 'sidebar',
        });
        expect(
            Articles.schema.parse({
                title: 'Winter care for houseplants',
            })
        ).toEqual({
            title: 'Winter care for houseplants',
            showsOn: [],
        });
    });

    it('refuses a site of its own, and a CMS without sites', () => {
        const Journal = defineCollection({
            name: 'journal',
            id: Kizuna.brand('JournalId', z.string()),
            chooseSites: true,
            fields: [
                {
                    name: 'title',
                    schema: z.string(),
                },
            ],
        });
        expect(() =>
            defineConfig({
                adapter: expressAdapter(),
                jobRunner: heldJobs,
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
                            collections: [Journal],
                        },
                    }),
                    site: () => 'uk',
                    auth: {
                        identity: 'editor',
                    },
                }),
            })
        ).toThrow("The uk site's 'journal' chooses sites, but only a shared collection shows on several.");
        expect(() =>
            defineConfig({
                adapter: expressAdapter(),
                auth: {
                    identities: {
                        editor,
                    },
                },
                content: cms({
                    db,
                    collections: [Journal],
                    auth: {
                        identity: 'editor',
                    },
                }),
            })
        ).toThrow("Collection 'journal' chooses sites, but cms() declares no sites.");
    });
});

describe('reading an article on a site', () => {
    it('lists and reads only the articles shown on the site, in process', async () => {
        const both = await article('Winter care for houseplants', ['uk', 'norway']);
        const market = await article('Columbia Road flower market', ['uk']);
        await article('Juletrær i Oslo', ['norway']);
        await article('Unplaced draft');

        expect(titles((await config.content.collections.articles.list()).items)).toEqual([
            'Columbia Road flower market',
            'Winter care for houseplants',
        ]);
        expect(stripPaths((await config.content.collections.articles.get({ id: market })).title)).toBe('Columbia Road flower market');

        showing.site = 'norway';
        expect(titles((await config.content.collections.articles.list()).items)).toEqual([
            'Juletrær i Oslo',
            'Winter care for houseplants',
        ]);
        expect(stripPaths((await config.content.collections.articles.get({ id: both })).title)).toBe('Winter care for houseplants');
        await expect(config.content.collections.articles.get({ id: market })).rejects.toThrow();
    });

    it('lists and reads only the articles shown on the site, over HTTP', async () => {
        const market = await article('Columbia Road flower market', ['uk']);
        await article('Juletrær i Oslo', ['norway']);

        expect(titles((await request(app).get('/content/sites/uk/collections/articles')).body.items)).toEqual([
            'Columbia Road flower market',
        ]);
        expect((await request(app).get(`/content/sites/uk/collections/articles/${market}`)).body.title).toBe('Columbia Road flower market');
        expect((await request(app).get(`/content/sites/norway/collections/articles/${market}`)).status).toBe(404);
    });

    it('lists every article in the shared view, and filters it by the sites that show it', async () => {
        await article('Columbia Road flower market', ['uk']);
        await article('Juletrær i Oslo', ['norway']);
        await article('Unplaced draft');

        const listed = async (filter?: string) =>
            (await grace.get('/editing/collections/articles/items').query(filter === undefined ? {} : { filter: [filter] })).body.items
                .map((item: { label: string }) => item.label)
                .sort();
        expect(await listed()).toEqual(['Columbia Road flower market', 'Juletrær i Oslo', 'Unplaced draft']);
        expect(await listed('showsOn:is:norway')).toEqual(['Juletrær i Oslo']);
        expect(await listed('showsOn:isNot:norway')).toEqual(['Columbia Road flower market', 'Unplaced draft']);
    });

    it('offers a site only the articles it shows, when picking one for it', async () => {
        await article('Columbia Road flower market', ['uk']);
        await article('Juletrær i Oslo', ['norway']);

        const offered = async (site?: string) =>
            (await grace.get('/editing/items/ArticleId').query(site === undefined ? {} : { site })).body.items
                .map((item: { label: string }) => item.label)
                .sort();
        expect(await offered()).toEqual(['Columbia Road flower market', 'Juletrær i Oslo']);
        expect(await offered('norway')).toEqual(['Juletrær i Oslo']);
        expect((await sam.get('/editing/items/ArticleId').query({ site: 'norway' })).status).toBe(404);
    });

    it("counts the articles a site shows on that site's dashboard", async () => {
        await article('Winter care for houseplants', ['uk', 'norway']);
        await article('Columbia Road flower market', ['uk']);
        await article('Unplaced draft');

        const countOn = async (site?: string) =>
            (await service.collectionSummaries('default', site)).find((summary) => summary.name === 'articles')?.count;
        expect(await countOn()).toBe(3);
        expect(await countOn('uk')).toBe(2);
        expect(await countOn('norway')).toBe(1);
    });
});

describe('publishing an article', () => {
    it('refreshes only the sites in its old or new showsOn, and the partners that read them', async () => {
        const id = await article('Columbia Road flower market', ['uk']);
        expect(queued.map((message) => (message.input as { target: string }).target)).toEqual(['uk']);
        expect(revalidated).toContain('kizuna-cms:collection:uk:articles');
        expect(revalidated).not.toContain('kizuna-cms:collection:norway:articles');

        queued.length = 0;
        revalidated.length = 0;
        expect(
            (
                await grace.patch(`/editing/collections/articles/items/${id}/draft`).send({
                    changes: {
                        showsOn: ['norway'],
                    },
                })
            ).status
        ).toBe(200);
        expect((await grace.post(`/editing/collections/articles/items/${id}/publish`).send({})).status).toBe(200);
        expect(queued.map((message) => (message.input as { target: string }).target)).toEqual(['uk', 'norway', 'travelAgency']);
        expect(revalidated).toEqual(expect.arrayContaining(['kizuna-cms:collection:uk:articles', 'kizuna-cms:collection:norway:articles']));
    });

    it('names the partners that read a site it shows on, under shows on', async () => {
        const id = await article('Columbia Road flower market', ['uk']);
        const described = async () =>
            (
                await grace.get('/editing/describe').query({
                    ref: `item:articles:${id}`,
                })
            ).body;
        expect((await described()).usedOn.partners).toEqual([]);
        await grace.patch(`/editing/collections/articles/items/${id}/draft`).send({
            changes: {
                showsOn: ['uk', 'norway'],
            },
        });
        expect((await described()).usedOn.partners.map((partner: { label: string }) => partner.label)).toEqual(['Travel agency']);
    });

    it('describes showsOn with the declared sites and their labels', async () => {
        const id = await article('Columbia Road flower market', ['uk']);
        const described = await grace.get('/editing/describe').query({
            ref: `item:articles:${id}`,
        });
        const showsOn = described.body.fields.find((field: { path: string }) => field.path === 'showsOn');
        expect(showsOn).toMatchObject({
            label: 'Shows on',
            position: 'sidebar',
            options: {
                uk: 'Hagen UK',
                norway: 'Hagen Norge',
            },
            value: ['uk'],
        });
        expect(showsOn.schema.items.enum).toEqual(['uk', 'norway']);
    });

    it('refuses a site declareSites() does not declare', async () => {
        const id = await article('Columbia Road flower market', ['uk']);
        const refused = await grace.patch(`/editing/collections/articles/items/${id}/draft`).send({
            changes: {
                showsOn: ['uk', 'sweden'],
            },
        });
        expect(refused.status).toBe(422);
        expect(refused.body.detail).toBe("'sweden' is not a site. showsOn holds uk, norway.");
    });
});

describe("a site's editor", () => {
    it('proposes adding their own site, and leaves publishing to an admin over every site', async () => {
        const id = await article('Juletrær i Oslo', ['norway']);
        expect(
            (
                await sam.patch(`/editing/collections/articles/items/${id}/draft`).send({
                    changes: {
                        showsOn: ['norway', 'uk'],
                    },
                })
            ).status
        ).toBe(200);
        expect((await sam.post(`/editing/collections/articles/items/${id}/publish`).send({})).status).toBe(403);
        expect((await request(app).get(`/content/sites/uk/collections/articles/${id}`)).status).toBe(404);
        expect((await grace.post(`/editing/collections/articles/items/${id}/publish`).send({})).status).toBe(200);
        expect((await request(app).get(`/content/sites/uk/collections/articles/${id}`)).body.title).toBe('Juletrær i Oslo');
    });

    it('never adds or takes off a site they do not edit', async () => {
        const id = await article('Columbia Road flower market', ['uk']);
        for (const showsOn of [['uk', 'norway'], ['norway']]) {
            const refused = await sam.patch(`/editing/collections/articles/items/${id}/draft`).send({
                changes: {
                    showsOn,
                },
            });
            expect(refused.status).toBe(403);
            expect(refused.body.detail).toBe('Forbidden: you add or take off only uk in showsOn.');
        }
    });
});
