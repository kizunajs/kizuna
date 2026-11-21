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
import { RichTextSchema } from './rich-text.js';
import { link } from './links.js';
import { SeoSchema } from './seo.js';
import { fakeSeoData, type PageSeoData, type SeoData, type SiteSeoData } from './seo-data.js';
import { heldJobs } from './held-jobs.fixture.js';
import type { CmsExports } from './setup.js';
import type { DocumentRef } from './refs.js';

const k = new Kizuna();
const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
    })
    .guard(({ bearer, deny }) =>
        bearer?.token === 'token'
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

const Shops = defineCollection({
    name: 'shops',
    id: Kizuna.brand('ShopId', z.string()),
    fields: [
        {
            name: 'name',
            schema: z.string(),
            localized: false,
        },
        {
            name: 'slug',
            schema: z.string(),
            localized: false,
        },
    ],
});

const articlePage = <const Name extends string>(name: Name, label: string) =>
    definePage({
        name,
        label,
        fields: [
            {
                name: 'heading',
                schema: z.string(),
            },
            {
                name: 'body',
                schema: RichTextSchema.optional(),
            },
            {
                name: 'cta',
                schema: link().optional(),
            },
            {
                name: 'seo',
                schema: SeoSchema.optional(),
            },
        ],
    });

const pages = definePages({
    frontPage: {
        path: '/',
        page: articlePage('frontPage', 'Front page'),
    },
    plantCarePage: {
        path: '/plant-care',
        page: articlePage('plantCarePage', 'Plant care'),
    },
    plantDoctorPage: {
        path: '/plant-care/plant-doctor',
        page: articlePage('plantDoctorPage', 'Plant doctor'),
    },
    shopPage: {
        path: '/shops/[slug]',
        page: definePage({
            name: 'shopPage',
            collection: Shops,
        }),
    },
});

const sites = declareSites(SiteSchema, {
    uk: {
        label: 'Hagen UK',
        url: 'https://hagen.example.co.uk',
        icon: '/icons/uk.svg',
        locales: ['en'],
        pages,
    },
});

/**
 * A provider whose answers each test sets, counting how often it is asked.
 */
const asked: Array<{ url: string; locale: string }> = [];
let pageAnswer: (url: string) => PageSeoData = () => ({
    checkedAt: '2026-11-20T08:00:00.000Z',
    scores: {
        search: 70,
        answers: 40,
    },
});
let siteAnswer: () => SiteSeoData = () => ({
    checkedAt: '2026-11-20T08:00:00.000Z',
    scores: {
        search: 66,
        answers: 50,
    },
});
const provider: SeoData = {
    label: 'Test data',
    page: async (input) => {
        asked.push(input);
        return pageAnswer(input.url);
    },
    site: async () => siteAnswer(),
};

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
        locales: ['en'],
        sites,
        site: () => 'uk',
        collections: [Shops],
        auth: {
            identity: 'editor',
        },
        seoData: provider,
    }),
});
const service = (pluginExportsOf(config.api)['cms'] as CmsExports).service;
const app = express();
config.api.mount(app);

const plainPglite = new PGlite();
const plainDb = drizzle(plainPglite);
const plainConfig = defineConfig({
    jobRunner: heldJobs,
    adapter: expressAdapter(),
    auth: {
        identities: {
            editor,
        },
    },
    content: cms({
        db: plainDb,
        pages: definePages({
            frontPage: {
                path: '/',
                page: articlePage('frontPage', 'Front page'),
            },
            plantCarePage: {
                path: '/plant-care',
                page: articlePage('plantCarePage', 'Plant care'),
            },
        }),
        auth: {
            identity: 'editor',
        },
        preview: {
            url: 'https://hagen.example.com',
        },
        seoData: fakeSeoData(),
    }),
});
const plainService = (pluginExportsOf(plainConfig.api)['cms'] as CmsExports).service;
const plainApp = express();
plainConfig.api.mount(plainApp);

const page = (name: string): DocumentRef => ({
    type: 'page',
    name,
    site: 'uk',
});

const publish = async (ref: DocumentRef, changes: Record<string, unknown>, on = service): Promise<void> => {
    await on.update({
        ref,
        changes,
        caller: {},
        author: 'ada',
    });
    await on.publish(ref, 'ada');
};

/**
 * Rich text of one paragraph, its last words linking to the ref or URL given.
 */
const paragraph = (before: string, linked: string, target: { ref: string } | { href: string }) => [
    {
        _type: 'block',
        _key: 'paragraph',
        style: 'normal',
        markDefs: [
            {
                _type: 'link',
                _key: 'target',
                ...target,
            },
        ],
        children: [
            {
                _type: 'span',
                _key: 'before',
                text: before,
                marks: [],
            },
            {
                _type: 'span',
                _key: 'linked',
                text: linked,
                marks: ['target'],
            },
        ],
    },
];

const get = (path: string, query: Record<string, unknown>, on = app) =>
    request(on).get(path).query(query).set('authorization', 'Bearer token');

beforeAll(async () => {
    await new DocumentStore(db).createTables();
    await new DocumentStore(plainDb).createTables();
});

beforeEach(async () => {
    asked.length = 0;
    pageAnswer = () => ({
        checkedAt: '2026-11-20T08:00:00.000Z',
        scores: {
            search: 70,
            answers: 40,
        },
    });
    await pglite.exec('delete from cms_reviews; delete from cms_refs; delete from cms_versions; delete from cms_documents;');
});

afterAll(async () => {
    await pglite.close();
    await plainPglite.close();
});

describe('fakeSeoData', () => {
    it('answers the same numbers for the same address, with keywords from its words', async () => {
        const fake = fakeSeoData({
            now: () => new Date('2026-11-20T08:00:00.000Z'),
        });
        const first = await fake.page({
            url: 'https://hagen.example.co.uk/plant-care',
            locale: 'en',
        });
        const again = await fake.page({
            url: 'https://hagen.example.co.uk/plant-care',
            locale: 'en',
        });
        expect(again).toEqual(first);
        expect(first.keywords?.[0]?.keyword).toBe('plant care');
        expect(first.keywords?.every((keyword) => keyword.keyword.includes('plant care'))).toBe(true);
        expect(first.scores.search).toBeGreaterThanOrEqual(35);
        expect(first.scores.search).toBeLessThanOrEqual(97);
        const other = await fake.page({
            url: 'https://hagen.example.co.uk/delivery',
            locale: 'en',
        });
        expect(other.keywords?.[0]?.keyword).toBe('delivery');
    });

    it('gives a site the competing searches that at least two of its pages fit', async () => {
        const fake = fakeSeoData();
        for (const path of ['/', '/plant-care', '/plant-care/plant-doctor', '/visit', '/delivery', '/events']) {
            await fake.page({
                url: `http://uk.localhost:3041${path}`,
                locale: 'en',
            });
        }
        const site = await fake.site({
            origin: 'http://uk.localhost:3041',
            locale: 'en',
        });
        expect(
            site.competing?.map((search) => ({
                keyword: search.keyword,
                urls: search.urls.map((entry) => new URL(entry.url).pathname),
            }))
        ).toEqual([
            {
                keyword: 'how often to water houseplants',
                urls: ['/plant-care', '/plant-care/plant-doctor'],
            },
            {
                keyword: 'plant shop london',
                urls: ['/delivery', '/visit'],
            },
        ]);
        expect(site.keywords?.every((keyword) => keyword.url.startsWith('http://uk.localhost:3041/'))).toBe(true);
    });

    it('gives a site whose pages fit no search no competing searches, and no keywords for its front page or about page', async () => {
        const fake = fakeSeoData();
        for (const path of ['/', '/about', '/about/history', '/careers']) {
            await fake.page({
                url: `http://group.localhost:3040${path}`,
                locale: 'en',
            });
        }
        const site = await fake.site({
            origin: 'http://group.localhost:3040',
            locale: 'en',
        });
        expect(site.competing).toEqual([]);
        expect(
            site.keywords?.some((keyword) => ['http://group.localhost:3040/', 'http://group.localhost:3040/about'].includes(keyword.url))
        ).toBe(false);
    });

    it('is refused by cms() when it lacks what the CMS asks of it', () => {
        expect(() =>
            defineConfig({
                jobRunner: heldJobs,
                adapter: expressAdapter(),
                auth: {
                    identities: {
                        editor,
                    },
                },
                content: cms({
                    db,
                    pages: {},
                    auth: {
                        identity: 'editor',
                    },
                    seoData: {
                        label: 'Test data',
                    } as unknown as SeoData,
                }),
            })
        ).toThrow(/seoData/);
    });
});

describe('editing_page_seo', () => {
    it('checks the search title and description, the links, and what links here', async () => {
        await publish(page('plantCarePage'), {
            heading: 'Plant care',
            seo: {
                title: 'Plant care at Hagen, from watering to repotting and the plant doctor',
                description: 'Short.',
            },
            body: paragraph('Read ', 'the doctor', {
                ref: 'page:uk:plantDoctorPage',
            }),
            cta: {
                href: 'https://careguides.example.org/watering/winter',
                label: 'Winter watering',
            },
        });
        await publish(page('frontPage'), {
            heading: 'Welcome',
            body: paragraph('Ask ', 'the plant care desk', {
                ref: 'page:uk:plantCarePage',
            }),
        });
        await publish(page('plantDoctorPage'), {
            heading: 'Plant doctor',
            body: paragraph('Bring a sick plant, or read our plant care guide. ', 'Delivery', {
                href: 'https://hagen.example.co.uk/delivery',
            }),
        });
        pageAnswer = () => ({
            checkedAt: '2026-11-20T08:00:00.000Z',
            scores: {
                search: 72,
                answers: 46,
            },
            checks: [
                {
                    level: 'suggested',
                    text: 'Use “plant care” in the heading.',
                },
            ],
            keywords: [
                {
                    keyword: 'plant care',
                    position: 14,
                    volume: 2400,
                },
            ],
            backlinks: [
                {
                    domain: 'londonplantclub.example.co.uk',
                    url: 'https://londonplantclub.example.co.uk/members',
                    anchor: 'plant care desk at Hagen',
                },
            ],
            outboundStatus: [
                {
                    url: 'https://careguides.example.org/watering/winter',
                    status: 404,
                },
            ],
        });
        const answer = await get('/editing/seo/page', {
            ref: 'page:uk:plantCarePage',
            refresh: true,
        });
        expect(answer.status).toBe(200);
        expect(asked).toEqual([
            {
                url: 'https://hagen.example.co.uk/plant-care',
                locale: 'en',
            },
        ]);
        expect(answer.body).toMatchObject({
            checkedAt: '2026-11-20T08:00:00.000Z',
            label: 'Test data',
            scores: {
                search: 72,
                answers: 46,
            },
            keywords: [
                {
                    keyword: 'plant care',
                    position: 14,
                    volume: 2400,
                },
            ],
            citations: [],
        });
        expect(answer.body.checks).toEqual([
            {
                level: 'urgent',
                text: 'The search title is 68 characters, and search results cut it after 60. Shorten it.',
                field: 'seo',
            },
            {
                level: 'urgent',
                text: 'A link to https://careguides.example.org/watering/winter answers 404. Fix the address or remove the link.',
                field: 'cta',
            },
            {
                level: 'suggested',
                text: 'The search description is 6 characters. Lengthen it to at least 70 so it says what a visitor finds.',
                field: 'seo',
            },
            {
                level: 'suggested',
                text: 'Use “plant care” in the heading.',
            },
        ]);
        expect(answer.body.links).toEqual({
            in: [
                {
                    kind: 'page',
                    ref: 'page:uk:frontPage',
                    title: 'Front page',
                    path: '/',
                    anchor: 'the plant care desk',
                },
                {
                    kind: 'external',
                    title: 'londonplantclub.example.co.uk',
                    domain: 'londonplantclub.example.co.uk',
                    url: 'https://londonplantclub.example.co.uk/members',
                    path: '/members',
                    anchor: 'plant care desk at Hagen',
                },
            ],
            out: [
                {
                    kind: 'external',
                    title: 'careguides.example.org',
                    domain: 'careguides.example.org',
                    path: '/watering/winter',
                    url: 'https://careguides.example.org/watering/winter',
                    anchor: 'Winter watering',
                },
                {
                    kind: 'page',
                    ref: 'page:uk:plantDoctorPage',
                    title: 'Plant doctor',
                    path: '/plant-care/plant-doctor',
                    anchor: 'the doctor',
                },
            ],
        });
        expect(answer.body.couldLinkHere).toEqual([
            {
                ref: 'page:uk:plantDoctorPage',
                title: 'Plant doctor',
                phrase: 'plant care',
            },
        ]);
    });

    it('flags a link to an item in the trash, and a page nothing links to', async () => {
        const created = await service.createItem(
            'shops',
            {
                name: 'Winter watering',
                slug: 'winter-watering',
            },
            {},
            'ada'
        );
        await service.publish(created.target.ref, 'ada');
        const id = (created.target.ref as { id: string }).id;
        await publish(page('plantDoctorPage'), {
            heading: 'Plant doctor',
            seo: {
                title: 'The plant doctor at Hagen UK, every Saturday',
                description: 'Bring a sick plant to any Hagen shop on a Saturday and the plant doctor tells you what it needs.',
            },
            body: paragraph('See ', 'winter watering', {
                ref: `item:shops:${id}`,
            }),
        });
        await service.deleteItem('shops', id, 'default', 'ada');
        const answer = await get('/editing/seo/page', {
            ref: 'page:uk:plantDoctorPage',
        });
        expect(answer.body.checks).toEqual([
            {
                level: 'urgent',
                text: expect.stringMatching(/^A link goes to .+, which is in the trash\. Link somewhere else or remove the link\.$/),
                field: 'body',
            },
            {
                level: 'suggested',
                text: 'No page links here, so search engines find it only through the menu or the sitemap. Link to it from a page on the same topic.',
            },
        ]);
        expect(answer.body.links.out).toEqual([
            expect.objectContaining({
                kind: 'broken',
                ref: `item:shops:${id}`,
                reason: 'trash',
                anchor: 'winter watering',
            }),
        ]);
    });

    it("keeps the service's answer for a day, and asks again on refresh", async () => {
        await publish(page('frontPage'), {
            heading: 'Welcome',
        });
        await get('/editing/seo/page', {
            ref: 'page:uk:frontPage',
        });
        await get('/editing/seo/page', {
            ref: 'page:uk:frontPage',
        });
        expect(asked).toHaveLength(1);
        await get('/editing/seo/page', {
            ref: 'page:uk:frontPage',
            refresh: true,
        });
        expect(asked).toHaveLength(2);
    });

    it('refuses a global, which has no address of its own', async () => {
        const answer = await get('/editing/seo/page', {
            ref: 'global:footer',
        });
        expect(answer.status).toBe(400);
    });
});

describe('editing_site_seo', () => {
    it("lists the pages with the most to fix, lowest score first, beside the site's own data", async () => {
        await publish(page('frontPage'), {
            heading: 'Welcome',
            seo: {
                title: 'Hagen UK, plants and plant care in London',
                description: 'Houseplants, plant care and a plant doctor every Saturday, in four shops across London and online.',
            },
            body: paragraph('Ask ', 'the plant care desk', {
                ref: 'page:uk:plantCarePage',
            }),
        });
        await publish(page('plantCarePage'), {
            heading: 'Plant care',
        });
        pageAnswer = (url) => ({
            checkedAt: '2026-11-20T08:00:00.000Z',
            scores: {
                search: url.endsWith('/plant-care') ? 58 : 90,
                answers: 40,
            },
        });
        siteAnswer = () => ({
            checkedAt: '2026-11-20T09:00:00.000Z',
            scores: {
                search: 71,
                answers: 54,
            },
            keywords: [
                {
                    keyword: 'plant care',
                    position: 14,
                    volume: 2400,
                    url: 'https://hagen.example.co.uk/plant-care',
                },
            ],
        });
        const answer = await get('/editing/seo/site', {
            site: 'uk',
            refresh: true,
        });
        expect(answer.status).toBe(200);
        expect(answer.body).toMatchObject({
            checkedAt: '2026-11-20T09:00:00.000Z',
            label: 'Test data',
            scores: {
                search: 71,
                answers: 54,
            },
            citations: [],
            competing: [],
            backlinkDomains: [],
            pages: 3,
        });
        expect(answer.body.keywords).toHaveLength(1);
        expect(answer.body.mostToFix.map((row: { ref: string; checks: number; score: number }) => row)).toEqual([
            {
                ref: 'page:uk:plantCarePage',
                title: 'Plant care',
                path: '/plant-care',
                checks: 2,
                score: 58,
            },
            {
                ref: 'page:uk:plantDoctorPage',
                title: 'Plant doctor',
                path: '/plant-care/plant-doctor',
                checks: 3,
                score: 90,
            },
        ]);
    });

    it('refuses a site that is not declared', async () => {
        const answer = await get('/editing/seo/site', {
            site: 'default',
        });
        expect(answer.status).toBe(404);
    });
});

describe('editing_link_map', () => {
    it('maps the links between pages, to other sites, from other sites and to the trash', async () => {
        const created = await service.createItem(
            'shops',
            {
                name: 'Covent Garden',
                slug: 'covent-garden',
            },
            {},
            'ada'
        );
        await service.publish(created.target.ref, 'ada');
        const id = (created.target.ref as { id: string }).id;
        await publish(page('frontPage'), {
            heading: 'Welcome',
            body: paragraph('Ask ', 'the plant care desk', {
                ref: 'page:uk:plantCarePage',
            }),
            cta: {
                ref: `item:shops:${id}`,
                label: 'Our shop',
            },
        });
        await publish(page('plantCarePage'), {
            heading: 'Plant care',
            body: paragraph('More at ', 'care guides', {
                href: 'https://careguides.example.org/watering/winter',
            }),
        });
        await service.deleteItem('shops', id, 'default', 'ada');
        pageAnswer = (url) => ({
            checkedAt: '2026-11-20T08:00:00.000Z',
            scores: {
                search: 70,
                answers: 40,
            },
            backlinks: url.endsWith('/plant-care')
                ? [
                      {
                          domain: 'londonplantclub.example.co.uk',
                          url: 'https://londonplantclub.example.co.uk/members',
                          anchor: 'their care desk',
                      },
                  ]
                : [],
        });
        const answer = await get('/editing/seo/link-map', {
            site: 'uk',
            refresh: true,
        });
        expect(answer.status).toBe(200);
        expect(answer.body.edges).toEqual(
            expect.arrayContaining([
                {
                    from: 'page:uk:frontPage',
                    to: 'page:uk:plantCarePage',
                    broken: false,
                    external: false,
                    anchor: 'the plant care desk',
                },
                {
                    from: 'page:uk:frontPage',
                    to: `item:shops:${id}`,
                    broken: true,
                    external: false,
                    anchor: 'Our shop',
                },
                {
                    from: 'page:uk:plantCarePage',
                    to: 'external:careguides.example.org',
                    broken: false,
                    external: true,
                    anchor: 'care guides',
                },
                {
                    from: 'external:londonplantclub.example.co.uk',
                    to: 'page:uk:plantCarePage',
                    broken: false,
                    external: true,
                    anchor: 'their care desk',
                },
            ])
        );
        expect(answer.body.edges).toHaveLength(4);
        const nodes = new Map(answer.body.nodes.map((node: { id: string }) => [node.id, node]));
        expect(nodes.get('page:uk:plantCarePage')).toEqual({
            id: 'page:uk:plantCarePage',
            kind: 'page',
            ref: 'page:uk:plantCarePage',
            site: 'uk',
            title: 'Plant care',
            path: '/plant-care',
            linksIn: 2,
            brokenOut: 0,
        });
        expect(nodes.get('page:uk:frontPage')).toMatchObject({
            linksIn: 0,
            brokenOut: 1,
        });
        expect(nodes.get(`item:shops:${id}`)).toMatchObject({
            id: `item:shops:${id}`,
            kind: 'broken',
            reason: 'trash',
        });
        expect(nodes.get('external:careguides.example.org')).toEqual({
            id: 'external:careguides.example.org',
            kind: 'external',
            title: 'careguides.example.org',
            domain: 'careguides.example.org',
            path: '/watering/winter',
        });
    });
});

describe('editing_page_scores', () => {
    it("gives each page's scores by ref", async () => {
        pageAnswer = (url) => ({
            checkedAt: '2026-11-20T08:00:00.000Z',
            scores: {
                search: url.endsWith('/') ? 90 : 60,
                answers: 50,
            },
        });
        const answer = await get('/editing/seo/page-scores', {
            site: 'uk',
            refresh: true,
        });
        expect(answer.body.scores).toEqual({
            'page:uk:frontPage': {
                search: 90,
                answers: 50,
            },
            'page:uk:plantCarePage': {
                search: 60,
                answers: 50,
            },
            'page:uk:plantDoctorPage': {
                search: 60,
                answers: 50,
            },
        });
    });

    it("reads a CMS without sites as 'default'", async () => {
        const answer = await get(
            '/editing/seo/page-scores',
            {
                site: 'default',
            },
            plainApp
        );
        expect(answer.status).toBe(200);
        expect(Object.keys(answer.body.scores).sort()).toEqual(['page:frontPage', 'page:plantCarePage']);
        const same = await get(
            '/editing/seo/page',
            {
                ref: 'page:plantCarePage',
            },
            plainApp
        );
        expect(same.body.scores).toEqual(answer.body.scores['page:plantCarePage']);
        expect(same.body.label).toBe('Sample data');
        const named = await get(
            '/editing/seo/page-scores',
            {
                site: 'uk',
            },
            plainApp
        );
        expect(named.status).toBe(404);
        expect(plainService.siteNames()).toEqual([]);
    });
});

describe('editing_similar_pages', () => {
    it('matches the competing addresses to pages, keeps the best ranked, and picks merge or link', async () => {
        siteAnswer = () => ({
            checkedAt: '2026-11-20T09:00:00.000Z',
            scores: {
                search: 71,
                answers: 54,
            },
            competing: [
                {
                    keyword: 'plant doctor london',
                    volume: 600,
                    urls: [
                        {
                            url: 'https://hagen.example.co.uk/',
                            position: 14,
                            similarity: 0.58,
                        },
                        {
                            url: 'https://hagen.example.co.uk/plant-care/plant-doctor',
                            position: 9,
                            similarity: 1,
                        },
                    ],
                },
                {
                    keyword: 'how often to water houseplants',
                    volume: 4400,
                    urls: [
                        {
                            url: 'https://hagen.example.co.uk/plant-care',
                            position: 31,
                            similarity: 1,
                        },
                        {
                            url: 'https://hagen.example.co.uk/plant-care/plant-doctor',
                            position: 48,
                            similarity: 0.92,
                        },
                        {
                            url: 'https://hagen.example.co.uk/',
                            position: 52,
                            similarity: 0.6,
                        },
                    ],
                },
                {
                    keyword: 'winter watering',
                    volume: 900,
                    urls: [
                        {
                            url: 'https://hagen.example.co.uk/plant-care',
                            position: 20,
                        },
                        {
                            url: 'https://elsewhere.example.org/winter',
                            position: 3,
                        },
                    ],
                },
            ],
        });
        const answer = await get('/editing/seo/similar-pages', {
            site: 'uk',
            refresh: true,
        });
        expect(answer.status).toBe(200);
        expect(answer.body).toEqual({
            checkedAt: '2026-11-20T09:00:00.000Z',
            label: 'Test data',
            searches: [
                {
                    keyword: 'how often to water houseplants',
                    volume: 4400,
                    winner: {
                        ref: 'page:uk:plantCarePage',
                        title: 'Plant care',
                        path: '/plant-care',
                        position: 31,
                    },
                    others: [
                        {
                            ref: 'page:uk:plantDoctorPage',
                            title: 'Plant doctor',
                            path: '/plant-care/plant-doctor',
                            position: 48,
                            similarity: 0.92,
                        },
                        {
                            ref: 'page:uk:frontPage',
                            title: 'Front page',
                            path: '/',
                            position: 52,
                            similarity: 0.6,
                        },
                    ],
                    fix: 'merge',
                    why: 'Plant doctor and Front page say nearly what Plant care says, so search splits the 4,400 searches between three pages and none reaches the first page.',
                },
                {
                    keyword: 'plant doctor london',
                    volume: 600,
                    winner: {
                        ref: 'page:uk:plantDoctorPage',
                        title: 'Plant doctor',
                        path: '/plant-care/plant-doctor',
                        position: 9,
                    },
                    others: [
                        {
                            ref: 'page:uk:frontPage',
                            title: 'Front page',
                            path: '/',
                            position: 14,
                            similarity: 0.58,
                        },
                    ],
                    fix: 'link',
                    why: 'Front page competes with Plant doctor for the 600 searches, so search cannot tell which of the two pages to show and only Plant doctor reaches the first page.',
                },
            ],
        });
    });

    it('answers no searches while fewer than two pages compete', async () => {
        const answer = await get(
            '/editing/seo/similar-pages',
            {
                site: 'default',
            },
            plainApp
        );
        expect(answer.status).toBe(200);
        expect(answer.body.label).toBe('Sample data');
        expect(answer.body.searches).toEqual([]);
    });
});
