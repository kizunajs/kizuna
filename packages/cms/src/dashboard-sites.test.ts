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
import type { CmsExports } from './setup.js';
import type { DashboardContext, OverviewContext } from './dashboard.js';
import type { RefreshRecord } from './dashboard-data.js';

const k = new Kizuna();
const roles = Kizuna.roles(['editor', 'admin']);

const EDITORS: Record<string, { userId: string; role: 'editor' | 'admin'; sites?: Record<string, 'editor' | 'admin'> }> = {
    'grace-token': {
        userId: 'grace',
        role: 'admin',
    },
    'ada-token': {
        userId: 'ada',
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

const OfficeId = Kizuna.brand('OfficeId', z.string());

const Offices = defineCollection({
    name: 'offices',
    label: 'Offices',
    id: OfficeId,
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

const FrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
        {
            name: 'offices',
            schema: z.array(OfficeId).optional(),
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

const visitCalls: string[] = [];

const visits = ({ site }: DashboardContext<typeof sites>) => {
    visitCalls.push(site.key);
    return {
        value: site.key === 'uk' ? 21460 : 16910,
        change: 0.1,
    };
};

const visitsPerDay = ({ site }: DashboardContext<typeof sites>) => [
    {
        label: 'Mon',
        value: site.key === 'uk' ? 400 : 300,
    },
];

const visitsAcrossSites = ({ sites: shown }: OverviewContext<typeof sites>) => shown.map((site) => site.key).join(' and ');

const pglite = new PGlite();
const db = drizzle(pglite);
const config = defineConfig({
    adapter: expressAdapter(),
    auth: {
        identities: {
            editor,
        },
    },
    content: cms({
        db,
        sites,
        site: () => 'uk',
        collections: [Offices],
        auth: {
            identity: 'editor',
            roles: ['editor', 'admin'],
            sites: (signedIn) => signedIn.sites,
            people: {
                list: () => [
                    {
                        id: 'grace',
                        name: 'Grace Hopper',
                        roles: ['admin'],
                    },
                    {
                        id: 'ada',
                        name: 'Ada Lund',
                        roles: ['admin'],
                    },
                    {
                        id: 'sam',
                        name: 'Sam Brooks',
                        roles: ['editor'],
                        sites: {
                            uk: 'editor',
                        },
                    },
                ],
            },
        },
        dashboard: [
            {
                type: 'stat',
                label: 'Visits',
                value: visits,
            },
            {
                type: 'stat',
                label: 'Workshop bookings',
                value: () => 46,
                sites: ['uk'],
            },
            {
                type: 'reviews',
            },
            {
                type: 'collections',
            },
        ],
        overview: [
            {
                type: 'stat',
                label: 'Visits',
                value: visitsAcrossSites,
            },
            {
                type: 'sites',
                stats: [
                    {
                        label: 'Visits',
                        value: visits,
                    },
                    {
                        label: 'Workshop bookings',
                        value: () => 46,
                        sites: ['uk'],
                    },
                ],
                chart: {
                    label: 'Visits per day',
                    data: visitsPerDay,
                },
            },
            {
                type: 'reviews',
            },
            {
                type: 'refreshes',
            },
            {
                type: 'reach',
            },
            {
                type: 'editors',
            },
        ],
        revalidate: () => undefined,
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
const ada = as('ada-token');
const sam = as('sam-token');

type Widget = {
    type: string;
    label?: string;
    value?: string;
} & Record<string, any>;

const dashboardOf = async (who: ReturnType<typeof as>, site?: string): Promise<Widget[]> => {
    const response = await who.get('/editing/dashboard').query(
        site === undefined
            ? {}
            : {
                  site,
              }
    );
    expect(response.status).toBe(200);
    return response.body.widgets;
};

const office = async (city: string): Promise<string> => {
    const created = await grace.post('/editing/collections/offices/items').send({
        values: {
            city,
        },
    });
    const id = created.body.ref.split(':').pop() as string;
    expect((await grace.post(`/editing/collections/offices/items/${id}/publish`).send({})).status).toBe(200);
    return id;
};

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec(
        'delete from cms_review_comments; delete from cms_reviews; delete from cms_refs; delete from cms_versions; delete from cms_documents;'
    );
    visitCalls.length = 0;
});

afterAll(async () => {
    await pglite.close();
});

describe("a site's dashboard", () => {
    it('runs each stat for the site open, and leaves out a widget for other sites', async () => {
        const uk = await dashboardOf(sam, 'uk');
        expect(uk.filter((widget) => widget.type === 'stat')).toEqual([
            {
                type: 'stat',
                label: 'Visits',
                value: '21460',
                change: 0.1,
            },
            {
                type: 'stat',
                label: 'Workshop bookings',
                value: '46',
            },
        ]);
        const norway = await dashboardOf(grace, 'norway');
        expect(norway.filter((widget) => widget.type === 'stat').map((widget) => widget.label)).toEqual(['Visits']);
        expect(visitCalls).toEqual(['uk', 'norway']);
    });

    it("lists the site's own collections before the shared ones", async () => {
        const collections = (await dashboardOf(sam, 'uk')).find((widget) => widget.type === 'collections')!.collections;
        expect(collections.map((collection: { name: string; site: unknown }) => [collection.name, collection.site])).toEqual([
            [
                'events',
                {
                    key: 'uk',
                    label: 'Hagen UK',
                },
            ],
            ['offices', null],
        ]);
    });

    it('shows only the reviews of the site open', async () => {
        await grace.patch('/editing/sites/uk/pages/frontPage/draft').send({
            changes: {
                heading: 'Hello',
            },
        });
        await grace.patch('/editing/sites/norway/pages/frontPage/draft').send({
            changes: {
                heading: 'Hei',
            },
        });
        for (const ref of ['page:uk:frontPage', 'page:norway:frontPage']) {
            expect(
                (
                    await grace.post('/editing/reviews').send({
                        refs: [ref],
                        reviewers: ['ada'],
                    })
                ).status
            ).toBe(201);
        }
        const reviews = (await dashboardOf(ada, 'uk')).find((widget) => widget.type === 'reviews')!.reviews;
        expect(reviews.map((review: { ref: string }) => review.ref)).toEqual(['page:uk:frontPage']);
    });

    it('refuses a site the editor may not open as if it did not exist', async () => {
        expect((await sam.get('/editing/dashboard').query({ site: 'norway' })).status).toBe(404);
        expect((await grace.get('/editing/dashboard').query({ site: 'sweden' })).status).toBe(404);
        expect(visitCalls).toEqual([]);
    });
});

describe('the overview', () => {
    it('shows to an admin over every site, without a site', async () => {
        const widgets = await dashboardOf(grace);
        expect(widgets.map((widget) => widget.type)).toEqual(['stat', 'sites', 'reviews', 'refreshes', 'reach', 'editors']);
        expect(widgets[0]).toMatchObject({
            label: 'Visits',
            value: 'uk and norway',
        });
    });

    it('never shows to an editor of one site, who gets the shared content without numbers', async () => {
        const widgets = await dashboardOf(sam);
        expect(widgets.map((widget) => widget.type)).toEqual(['reviews', 'collections']);
        expect(visitCalls).toEqual([]);
    });

    it("compares the sites with the site dashboard's own functions", async () => {
        const compared = (await dashboardOf(grace)).find((widget) => widget.type === 'sites')!;
        expect(compared.chart).toEqual({
            label: 'Visits per day',
            style: 'bar',
        });
        expect(
            compared.sites.map((site: Widget) => ({
                key: site.key,
                icon: site.icon,
                stats: site.stats,
                chart: site.chart,
            }))
        ).toEqual([
            {
                key: 'uk',
                icon: 'https://hagen.example.co.uk/icons/uk.svg',
                stats: [
                    {
                        label: 'Visits',
                        value: '21460',
                        change: 0.1,
                    },
                    {
                        label: 'Workshop bookings',
                        value: '46',
                    },
                ],
                chart: [
                    {
                        label: 'Mon',
                        value: 400,
                    },
                ],
            },
            {
                key: 'norway',
                icon: 'https://hagen.example.no/icons/norway.svg',
                stats: [
                    {
                        label: 'Visits',
                        value: '16910',
                        change: 0.1,
                    },
                    {
                        label: 'Workshop bookings',
                    },
                ],
                chart: [
                    {
                        label: 'Mon',
                        value: 300,
                    },
                ],
            },
        ]);
    });

    it("names each site's waiting reviews and last publish", async () => {
        await grace.patch('/editing/sites/uk/pages/frontPage/draft').send({
            changes: {
                heading: 'Hello',
            },
        });
        await grace.post('/editing/sites/uk/pages/frontPage/publish').send({});
        await grace.patch('/editing/sites/uk/pages/frontPage/draft').send({
            changes: {
                heading: 'Hello again',
            },
        });
        await grace.post('/editing/reviews').send({
            refs: ['page:uk:frontPage'],
            reviewers: ['sam'],
        });
        const widgets = await dashboardOf(grace);
        const [uk, norway] = widgets.find((widget) => widget.type === 'sites')!.sites;
        expect(uk).toMatchObject({
            waiting: 1,
            lastPublish: {
                ref: 'page:uk:frontPage',
                label: 'Front',
            },
            lastRefresh: null,
        });
        expect(norway).toMatchObject({
            waiting: 0,
            lastPublish: null,
        });
        const reviews = widgets.find((widget) => widget.type === 'reviews')!;
        expect(reviews.reviews.map((review: { ref: string }) => review.ref)).toEqual(['page:uk:frontPage']);
        expect(reviews.sites.map((site: { key: string }) => site.key)).toEqual(['uk', 'norway']);
    });

    it('ranks shared items by the pages and sites that show them', async () => {
        const london = await office('London');
        const oslo = await office('Oslo');
        await grace.patch('/editing/sites/uk/pages/frontPage/draft').send({
            changes: {
                heading: 'Hello',
                offices: [london, oslo],
            },
        });
        await grace.patch('/editing/sites/norway/pages/frontPage/draft').send({
            changes: {
                heading: 'Hei',
                offices: [oslo],
            },
        });
        await grace.patch(`/editing/collections/offices/items/${london}/draft`).send({
            changes: {
                city: 'Greater London',
            },
        });
        const reach = (await dashboardOf(grace)).find((widget) => widget.type === 'reach')!;
        expect(reach).toEqual({
            type: 'reach',
            sites: 2,
            items: [
                {
                    ref: `item:offices:${oslo}`,
                    label: 'Oslo',
                    kind: 'Offices',
                    pages: 2,
                    sites: 2,
                    changed: false,
                },
                {
                    ref: `item:offices:${london}`,
                    label: 'Greater London',
                    kind: 'Offices',
                    pages: 1,
                    sites: 1,
                    changed: true,
                },
            ],
        });
    });

    it("counts each editor's changes this period, with their roles", async () => {
        await office('London');
        await sam.patch('/editing/sites/uk/pages/frontPage/draft').send({
            changes: {
                heading: 'Hello',
            },
        });
        const editors = (await dashboardOf(grace)).find((widget) => widget.type === 'editors')!;
        expect(editors).toMatchObject({
            changes: 2,
            published: 1,
        });
        expect(editors.editors).toMatchObject([
            {
                id: 'sam',
                name: 'Sam Brooks',
                roles: ['editor'],
                sites: [
                    {
                        label: 'Hagen UK',
                        roles: ['editor'],
                    },
                ],
                changes: 1,
            },
            {
                id: 'grace',
                name: 'Grace Hopper',
                roles: ['admin'],
                sites: [],
                changes: 1,
            },
        ]);
    });

    it('has no refreshes until the store records some', async () => {
        const refreshes = (await dashboardOf(grace)).find((widget) => widget.type === 'refreshes')!;
        expect(refreshes.targets).toEqual([]);
    });

    it("names each site's and partner's last refresh, once the store records them", async () => {
        const now = Date.now();
        const records: RefreshRecord[] = [
            {
                target: 'uk',
                status: 'answered',
                attempts: 1,
                at: new Date(now - 60_000),
            },
            {
                target: 'norway',
                status: 'answered',
                attempts: 1,
                at: new Date(now - 60_000),
            },
            {
                target: 'norway',
                status: 'retrying',
                attempts: 3,
                at: new Date(now - 30_000),
            },
            {
                target: 'travelAgency',
                status: 'answered',
                attempts: 1,
                at: new Date(now - 60_000),
            },
        ];
        const store = service.store as unknown as { refreshesSince?: (from: Date) => Promise<RefreshRecord[]> };
        store.refreshesSince = async (from) => records.filter((record) => record.at >= from);
        try {
            const widgets = await dashboardOf(grace);
            expect(widgets.find((widget) => widget.type === 'refreshes')!.targets).toEqual([
                {
                    key: 'uk',
                    label: 'Hagen UK',
                    kind: 'site',
                    last: {
                        status: 'answered',
                        at: records[0]!.at.toISOString(),
                        attempts: 1,
                    },
                    answered: 1,
                    total: 1,
                },
                {
                    key: 'norway',
                    label: 'Hagen Norge',
                    kind: 'site',
                    last: {
                        status: 'retrying',
                        at: records[2]!.at.toISOString(),
                        attempts: 3,
                    },
                    answered: 1,
                    total: 2,
                },
                {
                    key: 'travelAgency',
                    label: 'Travel agency',
                    kind: 'partner',
                    last: {
                        status: 'answered',
                        at: records[3]!.at.toISOString(),
                        attempts: 1,
                    },
                    answered: 1,
                    total: 1,
                },
            ]);
            const [, norway] = widgets.find((widget) => widget.type === 'sites')!.sites;
            expect(norway.lastRefresh).toEqual({
                status: 'retrying',
                at: records[2]!.at.toISOString(),
                attempts: 3,
            });
        } finally {
            delete store.refreshesSince;
        }
    });
});

describe('declaring dashboards with sites', () => {
    const assemble = (options: Pick<Parameters<typeof cms>[0], 'dashboard' | 'overview' | 'sites'>) =>
        defineConfig({
            adapter: expressAdapter(),
            auth: {
                identities: {
                    editor,
                },
            },
            content: cms({
                db,
                ...options,
                auth: {
                    identity: 'editor',
                },
            }),
        });

    it('refuses a widget naming a site cms() does not declare', () => {
        expect(() =>
            assemble({
                sites,
                dashboard: [
                    {
                        type: 'stat',
                        label: 'Visits',
                        value: () => 1,
                        sites: ['sweden'],
                    },
                ],
            })
        ).toThrow("Dashboard stat 'Visits' names the site 'sweden', which declareSites() does not declare. It declares uk, norway.");
    });

    it('refuses an overview without sites', () => {
        expect(() =>
            assemble({
                overview: [
                    {
                        type: 'reach',
                    },
                ],
            })
        ).toThrow('cms() has an `overview`, which compares sites, but declares no sites.');
    });
});
