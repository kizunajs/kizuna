import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { defineCollection } from './definitions.js';
import { definePage } from './page.js';
import { defineView } from './view-definition.js';
import { cms } from './provider.js';
import { DocumentStore } from './storage/store.js';
import type { DashboardContext } from './dashboard.js';

const k = new Kizuna();
const roles = Kizuna.roles(['editor', 'admin']);

const TOKENS: Record<string, { userId: string; role: 'editor' | 'admin' }> = {
    'ada-token': {
        userId: 'ada',
        role: 'editor',
    },
    'grace-token': {
        userId: 'grace',
        role: 'admin',
    },
};

const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
        roles,
    })
    .guard(({ bearer, deny }) => {
        const found = TOKENS[bearer?.token ?? ''];
        if (found !== undefined) return found;
        return deny({
            status: 401,
            body: {
                detail: 'Unauthorized',
            },
        });
    });

const FrontPage = definePage({
    name: 'frontPage',
    label: 'Front Page',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
    ],
});

const Employees = defineCollection({
    name: 'employees',
    group: 'Company',
    id: Kizuna.brand('EmployeeId', z.string()),
    fields: [
        {
            name: 'name',
            schema: z.string().min(1).max(40),
        },
    ],
});

const AppUsers = defineView({
    name: 'appUsers',
    label: 'App users',
    group: 'People',
    auth: {
        roles: 'admin',
    },
    fields: [
        {
            name: 'email',
            schema: z.email(),
        },
    ],
    list: () => [],
    get: () => undefined,
});

const revenueCalls: DashboardContext[] = [];
const orderCalls: DashboardContext[] = [];

const people = [
    {
        id: 'ada',
        name: 'Ada Lovelace',
    },
    {
        id: 'grace',
        name: 'Grace Hopper',
    },
];

const pglite = new PGlite();
const db = drizzle(pglite);

const assemble = (dashboard: Parameters<typeof cms>[0]['dashboard']) =>
    defineConfig({
        adapter: expressAdapter(),
        auth: {
            identities: {
                editor,
            },
        },
        content: cms({
            db,
            pages: {
                frontPage: {
                    path: '/',
                    page: FrontPage,
                },
            },
            collections: [Employees],
            views: [AppUsers],
            dashboard,
            auth: {
                identity: 'editor',
                people: {
                    list: () => people,
                },
            },
            revalidate: () => undefined,
        }),
    });

const mount = (config: ReturnType<typeof assemble>) => {
    const app = express();
    config.api.mount(app);
    return app;
};

const configured = mount(
    assemble([
        {
            type: 'stat',
            label: 'Revenue this week',
            value: async (context) => {
                revenueCalls.push(context);
                return {
                    value: 'kr 48 200',
                    detail: 'Up 12% on last week',
                };
            },
            auth: {
                roles: 'admin',
            },
        },
        {
            type: 'stat',
            label: 'Open orders',
            value: () => 17,
        },
        {
            type: 'chart',
            label: 'Orders per day',
            data: (context) => {
                orderCalls.push(context);
                return [
                    {
                        label: 'Mon',
                        value: 4,
                    },
                    {
                        label: 'Tue',
                        value: 9,
                    },
                ];
            },
        },
        {
            type: 'reviews',
        },
        {
            type: 'collections',
        },
    ])
);
const plain = mount(assemble(undefined));
const compared = mount(
    assemble([
        {
            type: 'stat',
            label: 'Revenue this week',
            value: () => ({
                value: 'kr 48 200',
                change: 0.081,
                trend: [31, 40, 38, 48],
            }),
        },
        {
            type: 'stat',
            label: 'Orders this week',
            value: () => ({
                value: 12,
                change: (12 - 0) / 0,
            }),
        },
        {
            type: 'chart',
            label: 'Sales over time',
            description: 'Succeeded orders · NOK',
            style: 'line',
            data: () => [
                {
                    label: '1 Oct',
                    value: 4200,
                    previous: 3900,
                },
                {
                    label: '2 Oct',
                    value: 5100,
                    previous: Number.NaN,
                },
                {
                    label: '3 Oct',
                    value: 4800,
                },
            ],
        },
    ])
);

const as = (who: 'ada' | 'grace', call: request.Test) => call.set('authorization', `Bearer ${who}-token`);

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec('delete from cms_reviews; delete from cms_refs; delete from cms_versions; delete from cms_documents;');
    revenueCalls.length = 0;
    orderCalls.length = 0;
});

afterAll(async () => {
    await pglite.close();
});

describe('the dashboard', () => {
    it('shows an editor only the widgets they may see, and never runs the rest', async () => {
        const response = await as('ada', request(configured).get('/editing/dashboard'));
        expect(response.status).toBe(200);
        expect(response.body.widgets.map((widget: { type: string; label?: string }) => widget.label ?? widget.type)).toEqual([
            'Open orders',
            'Orders per day',
            'reviews',
            'collections',
        ]);
        expect(revenueCalls).toEqual([]);
    });

    it('runs stat and chart functions as the editor, with the plugins', async () => {
        const response = await as('grace', request(configured).get('/editing/dashboard'));
        expect(response.body.widgets.slice(0, 3)).toEqual([
            {
                type: 'stat',
                label: 'Revenue this week',
                value: 'kr 48 200',
                detail: 'Up 12% on last week',
            },
            {
                type: 'stat',
                label: 'Open orders',
                value: '17',
            },
            {
                type: 'chart',
                label: 'Orders per day',
                style: 'bar',
                data: [
                    {
                        label: 'Mon',
                        value: 4,
                    },
                    {
                        label: 'Tue',
                        value: 9,
                    },
                ],
            },
        ]);
        expect(revenueCalls).toHaveLength(1);
        expect(revenueCalls[0]!.editor).toMatchObject({
            userId: 'grace',
            role: 'admin',
        });
        expect(revenueCalls[0]!.plugins['cms']).toBeDefined();
        expect(orderCalls).toHaveLength(1);
    });

    it('lists the reviews waiting on the editor, and the collections and views they may open', async () => {
        await as('ada', request(configured).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                heading: 'Spring is here',
            },
        });
        await as('ada', request(configured).post('/editing/reviews')).send({
            refs: ['page:frontPage'],
            reviewers: ['grace'],
        });
        await as('ada', request(configured).post('/editing/collections/employees/items')).send({
            values: {
                name: 'Kari Nordmann',
            },
        });
        const forGrace = await as('grace', request(configured).get('/editing/dashboard'));
        const [reviews, collections] = forGrace.body.widgets.slice(3);
        expect(reviews.type).toBe('reviews');
        expect(reviews.reviews).toHaveLength(1);
        expect(reviews.reviews[0]).toMatchObject({
            ref: 'page:frontPage',
            label: 'Front Page',
            status: 'open',
        });
        expect(collections).toEqual({
            type: 'collections',
            collections: [
                {
                    kind: 'collection',
                    name: 'employees',
                    label: 'Employees',
                    group: 'Company',
                    count: 1,
                },
                {
                    kind: 'view',
                    name: 'appUsers',
                    label: 'App users',
                    group: 'People',
                    count: null,
                },
            ],
        });
        const forAda = await as('ada', request(configured).get('/editing/dashboard'));
        const [adaReviews, adaCollections] = forAda.body.widgets.slice(2);
        expect(adaReviews.reviews).toEqual([]);
        expect(adaCollections.collections.map((entry: { name: string }) => entry.name)).toEqual(['employees']);
    });

    it("sends a stat's change and trend, leaving out a change that is not a finite number", async () => {
        const response = await as('ada', request(compared).get('/editing/dashboard'));
        expect(response.body.widgets.slice(0, 2)).toEqual([
            {
                type: 'stat',
                label: 'Revenue this week',
                value: 'kr 48 200',
                change: 0.081,
                trend: [31, 40, 38, 48],
            },
            {
                type: 'stat',
                label: 'Orders this week',
                value: '12',
            },
        ]);
    });

    it("sends a line chart's description and each point's previous value", async () => {
        const response = await as('ada', request(compared).get('/editing/dashboard'));
        expect(response.body.widgets[2]).toEqual({
            type: 'chart',
            label: 'Sales over time',
            description: 'Succeeded orders · NOK',
            style: 'line',
            data: [
                {
                    label: '1 Oct',
                    value: 4200,
                    previous: 3900,
                },
                {
                    label: '2 Oct',
                    value: 5100,
                },
                {
                    label: '3 Oct',
                    value: 4800,
                },
            ],
        });
    });

    it('shows reviews and collections without `dashboard`', async () => {
        const response = await as('ada', request(plain).get('/editing/dashboard'));
        expect(response.status).toBe(200);
        expect(response.body.widgets.map((widget: { type: string }) => widget.type)).toEqual(['reviews', 'collections']);
    });

    it('answers 401 to someone signed out', async () => {
        expect((await request(plain).get('/editing/dashboard')).status).toBe(401);
    });
});

describe('checking the dashboard', () => {
    it('refuses a role or a permission the editor identity does not declare', () => {
        expect(() =>
            assemble([
                {
                    type: 'stat',
                    label: 'Revenue this week',
                    value: () => 0,
                    auth: {
                        roles: 'finance',
                    },
                },
            ])
        ).toThrow("Dashboard stat 'Revenue this week' accepts the role 'finance', which cms()'s identity 'editor' does not declare.");
        expect(() =>
            assemble([
                {
                    type: 'reviews',
                    auth: {
                        requires: {
                            reviews: ['read'],
                        },
                    },
                },
            ])
        ).toThrow("Dashboard widget 'reviews' requires 'reviews:read', which cms()'s identity 'editor' does not declare.");
    });

    it('refuses a widget without its function', () => {
        expect(() =>
            assemble([
                {
                    type: 'chart',
                    label: 'Orders per day',
                } as never,
            ])
        ).toThrow(/data/);
    });

    it('refuses a chart style it cannot draw', () => {
        expect(() =>
            assemble([
                {
                    type: 'chart',
                    label: 'Orders per day',
                    style: 'pie',
                    data: () => [],
                } as never,
            ])
        ).toThrow(/style/);
    });
});
