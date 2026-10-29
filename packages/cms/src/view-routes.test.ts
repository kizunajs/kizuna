import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { defineCollection } from './definitions.js';
import { defineView, type ViewListInput } from './view-definition.js';
import { cms } from './provider.js';
import { DocumentStore } from './storage/store.js';

const k = new Kizuna();
const roles = Kizuna.roles(['editor', 'support', 'admin', 'moderator']);

const tokens: Record<string, 'editor' | 'support' | 'admin' | 'moderator'> = {
    'editor-token': 'editor',
    'support-token': 'support',
    'admin-token': 'admin',
    'moderator-token': 'moderator',
};

const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
        roles,
    })
    .guard(({ bearer, deny }) => {
        const role = tokens[bearer?.token ?? ''];
        if (role !== undefined) {
            return {
                userId: role,
                role,
            };
        }
        return deny({
            status: 401,
            body: {
                detail: 'Unauthorized',
            },
        });
    });

interface AppUser {
    id: string;
    name: string;
    email: string;
    plan: 'free' | 'pro';
    active: boolean;
    joinedOn: string;
    passwordHash: string;
}

const appUsers = new Map<string, AppUser>();
const saved: Array<Record<string, unknown>> = [];
const resets: string[] = [];

const AppUsers = defineView({
    name: 'appUsers',
    label: 'App users',
    group: 'People',
    auth: {
        roles: ['support', 'admin'],
    },
    fields: [
        {
            name: 'name',
            schema: z.string().max(60),
        },
        {
            name: 'email',
            schema: z.email(),
        },
        {
            name: 'plan',
            schema: z.enum(['free', 'pro']),
            options: {
                free: 'Free',
                pro: 'Pro',
            },
            auth: {
                roles: 'admin',
            },
        },
        {
            name: 'joinedOn',
            schema: z.string(),
            readOnly: true,
        },
    ],
    columns: ['name', 'email', 'plan'],
    search: ['name', 'email'],
    list: async ({ query }) => {
        return [...appUsers.values()].filter((user) => user.name.toLowerCase().includes(query.toLowerCase()));
    },
    get: async ({ id }) => {
        return appUsers.get(id);
    },
    actions: {
        save: async ({ id, data, editor }) => {
            saved.push({
                id,
                data,
                editor: editor['userId'],
            });
            appUsers.set(id, {
                ...appUsers.get(id)!,
                ...data,
            });
        },
        resetPassword: {
            confirm: 'Send this user a password reset email?',
            when: ({ item }) => item.active,
            handler: async ({ id }) => {
                resets.push(id);
            },
        },
        delete: {
            auth: {
                roles: 'admin',
            },
            handler: async ({ id }) => {
                appUsers.delete(id);
            },
        },
    },
});

const ProductReviews = defineView({
    name: 'productReviews',
    auth: {
        roles: 'moderator',
    },
    fields: [
        {
            name: 'text',
            schema: z.string().max(2000),
        },
        {
            name: 'status',
            schema: z.enum(['pending', 'approved', 'rejected']),
        },
        {
            name: 'postedAt',
            label: 'Posted',
            schema: z.iso.datetime().optional(),
        },
    ],
    columns: ['text', 'postedAt'],
    list: () => [
        {
            id: 'review_1',
            text: 'Lovely',
            status: 'pending',
            postedAt: '2026-10-28T09:42:00.000Z',
        },
    ],
    get: ({ id }) =>
        id === 'review_1'
            ? {
                  id,
                  text: 'Lovely',
                  status: 'pending',
                  postedAt: '2026-10-28T09:42:00.000Z',
              }
            : undefined,
    actions: {
        approve: async () => {},
    },
});

interface Member {
    id: string;
    name: string;
    plan: 'free' | 'pro';
    active: boolean;
    tags: Array<'beta' | 'staff'>;
    joinedOn: string;
}

const members: Member[] = [
    {
        id: 'member_1',
        name: 'Grace Hopper',
        plan: 'pro',
        active: true,
        tags: ['staff'],
        joinedOn: '2026-02-11',
    },
    {
        id: 'member_2',
        name: 'Ada Lovelace',
        plan: 'free',
        active: true,
        tags: ['beta', 'staff'],
        joinedOn: '2026-01-04',
    },
    {
        id: 'member_3',
        name: 'Alan Turing',
        plan: 'free',
        active: false,
        tags: [],
        joinedOn: '2026-03-20',
    },
];

const asked: ViewListInput[] = [];

const holds = (member: Member, condition: ViewListInput['filters'][number][number]): boolean => {
    const held = member[condition.field as keyof Member];
    const found = Array.isArray(held) ? (held as unknown[]).includes(condition.value) : held === condition.value;
    return condition.operator === 'is' ? found : !found;
};

const Members = defineView({
    name: 'members',
    auth: {
        roles: 'admin',
    },
    fields: [
        {
            name: 'name',
            schema: z.string(),
        },
        {
            name: 'plan',
            label: 'Plan',
            schema: z.enum(['free', 'pro']),
            options: {
                free: 'Free',
                pro: 'Pro',
            },
        },
        {
            name: 'active',
            schema: z.boolean(),
        },
        {
            name: 'tags',
            schema: z.array(z.enum(['beta', 'staff'])),
        },
        {
            name: 'joinedOn',
            schema: z.iso.date(),
        },
    ],
    columns: ['name', 'plan'],
    filters: ['plan', 'active', 'tags'],
    sorts: ['name', 'joinedOn'],
    list: (input) => {
        asked.push(input);
        const matching = members.filter(
            (member) =>
                input.filters.length === 0 || input.filters.some((conditions) => conditions.every((condition) => holds(member, condition)))
        );
        const field = input.orderBy;
        const sorted =
            field === undefined
                ? matching
                : [...matching].sort((left, right) => left[field].localeCompare(right[field]) * (input.direction === 'desc' ? -1 : 1));
        return {
            items: sorted.slice(input.offset, input.limit === undefined ? undefined : input.offset + input.limit),
            total: sorted.length,
        };
    },
    get: ({ id }) => members.find((member) => member.id === id),
});

const pglite = new PGlite();
const db = drizzle(pglite);
const content = cms({
    db,
    pages: {},
    views: [AppUsers, ProductReviews, Members],
    auth: {
        identity: 'editor',
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

const as = (role: string, call: request.Test) => call.set('authorization', `Bearer ${role}-token`);

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(() => {
    appUsers.clear();
    appUsers.set('user_1', {
        id: 'user_1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        plan: 'free',
        active: true,
        joinedOn: '2026-01-04',
        passwordHash: 'secret',
    });
    appUsers.set('user_2', {
        id: 'user_2',
        name: 'Grace Hopper',
        email: 'grace@example.com',
        plan: 'pro',
        active: false,
        joinedOn: '2026-02-11',
        passwordHash: 'secret',
    });
    saved.length = 0;
    resets.length = 0;
    asked.length = 0;
});

afterAll(async () => {
    await pglite.close();
});

describe('listing views', () => {
    it('lists the views the caller may open', async () => {
        expect((await as('editor', request(app).get('/editing/views'))).body.views).toEqual([]);
        expect((await as('support', request(app).get('/editing/views'))).body.views).toEqual([
            {
                name: 'appUsers',
                label: 'App users',
                group: 'People',
                title: 'name',
                columns: ['name', 'email', 'plan'],
                options: {
                    plan: {
                        free: 'Free',
                        pro: 'Pro',
                    },
                },
                labels: {},
                formats: {},
                search: ['name', 'email'],
                filters: [],
                sorts: [],
                readOnly: false,
            },
        ]);
        expect((await as('moderator', request(app).get('/editing/views'))).body.views).toEqual([
            {
                name: 'productReviews',
                label: 'Product reviews',
                group: null,
                title: 'text',
                columns: ['text', 'postedAt'],
                options: {},
                labels: {
                    postedAt: 'Posted',
                },
                formats: {
                    postedAt: 'date-time',
                },
                search: [],
                filters: [],
                sorts: [],
                readOnly: true,
            },
        ]);
    });

    it('describes the fields a view filters and sorts by, with the values a condition may name', async () => {
        const [, members] = (await as('admin', request(app).get('/editing/views'))).body.views;
        expect(members.filters).toEqual([
            {
                field: 'plan',
                label: 'Plan',
                choices: [
                    {
                        value: 'free',
                        label: 'Free',
                    },
                    {
                        value: 'pro',
                        label: 'Pro',
                    },
                ],
            },
            {
                field: 'active',
                label: null,
                choices: [
                    {
                        value: 'true',
                        label: 'Yes',
                    },
                    {
                        value: 'false',
                        label: 'No',
                    },
                ],
            },
            {
                field: 'tags',
                label: null,
                choices: [
                    {
                        value: 'beta',
                        label: 'beta',
                    },
                    {
                        value: 'staff',
                        label: 'staff',
                    },
                ],
            },
        ]);
        expect(members.sorts).toEqual(['name', 'joinedOn']);
        expect(members.options).toEqual({
            plan: {
                free: 'Free',
                pro: 'Pro',
            },
        });
    });

    it('names the label of each column whose field declares one, and the format of each holding a date', async () => {
        const [, members] = (await as('admin', request(app).get('/editing/views'))).body.views;
        expect(members.labels).toEqual({
            plan: 'Plan',
        });
        expect(members.formats).toEqual({
            joinedOn: 'date',
        });
    });
});

describe('filtering, sorting and paging a view', () => {
    const listMembers = (query: Record<string, unknown>) => as('admin', request(app).get('/editing/views/members/items')).query(query);

    it('hands list the conditions, typed as the fields hold them, and the sort and page', async () => {
        const response = await listMembers({
            filter: ['plan:is:free', 'active:is:true', 'or', 'tags:is:staff', 'plan:isNot:free'],
            orderBy: 'joinedOn',
            direction: 'desc',
            limit: 1,
            offset: 0,
        });
        expect(response.status).toBe(200);
        expect(asked[0]).toMatchObject({
            query: '',
            filters: [
                [
                    {
                        field: 'plan',
                        operator: 'is',
                        value: 'free',
                    },
                    {
                        field: 'active',
                        operator: 'is',
                        value: true,
                    },
                ],
                [
                    {
                        field: 'tags',
                        operator: 'is',
                        value: 'staff',
                    },
                    {
                        field: 'plan',
                        operator: 'isNot',
                        value: 'free',
                    },
                ],
            ],
            orderBy: 'joinedOn',
            direction: 'desc',
            limit: 1,
            offset: 0,
        });
        expect(response.body).toEqual({
            items: [
                {
                    id: 'member_1',
                    title: 'Grace Hopper',
                    values: {
                        name: 'Grace Hopper',
                        plan: 'pro',
                        joinedOn: '2026-02-11',
                    },
                },
            ],
            total: 2,
        });
    });

    it('asks with no conditions and no sort until the editor gives some', async () => {
        await listMembers({});
        expect(asked[0]).toMatchObject({
            query: '',
            filters: [],
            orderBy: undefined,
            direction: 'asc',
            limit: undefined,
            offset: 0,
        });
    });

    it('answers 400 to a field it does not filter by, a value the field cannot hold, or a sort it does not offer, and never asks list', async () => {
        const unknown = await listMembers({
            filter: ['name:is:Ada'],
        });
        expect(unknown.status).toBe(400);
        expect(unknown.body.detail).toBe("The list of Members cannot filter by 'name'. It filters by plan, active, tags.");
        const value = await listMembers({
            filter: ['plan:is:gold'],
        });
        expect(value.status).toBe(400);
        expect(value.body.detail).toBe("The plan field holds free or pro, not 'gold'.");
        const flag = await listMembers({
            filter: ['active:is:yes'],
        });
        expect(flag.body.detail).toBe("The active field holds true or false, not 'yes'.");
        const nested = await listMembers({
            filter: ['tags:within:beta'],
        });
        expect(nested.body.detail).toBe("A filter on Members compares with is or isNot, not 'within'.");
        expect(
            (
                await listMembers({
                    orderBy: 'plan',
                })
            ).status
        ).toBe(400);
        expect(asked).toEqual([]);
    });

    it('pages the plain array a list returns, and counts every record in it', async () => {
        const response = await as('support', request(app).get('/editing/views/appUsers/items')).query({
            limit: 1,
            offset: 1,
        });
        expect(response.body.items.map((item: { id: string }) => item.id)).toEqual(['user_2']);
        expect(response.body.total).toBe(2);
    });

    it('takes no filter or sort on a view that names none', async () => {
        const response = await as('support', request(app).get('/editing/views/appUsers/items')).query({
            filter: ['plan:is:pro'],
            orderBy: 'name',
        });
        expect(response.status).toBe(200);
        expect(response.body.total).toBe(2);
    });

    it('tells a model which fields filter and sort, and the values each takes', () => {
        const route = (
            config.api.routes as unknown as Record<string, Record<string, Record<string, Record<string, { description?: string }>>>>
        )['editing']!['views']!['members']!['list']!;
        expect(route.description).toBe(
            'Pages with `limit` and `offset`, and counts every record that matches as `total`. Filters by plan (free or pro), active (true or false), tags (beta or staff). Sorts by name or joinedOn.'
        );
    });
});

describe('reading a view', () => {
    it('searches through list, showing the columns', async () => {
        const response = await as('support', request(app).get('/editing/views/appUsers/items')).query({
            q: 'ada',
        });
        expect(response.status).toBe(200);
        expect(response.body.items).toEqual([
            {
                id: 'user_1',
                title: 'Ada Lovelace',
                values: {
                    name: 'Ada Lovelace',
                    email: 'ada@example.com',
                    plan: 'free',
                },
            },
        ]);
    });

    it('answers 403 to an editor the view does not admit', async () => {
        const response = await as('editor', request(app).get('/editing/views/appUsers/items'));
        expect(response.status).toBe(403);
        expect(response.body.detail).toBe("The App users view takes the role 'support' or 'admin'.");
        expect((await as('editor', request(app).get('/editing/views/appUsers/items/user_1'))).status).toBe(403);
    });

    it('reads one record with only what its fields show, which fields the caller may write, and its buttons', async () => {
        const response = await as('support', request(app).get('/editing/views/appUsers/items/user_1'));
        expect(response.status).toBe(200);
        expect(response.body.item).toEqual({
            id: 'user_1',
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            plan: 'free',
            joinedOn: '2026-01-04',
        });
        expect(response.body.readOnly).toBe(false);
        expect(
            Object.fromEntries(
                response.body.fields.map((field: { name: string; writable: boolean; readOnly: boolean }) => [
                    field.name,
                    {
                        writable: field.writable,
                        readOnly: field.readOnly,
                    },
                ])
            )
        ).toEqual({
            name: {
                writable: true,
                readOnly: false,
            },
            email: {
                writable: true,
                readOnly: false,
            },
            plan: {
                writable: false,
                readOnly: false,
            },
            joinedOn: {
                writable: false,
                readOnly: true,
            },
        });
        expect(response.body.fields[0].value).toBe('Ada Lovelace');
        expect(response.body.actions).toEqual([
            {
                name: 'resetPassword',
                label: 'Reset password',
                confirm: 'Send this user a password reset email?',
                available: true,
            },
        ]);
        const asAdmin = await as('admin', request(app).get('/editing/views/appUsers/items/user_2'));
        expect(asAdmin.body.actions.map((action: { name: string; available: boolean }) => [action.name, action.available])).toEqual([
            ['resetPassword', false],
            ['delete', true],
        ]);
    });

    it('answers 404 for a record get does not find', async () => {
        expect((await as('support', request(app).get('/editing/views/appUsers/items/user_9'))).status).toBe(404);
    });
});

describe('saving a view', () => {
    it('saves the fields the editor may write, and answers with the record as it stands', async () => {
        const response = await as('support', request(app).patch('/editing/views/appUsers/items/user_1')).send({
            data: {
                name: 'Ada King',
            },
        });
        expect(response.status).toBe(200);
        expect(response.body.item.name).toBe('Ada King');
        expect(saved).toEqual([
            {
                id: 'user_1',
                data: {
                    name: 'Ada King',
                },
                editor: 'support',
            },
        ]);
    });

    it('answers 403 to a change of a field the editor may not write, and never runs the handler', async () => {
        const response = await as('support', request(app).patch('/editing/views/appUsers/items/user_1')).send({
            data: {
                name: 'Ada King',
                plan: 'pro',
            },
        });
        expect(response.status).toBe(403);
        expect(response.body.detail).toBe("The field 'plan' takes the role 'admin'.");
        expect(saved).toEqual([]);
        expect(appUsers.get('user_1')?.plan).toBe('free');
    });

    it('lets an admin change the plan, and nobody the read-only field', async () => {
        expect(
            (
                await as('admin', request(app).patch('/editing/views/appUsers/items/user_1')).send({
                    data: {
                        plan: 'pro',
                    },
                })
            ).status
        ).toBe(200);
        const refused = await as('admin', request(app).patch('/editing/views/appUsers/items/user_1')).send({
            data: {
                joinedOn: '2020-01-01',
            },
        });
        expect(refused.status).toBe(403);
        expect(refused.body.detail).toBe("The field 'joinedOn' is read only.");
        expect(saved.map((entry) => entry['data'])).toEqual([
            {
                plan: 'pro',
            },
        ]);
    });

    it('takes back an unchanged field the editor may not write, and leaves it out of data', async () => {
        const response = await as('support', request(app).patch('/editing/views/appUsers/items/user_1')).send({
            data: {
                name: 'Ada King',
                plan: 'free',
                joinedOn: '2026-01-04',
            },
        });
        expect(response.status).toBe(200);
        expect(saved[0]?.['data']).toEqual({
            name: 'Ada King',
        });
    });

    it('answers 422 to a field the view lacks, or a value its schema refuses', async () => {
        const unknown = await as('support', request(app).patch('/editing/views/appUsers/items/user_1')).send({
            data: {
                passwordHash: 'changed',
            },
        });
        expect(unknown.status).toBe(422);
        expect(unknown.body.errors[0].path).toEqual(['passwordHash']);
        const invalid = await as('support', request(app).patch('/editing/views/appUsers/items/user_1')).send({
            data: {
                email: 'not an email',
            },
        });
        expect(invalid.status).toBe(422);
        expect(invalid.body.errors[0].path).toEqual(['email']);
        expect(saved).toEqual([]);
    });

    it('stores nothing in the CMS tables', async () => {
        await as('support', request(app).patch('/editing/views/appUsers/items/user_1')).send({
            data: {
                name: 'Ada King',
            },
        });
        const rows = await pglite.query('SELECT count(*)::int AS count FROM cms_documents');
        expect(rows.rows).toEqual([
            {
                count: 0,
            },
        ]);
    });

    it('serves no save for a view without one, and marks every field unwritable', async () => {
        expect(content.routes.editing.views?.['productReviews']).toHaveProperty('get');
        expect(content.routes.editing.views?.['productReviews']).not.toHaveProperty('save');
        const response = await as('moderator', request(app).get('/editing/views/productReviews/items/review_1'));
        expect(response.body.readOnly).toBe(true);
        expect(response.body.fields.every((field: { writable: boolean }) => !field.writable)).toBe(true);
    });
});

describe('running a view action', () => {
    it('runs an action the caller may run on a record `when` admits', async () => {
        const response = await as('support', request(app).post('/editing/views/appUsers/items/user_1/actions/resetPassword'));
        expect(response.status).toBe(200);
        expect(resets).toEqual(['user_1']);
    });

    it('answers 409 when `when` turns the record down', async () => {
        const response = await as('support', request(app).post('/editing/views/appUsers/items/user_2/actions/resetPassword'));
        expect(response.status).toBe(409);
        expect(resets).toEqual([]);
    });

    it("answers 403 to an editor the action's auth turns away, and 204 once the record is gone", async () => {
        expect((await as('support', request(app).post('/editing/views/appUsers/items/user_1/actions/delete'))).status).toBe(403);
        expect(appUsers.has('user_1')).toBe(true);
        expect((await as('admin', request(app).post('/editing/views/appUsers/items/user_1/actions/delete'))).status).toBe(204);
        expect(appUsers.has('user_1')).toBe(false);
    });
});

describe('checking views', () => {
    it('refuses a column that names no field', () => {
        expect(() =>
            defineView({
                name: 'orders',
                fields: [
                    {
                        name: 'customer',
                        schema: z.string(),
                    },
                ],
                columns: ['total' as 'customer'],
                list: () => [],
                get: () => undefined,
            })
        ).toThrow("defineView('orders') names 'total' in `columns`, which is not one of its fields or 'id'.");
    });

    const assemble = (views: Parameters<typeof cms>[0]['views'], collections: Parameters<typeof cms>[0]['collections'] = []) =>
        defineConfig({
            adapter: expressAdapter(),
            auth: {
                identities: {
                    editor,
                },
            },
            content: cms({
                db,
                pages: {},
                collections,
                views,
                auth: {
                    identity: 'editor',
                },
            }),
        });

    it('refuses a role the editor identity does not declare, on the view, a field or an action', () => {
        const fields = [
            {
                name: 'customer',
                schema: z.string(),
            },
        ];
        expect(() =>
            assemble([
                defineView({
                    name: 'orders',
                    auth: {
                        roles: 'sales',
                    },
                    fields,
                    list: () => [],
                    get: () => undefined,
                }),
            ])
        ).toThrow("View 'orders' accepts the role 'sales', which cms()'s identity 'editor' does not declare.");
        expect(() =>
            assemble([
                defineView({
                    name: 'orders',
                    fields: [
                        {
                            name: 'customer',
                            schema: z.string(),
                            auth: {
                                roles: 'sales',
                            },
                        },
                    ],
                    list: () => [],
                    get: () => undefined,
                }),
            ])
        ).toThrow("View 'orders' field 'customer' accepts the role 'sales', which cms()'s identity 'editor' does not declare.");
        expect(() =>
            assemble([
                defineView({
                    name: 'orders',
                    fields,
                    list: () => [],
                    get: () => undefined,
                    actions: {
                        refund: {
                            auth: {
                                roles: 'sales',
                            },
                            handler: async () => {},
                        },
                    },
                }),
            ])
        ).toThrow("View 'orders' action 'refund' accepts the role 'sales', which cms()'s identity 'editor' does not declare.");
    });

    it('refuses a view named like a collection', () => {
        const Orders = defineCollection({
            name: 'orders',
            id: Kizuna.brand('OrderId', z.string()),
            fields: [
                {
                    name: 'customer',
                    schema: z.string(),
                },
            ],
        });
        expect(() =>
            assemble(
                [
                    defineView({
                        name: 'orders',
                        fields: [
                            {
                                name: 'customer',
                                schema: z.string(),
                            },
                        ],
                        list: () => [],
                        get: () => undefined,
                    }),
                ],
                [Orders]
            )
        ).toThrow("The view 'orders' has the name of a global or a collection.");
    });
});
