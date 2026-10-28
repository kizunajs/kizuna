import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { defineCollection } from './definitions.js';
import { defineView } from './view-definition.js';
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
    columns: ['name', 'email'],
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
    ],
    list: () => [
        {
            id: 'review_1',
            text: 'Lovely',
            status: 'pending',
        },
    ],
    get: ({ id }) =>
        id === 'review_1'
            ? {
                  id,
                  text: 'Lovely',
                  status: 'pending',
              }
            : undefined,
    actions: {
        approve: async () => {},
    },
});

const pglite = new PGlite();
const db = drizzle(pglite);
const content = cms({
    db,
    pages: {},
    views: [AppUsers, ProductReviews],
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
                title: 'name',
                columns: ['name', 'email'],
                search: ['name', 'email'],
                readOnly: false,
            },
        ]);
        expect((await as('moderator', request(app).get('/editing/views'))).body.views).toEqual([
            {
                name: 'productReviews',
                label: 'Product reviews',
                title: 'text',
                columns: ['text'],
                search: [],
                readOnly: true,
            },
        ]);
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
