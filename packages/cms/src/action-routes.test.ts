import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { defineCollection } from './definitions.js';
import { cms } from './provider.js';
import { DocumentStore } from './storage/store.js';

const k = new Kizuna();
const roles = Kizuna.roles(['editor', 'admin']);
const NewsletterId = Kizuna.brand('NewsletterId', z.string());

const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
        roles,
    })
    .guard(({ bearer, deny }) => {
        if (bearer?.token === 'editor-token') {
            return {
                userId: 'ada',
                role: 'editor',
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

const ran: Array<Record<string, unknown>> = [];

const Newsletters = defineCollection({
    name: 'newsletters',
    id: NewsletterId,
    fields: [
        {
            name: 'subject',
            schema: z.string().max(80),
        },
        {
            name: 'audience',
            schema: z.enum(['weekly', 'monthly']),
        },
    ],
    actions: {
        send: {
            auth: {
                roles: 'admin',
            },
            confirm: 'Send to everyone on the weekly list?',
            when: ({ item }) => item.audience === 'weekly',
            handler: async ({ id, item, editor, jobs, plugins }) => {
                await jobs.newsletters.deliver.queue({
                    input: {
                        id,
                    },
                });
                ran.push({
                    action: 'send',
                    id,
                    subject: item.subject,
                    editor,
                    plugins: Object.keys(plugins),
                });
            },
        },
        archive: async ({ id }) => {
            ran.push({
                action: 'archive',
                id,
            });
        },
    },
});

const delivered: string[] = [];
const pglite = new PGlite();
const db = drizzle(pglite);
const config = defineConfig({
    adapter: expressAdapter(),
    auth: {
        identities: {
            editor,
        },
    },
    jobs: k.jobs({
        newsletters: {
            deliver: k
                .job({
                    input: z.object({
                        id: z.string(),
                    }),
                })
                .handler(({ input }) => {
                    delivered.push(input.id);
                }),
        },
    }),
    jobRunner: {
        mode: 'in-process',
    },
    content: cms({
        db,
        pages: {},
        collections: [Newsletters],
        auth: {
            identity: 'editor',
        },
        revalidate: () => {},
    }),
});
const app = express();
config.api.mount(app);

const asEditor = (call: request.Test) => call.set('authorization', 'Bearer editor-token');
const asAdmin = (call: request.Test) => call.set('authorization', 'Bearer admin-token');

const createNewsletter = async (audience: 'weekly' | 'monthly', publish = true): Promise<string> => {
    const created = await asEditor(request(app).post('/editing/collections/newsletters/items')).send({
        values: {
            subject: 'Spring is here',
            audience,
        },
    });
    expect(created.status).toBe(201);
    const id = created.body.name as string;
    if (publish) {
        expect((await asEditor(request(app).post(`/editing/collections/newsletters/items/${id}/publish`)).send({})).status).toBe(200);
    }
    return id;
};

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec('DELETE FROM cms_refs; DELETE FROM cms_versions; DELETE FROM cms_documents;');
    ran.length = 0;
    delivered.length = 0;
});

afterAll(async () => {
    await pglite.close();
});

describe('collection actions', () => {
    it("runs an action as the signed-in editor on the published item, with the app's jobs and plugins", async () => {
        const id = await createNewsletter('weekly');
        const response = await asAdmin(request(app).post(`/editing/collections/newsletters/items/${id}/actions/send`));
        expect(response.status).toBe(204);
        expect(ran).toEqual([
            {
                action: 'send',
                id,
                subject: 'Spring is here',
                editor: {
                    userId: 'grace',
                    role: 'admin',
                },
                plugins: ['cms'],
            },
        ]);
        await expect.poll(() => delivered).toEqual([id]);
    });

    it('runs an action written as a function', async () => {
        const id = await createNewsletter('monthly');
        expect((await asEditor(request(app).post(`/editing/collections/newsletters/items/${id}/actions/archive`))).status).toBe(204);
        expect(ran).toEqual([
            {
                action: 'archive',
                id,
            },
        ]);
    });

    it("answers 403 to an editor the action's auth turns away, and never runs it", async () => {
        const id = await createNewsletter('weekly');
        const response = await asEditor(request(app).post(`/editing/collections/newsletters/items/${id}/actions/send`));
        expect(response.status).toBe(403);
        expect(response.body.detail).toBe("The action 'send' takes the role 'admin'.");
        expect(ran).toEqual([]);
    });

    it('answers 409 when `when` turns the item down, or when nothing is published', async () => {
        const monthly = await createNewsletter('monthly');
        const refused = await asAdmin(request(app).post(`/editing/collections/newsletters/items/${monthly}/actions/send`));
        expect(refused.status).toBe(409);
        expect(refused.body.detail).toBe("'Send' does not apply to this item as it stands.");

        const draft = await createNewsletter('weekly', false);
        const unpublished = await asAdmin(request(app).post(`/editing/collections/newsletters/items/${draft}/actions/send`));
        expect(unpublished.status).toBe(409);
        expect(ran).toEqual([]);
    });

    it('answers 404 for an item that does not exist', async () => {
        const response = await asAdmin(request(app).post('/editing/collections/newsletters/items/missing/actions/archive'));
        expect(response.status).toBe(404);
    });

    it("describes an item's buttons: the ones the caller may run, and whether each applies", async () => {
        const weekly = await createNewsletter('weekly');
        const asAdminDescribed = await asAdmin(request(app).get('/editing/describe')).query({
            ref: `item:newsletters:${weekly}`,
        });
        expect(asAdminDescribed.body.actions).toEqual([
            {
                name: 'send',
                label: 'Send',
                confirm: 'Send to everyone on the weekly list?',
                available: true,
            },
            {
                name: 'archive',
                label: 'Archive',
                available: true,
            },
        ]);

        const monthly = await createNewsletter('monthly');
        const asEditorDescribed = await asEditor(request(app).get('/editing/describe')).query({
            ref: `item:newsletters:${monthly}`,
        });
        expect(asEditorDescribed.body.actions).toEqual([
            {
                name: 'archive',
                label: 'Archive',
                available: true,
            },
        ]);

        const draft = await createNewsletter('weekly', false);
        const draftDescribed = await asAdmin(request(app).get('/editing/describe')).query({
            ref: `item:newsletters:${draft}`,
        });
        expect(draftDescribed.body.actions.map((action: { available: boolean }) => action.available)).toEqual([false, false]);
    });
});

describe('checking actions', () => {
    it('refuses an action with no handler, or a name that is no identifier', () => {
        expect(() =>
            defineCollection({
                name: 'newsletters',
                id: NewsletterId,
                fields: [
                    {
                        name: 'subject',
                        schema: z.string(),
                    },
                ],
                actions: {
                    send: {
                        label: 'Send',
                    } as never,
                },
            })
        ).toThrow("defineCollection('newsletters') gives the action 'send' no handler.");
        expect(() =>
            defineCollection({
                name: 'newsletters',
                id: NewsletterId,
                fields: [
                    {
                        name: 'subject',
                        schema: z.string(),
                    },
                ],
                actions: {
                    'send-now': async () => {},
                },
            })
        ).toThrow("defineCollection('newsletters') has an action named 'send-now'.");
    });

    it('refuses a role the editor identity does not declare when the config assembles', () => {
        const Drafts = defineCollection({
            name: 'drafts',
            id: Kizuna.brand('DraftId', z.string()),
            fields: [
                {
                    name: 'subject',
                    schema: z.string(),
                },
            ],
            actions: {
                send: {
                    auth: {
                        roles: 'publisher',
                    },
                    handler: async () => {},
                },
            },
        });
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
                    pages: {},
                    collections: [Drafts],
                    auth: {
                        identity: 'editor',
                    },
                }),
            })
        ).toThrow("Collection 'drafts' action 'send' accepts the role 'publisher', which cms()'s identity 'editor' does not declare.");
    });
});
