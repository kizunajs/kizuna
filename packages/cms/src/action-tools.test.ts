import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { createMcpServer } from '@kizunajs/mcp';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { defineCollection } from './definitions.js';
import { defineView } from './view-definition.js';
import { cms } from './provider.js';
import { DocumentStore } from './storage/store.js';

const k = new Kizuna();
const roles = Kizuna.roles(['support', 'admin']);

const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
        roles,
    })
    .guard(({ bearer, deny }) => {
        if (bearer?.token === 'support-token') {
            return {
                userId: 'sam',
                role: 'support',
            };
        }
        if (bearer?.token === 'admin-token') {
            return {
                userId: 'grace',
                role: 'admin',
            };
        }
        return deny({
            status: 401,
            body: {
                detail: 'Unauthorized',
            },
        });
    });

const ran: string[] = [];

const Newsletters = defineCollection({
    name: 'newsletters',
    id: Kizuna.brand('NewsletterId', z.string()),
    fields: [
        {
            name: 'subject',
            schema: z.string().max(80),
        },
    ],
    actions: {
        send: {
            confirm: 'Send to everyone on the weekly list?',
            handler: async ({ id }) => {
                ran.push(`send ${id}`);
            },
        },
        archive: async ({ id, editor }) => {
            ran.push(`archive ${id} by ${String(editor['userId'])}`);
        },
    },
});

const appUsers = new Map<
    string,
    {
        id: string;
        name: string;
        plan: 'free' | 'pro';
    }
>();

const AppUsers = defineView({
    name: 'appUsers',
    auth: {
        roles: ['support', 'admin'],
    },
    fields: [
        {
            name: 'name',
            schema: z.string().max(60),
        },
        {
            name: 'plan',
            schema: z.enum(['free', 'pro']),
            auth: {
                roles: 'admin',
            },
        },
    ],
    list: ({ query }) => [...appUsers.values()].filter((user) => user.name.includes(query)),
    get: ({ id }) => appUsers.get(id),
    actions: {
        save: async ({ id, data }) => {
            ran.push(`save ${id}`);
            appUsers.set(id, {
                ...appUsers.get(id)!,
                ...data,
            });
        },
        resetPassword: {
            confirm: 'Send this user a password reset email?',
            handler: async ({ id }) => {
                ran.push(`reset ${id}`);
            },
        },
    },
});

const pglite = new PGlite();
const db = drizzle(pglite);
const content = cms({
    db,
    pages: {},
    collections: [Newsletters],
    views: [AppUsers],
    auth: {
        identity: 'editor',
    },
    revalidate: () => {},
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

const connect = async (token: string) => {
    const server = createMcpServer(config.api as never, {
        credentialHeaders: {
            authorization: `Bearer ${token}`,
        },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({
        name: 'test-client',
        version: '1.0.0',
    });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return client;
};

const publishedNewsletter = async (): Promise<string> => {
    const created = await request(app)
        .post('/editing/collections/newsletters/items')
        .set('authorization', 'Bearer admin-token')
        .send({
            values: {
                subject: 'Spring is here',
            },
        });
    const id = created.body.name as string;
    await request(app).post(`/editing/collections/newsletters/items/${id}/publish`).set('authorization', 'Bearer admin-token').send({});
    return id;
};

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(() => {
    ran.length = 0;
    appUsers.clear();
    appUsers.set('user_1', {
        id: 'user_1',
        name: 'Ada Lovelace',
        plan: 'free',
    });
});

afterAll(async () => {
    await pglite.close();
});

describe('view and action tools', () => {
    it('publishes view list and get, save, and every action', async () => {
        const client = await connect('support-token');
        const names = (await client.listTools()).tools.map((tool) => tool.name);
        expect(names).toEqual(
            expect.arrayContaining([
                'editing_list_views',
                'editing_views_app_users_list',
                'editing_views_app_users_get',
                'editing_views_app_users_save',
                'editing_views_app_users_actions_reset_password',
                'editing_actions_newsletters_send',
                'editing_actions_newsletters_archive',
            ])
        );
    });

    it('asks for approval before an action with `confirm`, and not before one without', () => {
        const { editing } = content.routes;
        expect(editing.actions['newsletters']?.['send']?.tool).toEqual({
            needsApproval: true,
        });
        expect(editing.actions['newsletters']?.['archive']?.tool).toBe(true);
        expect(editing.views?.['appUsers']?.actions?.['resetPassword']?.tool).toEqual({
            needsApproval: true,
        });
        expect(editing.views?.['appUsers']?.save?.tool).toBe(true);
    });

    it('lists and reads a view as the signed-in editor', async () => {
        const client = await connect('support-token');
        const listed = await client.callTool({
            name: 'editing_views_app_users_list',
            arguments: {
                query: {
                    q: 'Ada',
                },
            },
        });
        expect(listed.structuredContent).toMatchObject({
            status: 200,
            body: {
                items: [
                    {
                        id: 'user_1',
                        title: 'Ada Lovelace',
                    },
                ],
            },
        });
        const read = await client.callTool({
            name: 'editing_views_app_users_get',
            arguments: {
                params: {
                    id: 'user_1',
                },
            },
        });
        expect(read.structuredContent).toMatchObject({
            status: 200,
            body: {
                item: {
                    id: 'user_1',
                    name: 'Ada Lovelace',
                    plan: 'free',
                },
            },
        });
    });

    it('saves through the tool with the same field auth as the editor', async () => {
        const client = await connect('support-token');
        const refused = await client.callTool({
            name: 'editing_views_app_users_save',
            arguments: {
                params: {
                    id: 'user_1',
                },
                body: {
                    data: {
                        plan: 'pro',
                    },
                },
            },
        });
        expect(refused.isError).toBe(true);
        expect(JSON.parse((refused.content as Array<{ text: string }>)[0]!.text)).toMatchObject({
            status: 403,
            body: {
                detail: "The field 'plan' takes the role 'admin'.",
            },
        });
        expect(ran).toEqual([]);

        const saved = await client.callTool({
            name: 'editing_views_app_users_save',
            arguments: {
                params: {
                    id: 'user_1',
                },
                body: {
                    data: {
                        name: 'Ada King',
                    },
                },
            },
        });
        expect(saved.structuredContent).toMatchObject({
            status: 200,
            body: {
                item: {
                    name: 'Ada King',
                },
            },
        });
        expect(ran).toEqual(['save user_1']);
    });

    it('runs a collection action as the signed-in editor', async () => {
        const id = await publishedNewsletter();
        const client = await connect('support-token');
        const result = await client.callTool({
            name: 'editing_actions_newsletters_archive',
            arguments: {
                params: {
                    id,
                },
            },
        });
        expect(result.structuredContent).toMatchObject({
            status: 204,
        });
        expect(ran).toEqual([`archive ${id} by sam`]);
    });

    it('runs nothing that needs approval in a client that cannot ask the person', async () => {
        const id = await publishedNewsletter();
        const client = await connect('admin-token');
        const result = await client.callTool({
            name: 'editing_actions_newsletters_send',
            arguments: {
                params: {
                    id,
                },
            },
        });
        expect(result.isError).toBe(true);
        expect(ran).toEqual([]);
    });
});
