import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { pluginExportsOf } from 'kizunajs/adapter';
import { definePage } from './page.js';
import { defineCollection, defineGlobal } from './definitions.js';
import { declareSites, SiteSchema } from './site.js';
import { definePages } from './options.js';
import { cms } from './provider.js';
import { DocumentStore, type Ref } from './storage/store.js';
import type { CmsExports } from './setup.js';
import { run } from './cli.js';
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

const pglite = new PGlite();
const db = drizzle(pglite);
const store = new DocumentStore(db);
const revalidated: string[] = [];

const pageNamed = (name: string) =>
    definePage({
        name,
        fields: [
            {
                name: 'heading',
                schema: z.string(),
            },
        ],
    });

const pages = definePages({
    frontPage: {
        path: '/',
        page: pageNamed('frontPage'),
    },
    contactPage: {
        path: '/contact',
        page: pageNamed('contactPage'),
    },
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

const Settings = defineGlobal({
    name: 'settings',
    fields: [
        {
            name: 'companyName',
            schema: z.string(),
        },
    ],
});

const OfficeId = Kizuna.brand('OfficeId', z.string());

const Offices = defineCollection({
    name: 'offices',
    id: OfficeId,
    fields: [
        {
            name: 'city',
            schema: z.string(),
        },
    ],
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

const siteFields = (key: string) => ({
    label: `Hagen ${key}`,
    url: `https://${key}.hagen.example.com`,
    icon: `/icons/${key}.svg`,
});

/**
 * The CMS as one release of the config sees it, over the same database as
 * every other release.
 */
const configWith = (content: { sites?: ReturnType<typeof declareSites>; collections?: boolean }) =>
    defineConfig({
        jobRunner: heldJobs,
        auth: {
            identities: {
                editor,
            },
        },
        content: cms({
            db,
            ...(content.sites === undefined
                ? {
                      pages,
                  }
                : {
                      sites: content.sites,
                  }),
            globals: [PrivacyPolicy],
            collections: content.collections === false ? [] : [Offices],
            auth: {
                identity: 'editor',
            },
            revalidate: (tags) => {
                revalidated.push(...tags);
            },
        }),
    });

const oneSite = configWith({});

const sitesNamed = (country: string) =>
    configWith({
        sites: declareSites(SiteSchema, {
            group: {
                ...siteFields('group'),
                pages,
            },
            [country]: {
                ...siteFields(country),
                pages,
                globals: [Settings],
                collections: [Events],
            },
            norway: {
                ...siteFields('norway'),
                pages,
            },
        }),
    });

const threeSites = sitesNamed('uk');

const cli = async (config: { api: unknown }, argv: string[]): Promise<{ code: number; output: string }> => {
    const lines: string[] = [];
    const code = await run(argv, {
        cwd: process.cwd(),
        configPath: 'kizuna.config.ts',
        loadApi: async () => config.api,
        stdout: (line) => lines.push(line),
        stderr: (line) => lines.push(line),
    });
    return {
        code,
        output: lines.join('\n'),
    };
};

const save = async (
    kind: 'page' | 'global' | 'item',
    key: string,
    site: string,
    draft: Record<string, unknown>,
    refs: Ref[] = []
): Promise<string> => {
    const saved = await store.saveDraft({
        kind,
        key,
        site,
        draft,
        author: 'ada',
        refs,
    });
    return saved.document.id;
};

const askReview = async (documentId: string, ref: string): Promise<string> => {
    const [review] = await store.addReviews([
        {
            requestId: 'request-1',
            ref,
            documentId,
            version: 1,
            reviewers: ['grace'],
            requestedBy: 'ada',
            note: null,
            createdAt: new Date(),
        },
    ]);
    await store.addReviewComment({
        reviewId: review!.id,
        path: 'heading',
        text: 'Shorter, please.',
        createdBy: 'grace',
        createdAt: new Date(),
    });
    return review!.id;
};

const sitesOf = async (): Promise<Array<{ kind: string; site: string; key: string }>> =>
    (await pglite.query<{ kind: string; site: string; key: string }>('select kind, site, key from cms_documents order by site, kind, key'))
        .rows;

/**
 * What a project with one site has stored: two pages, the first saved
 * twice, holding an office and asked about in a review, beside the shared
 * privacy policy and offices.
 */
const storeOneSite = async (): Promise<string> => {
    const frontPage = await save('page', 'frontPage', 'default', {
        heading: 'Plants for every room',
    });
    await save(
        'page',
        'frontPage',
        'default',
        {
            heading: 'Plants for every home',
        },
        [
            {
                brand: 'OfficeId',
                refId: 'oslo',
                fieldPath: 'office',
            },
        ]
    );
    await store.publish('page', 'frontPage', 'ada', 'default');
    await save('page', 'contactPage', 'default', {
        heading: 'Visit us',
    });
    await save('global', 'privacyPolicy', 'default', {
        text: 'We keep your email.',
    });
    await save('item', 'offices/oslo', 'default', {
        city: 'Oslo',
    });
    return askReview(frontPage, 'page:frontPage');
};

beforeAll(async () => {
    await store.createTables();
});

beforeEach(async () => {
    await pglite.exec(
        'delete from cms_review_comments; delete from cms_reviews; delete from cms_refs; delete from cms_versions; delete from cms_documents;'
    );
    revalidated.length = 0;
});

afterAll(async () => {
    await pglite.close();
});

describe('kizuna cms rename-site', () => {
    it('gives the pages of a project with one site to a declared site, and leaves shared content where it is', async () => {
        const reviewId = await storeOneSite();
        expect(await cli(threeSites, ['rename-site', 'default', 'group'])).toEqual({
            code: 0,
            output: [
                'Moved the content of default to group:',
                '  cms_documents             2',
                '  cms_versions              3',
                '  cms_refs                  1',
                '  cms_reviews               1',
                '  cms_review_comments       1',
            ].join('\n'),
        });
        expect(await sitesOf()).toEqual([
            {
                kind: 'global',
                site: 'default',
                key: 'privacyPolicy',
            },
            {
                kind: 'item',
                site: 'default',
                key: 'offices/oslo',
            },
            {
                kind: 'page',
                site: 'group',
                key: 'contactPage',
            },
            {
                kind: 'page',
                site: 'group',
                key: 'frontPage',
            },
        ]);
        const [review] = await store.reviews([reviewId]);
        expect(review?.ref).toBe('page:group:frontPage');
        const service = (pluginExportsOf(threeSites.api)['cms'] as CmsExports).service;
        const state = await service.draftState({
            type: 'page',
            name: 'frontPage',
            site: 'group',
        });
        expect(state.row?.draft).toEqual({
            heading: 'Plants for every home',
        });
        expect(state.row?.publishedVersion).toBe(2);
        expect(revalidated).toContain('kizuna-cms:page:group:frontPage');
    });

    it('moves a renamed site’s pages, own globals and items, and its values on shared items', async () => {
        const event = await save('item', 'events/workshop', 'uk', {
            title: 'Spring bulbs workshop',
        });
        await save('page', 'frontPage', 'uk', {
            heading: 'Plants for every flat',
        });
        await save('global', 'settings', 'uk', {
            companyName: 'Hagen UK Ltd',
        });
        await save('item', 'offices/oslo', 'uk', {
            phone: '+44 20 7946 0000',
        });
        await save('item', 'offices/oslo', 'default', {
            city: 'Oslo',
        });
        await save('page', 'frontPage', 'norway', {
            heading: 'Planter til hvert rom',
        });
        await askReview(event, 'item:uk:events:workshop');

        const moved = await cli(sitesNamed('britain'), ['rename-site', 'uk', 'britain', '--json']);
        expect(moved.code).toBe(0);
        expect(JSON.parse(moved.output)).toEqual({
            from: 'uk',
            to: 'britain',
            dryRun: false,
            moved: {
                cms_documents: 4,
                cms_versions: 4,
                cms_refs: 0,
                cms_reviews: 1,
                cms_review_comments: 1,
            },
        });
        expect((await sitesOf()).map((row) => `${row.site} ${row.kind} ${row.key}`)).toEqual([
            'britain global settings',
            'britain item events/workshop',
            'britain item offices/oslo',
            'britain page frontPage',
            'default item offices/oslo',
            'norway page frontPage',
        ]);
        const [review] = (await pglite.query<{ ref: string }>('select ref from cms_reviews')).rows;
        expect(review?.ref).toBe('item:britain:events:workshop');
    });

    it('prints what would move with --dry-run, and moves nothing', async () => {
        await storeOneSite();
        const before = await sitesOf();
        expect(await cli(threeSites, ['rename-site', '--dry-run', 'default', 'group'])).toEqual({
            code: 0,
            output: [
                'Would move the content of default to group:',
                '  cms_documents             2',
                '  cms_versions              3',
                '  cms_refs                  1',
                '  cms_reviews               1',
                '  cms_review_comments       1',
            ].join('\n'),
        });
        expect(await sitesOf()).toEqual(before);
        expect(revalidated).toEqual([]);
    });

    it('refuses a key the config still declares, a target it does not, and a target with content of its own', async () => {
        await storeOneSite();
        expect(await cli(oneSite, ['rename-site', 'default', 'group'])).toEqual({
            code: 1,
            output: 'The config declares no sites, so its pages are still read from default. Declare the sites with declareSites() first.',
        });
        expect(await cli(threeSites, ['rename-site', 'uk', 'group'])).toEqual({
            code: 1,
            output: "'uk' is still a declared site, so its content stays. Rename it in declareSites() first.",
        });
        expect(await cli(threeSites, ['rename-site', 'default', 'denmark'])).toEqual({
            code: 1,
            output: "No site named 'denmark'. Known: group, uk, norway. Declare it with declareSites() first.",
        });
        expect(await cli(threeSites, ['rename-site', 'sweden', 'group'])).toEqual({
            code: 1,
            output: "Nothing is stored under 'sweden'.",
        });
        await save('page', 'frontPage', 'group', {
            heading: 'Hagen Group',
        });
        expect(await cli(threeSites, ['rename-site', 'default', 'group'])).toEqual({
            code: 1,
            output: "'group' has content of its own. Delete it before moving 'default' there.",
        });
        expect((await sitesOf()).filter((row) => row.site === 'default' && row.kind === 'page')).toHaveLength(2);
        expect(await cli(threeSites, ['rename-site', 'default'])).toEqual({
            code: 1,
            output: 'Name both sites: kizuna cms rename-site <from> <to>.',
        });
    });
});

describe('kizuna cms orphans', () => {
    it('lists what is stored under keys the config does not declare, per table, and what nothing claims', async () => {
        await storeOneSite();
        await save('page', 'frontPage', 'uk', {
            heading: 'Plants for every flat',
        });
        await save('global', 'settings', 'uk', {
            companyName: 'Hagen UK Ltd',
        });
        await save('page', 'pricingPage', 'norway', {
            heading: 'Prices',
        });
        await save('global', 'footer', 'default', {
            text: 'Hagen',
        });
        await save('item', 'events/workshop', 'norway', {
            title: 'Spring bulbs workshop',
        });

        const listed = await cli(sitesNamed('britain'), ['orphans']);
        expect(listed).toEqual({
            code: 1,
            output: [
                'Stored under a site the config does not declare:',
                '  default',
                '    cms_documents             2',
                '    cms_versions              3',
                '    cms_refs                  1',
                '    cms_reviews               1',
                '    cms_review_comments       1',
                '  uk',
                '    cms_documents             2',
                '    cms_versions              2',
                '    cms_refs                  0',
                '    cms_reviews               0',
                '    cms_review_comments       0',
                'Move it with kizuna cms rename-site <from> <to>.',
                'Stored content nothing in the config claims:',
                '  global:footer',
                '  page:norway:pricingPage',
                '  collection norway:events, 1 item',
                'Move a renamed page with kizuna cms rename-page <from> <to>.',
            ].join('\n'),
        });

        const json = JSON.parse((await cli(sitesNamed('britain'), ['orphans', '--json'])).output);
        expect(json.sites.map((orphan: { site: string }) => orphan.site)).toEqual(['default', 'uk']);
        expect(json.documents).toEqual([
            {
                ref: 'global:footer',
                updatedAt: expect.any(String),
                published: false,
            },
            {
                ref: 'page:norway:pricingPage',
                updatedAt: expect.any(String),
                published: false,
            },
        ]);
        expect(json.collections).toEqual([
            {
                site: 'norway',
                collection: 'events',
                items: 1,
            },
        ]);
    });

    it('lists the items of a collection the config removed', async () => {
        await save('item', 'offices/oslo', 'default', {
            city: 'Oslo',
        });
        await save('item', 'offices/bergen', 'default', {
            city: 'Bergen',
        });
        expect(await cli(oneSite, ['orphans'])).toEqual({
            code: 0,
            output: 'The config claims everything stored.',
        });
        expect(
            await cli(
                configWith({
                    collections: false,
                }),
                ['orphans']
            )
        ).toEqual({
            code: 1,
            output: [
                'Stored content nothing in the config claims:',
                '  collection offices, 2 items',
                'Move a renamed page with kizuna cms rename-page <from> <to>.',
            ].join('\n'),
        });
    });

    it('finds nothing once rename-site has moved a single site’s pages', async () => {
        await storeOneSite();
        expect((await cli(threeSites, ['orphans'])).code).toBe(1);
        expect((await cli(threeSites, ['rename-site', 'default', 'group'])).code).toBe(0);
        expect(await cli(threeSites, ['orphans'])).toEqual({
            code: 0,
            output: 'The config claims everything stored.',
        });
    });
});

describe('kizuna cms pull', () => {
    const pulling = defineConfig({
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
                    ...siteFields('uk'),
                    pages: {},
                    globals: [Settings],
                    collections: [Events],
                },
            }),
            globals: [PrivacyPolicy],
            collections: [Offices],
            auth: {
                identity: 'editor',
            },
            environments: {
                local: {
                    url: 'https://local.hagen.example.com/api',
                },
                staging: {
                    url: 'https://staging.hagen.example.com/api',
                },
            },
        }),
    });

    /**
     * Staging's published content, by the path its editing routes serve it at.
     */
    const published: Record<string, Record<string, unknown>> = {
        '/editing/globals/privacyPolicy/published': {
            text: 'We keep your email.',
        },
        '/editing/sites/uk/globals/settings/published': {
            companyName: 'Hagen UK Ltd',
        },
        '/editing/sites/uk/collections/events/items/workshop/published': {
            title: 'Spring bulbs workshop',
        },
    };

    const listed: Record<string, Array<{ id: string; status: string }>> = {
        '/editing/collections/offices/items': [],
        '/editing/sites/uk/collections/events/items': [
            {
                id: 'workshop',
                status: 'published',
            },
            {
                id: 'tulipWalk',
                status: 'draft',
            },
        ],
    };

    const written: string[] = [];

    const answer = (status: number, body: unknown): Response =>
        new Response(JSON.stringify(body), {
            status,
            headers: {
                'content-type': 'application/json',
            },
        });

    beforeEach(() => {
        written.length = 0;
        vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
            const url = new URL(input);
            const path = url.pathname.replace(/^\/api/, '');
            const method = init?.method ?? 'GET';
            if (url.host === 'staging.hagen.example.com') {
                if (listed[path] !== undefined) {
                    return answer(200, {
                        items: listed[path],
                    });
                }
                if (published[path] !== undefined) {
                    return answer(200, {
                        content: published[path],
                    });
                }
                return answer(404, {
                    detail: 'Not published.',
                });
            }
            written.push(`${method} ${path}`);
            return answer(200, {
                version: 1,
            });
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('copies a site’s own globals and items beside the shared ones', async () => {
        const pulled = await cli(pulling, ['pull', '--from', 'staging', '--json']);
        expect(pulled.code).toBe(0);
        expect(JSON.parse(pulled.output).pulled.map((entry: { document: string }) => entry.document)).toEqual([
            'global:privacyPolicy',
            'global:uk:settings',
            'item:uk:events:workshop',
        ]);
        expect(written).toEqual([
            'PATCH /editing/globals/privacyPolicy/draft',
            'POST /editing/globals/privacyPolicy/publish',
            'PATCH /editing/sites/uk/globals/settings/draft',
            'POST /editing/sites/uk/globals/settings/publish',
            'PATCH /editing/sites/uk/collections/events/items/workshop/draft',
            'POST /editing/sites/uk/collections/events/items/workshop/publish',
        ]);
    });
});
