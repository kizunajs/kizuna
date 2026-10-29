import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
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
import type { CmsExports } from './setup.js';
import { cms } from './provider.js';
import { DocumentStore } from './storage/store.js';
import { DraftNotices, DRAFT_CHANNEL, type DraftNotice } from './draft-notices.js';
import { PREVIEW_COOKIE, previewSecret, signPreviewToken } from './preview-token.js';

const k = new Kizuna();
const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
        roles: Kizuna.roles(['editor']),
    })
    .guard(({ bearer, deny }) => {
        if (bearer?.token === 'editor-token') {
            return {
                userId: 'ada',
                role: 'editor',
            };
        }
        return deny({
            status: 401,
            body: {
                detail: 'Unauthorized',
            },
        });
    });

const FrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
        {
            name: 'featured',
            schema: z.array(z.string()).optional(),
        },
    ],
});

const Employees = defineCollection({
    name: 'employees',
    id: Kizuna.brand('EmployeeId', z.string()),
    preview: {
        url: ({ item }) => `/preview/employees/${item.id}`,
    },
    fields: [
        {
            name: 'name',
            schema: z.string().min(1),
        },
        {
            name: 'photo',
            schema: z.string(),
        },
    ],
});

const pglite = new PGlite();
const db = drizzle(pglite);
let app: express.Express;
let server: Server;
let base: string;
let content: CmsExports;

beforeAll(async () => {
    await new DocumentStore(db).createTables();
    const config = defineConfig({
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
            auth: {
                identity: 'editor',
            },
        }),
    });
    app = express();
    config.api.mount(app);
    content = pluginExportsOf(config.api)['cms'] as CmsExports;
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
    await pglite.exec('delete from cms_refs; delete from cms_versions; delete from cms_documents;');
});

afterAll(async () => {
    server.close();
    await pglite.close();
});

const saveHeading = (heading: string) =>
    request(app).patch('/editing/pages/frontPage/draft').set('authorization', 'Bearer editor-token').send({
        changes: {
            heading,
        },
    });

/**
 * Reads an event stream one block at a time.
 */
const blocksOf = (body: ReadableStream<Uint8Array>) => {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    return async (): Promise<string> => {
        while (!buffered.includes('\n\n')) {
            const { value, done } = await reader.read();
            if (done) throw new Error(`The stream ended: ${buffered}`);
            buffered += decoder.decode(value);
        }
        const [block, ...rest] = buffered.split('\n\n');
        buffered = rest.join('\n\n');
        return block!;
    };
};

/**
 * The next `change` event's data, past any comments.
 */
const nextChange = async (next: () => Promise<string>): Promise<unknown> => {
    for (;;) {
        const block = await next();
        if (!block.startsWith('event: change')) continue;
        return JSON.parse(block.split('data: ')[1]!);
    }
};

const openEvents = async (query: string, cookie?: string) => {
    const controller = new AbortController();
    const response = await fetch(`${base}/editing/preview/events?${query}`, {
        headers:
            cookie === undefined
                ? {}
                : {
                      cookie,
                  },
        signal: controller.signal,
    });
    return {
        response,
        close: () => controller.abort(),
    };
};

describe('draft notices', () => {
    it('reach a subscriber through Postgres when a draft is saved', async () => {
        expect(content.service.notices.shared).toBe(true);
        const heard: DraftNotice[] = [];
        const unsubscribe = await content.service.notices.subscribe((notice) => heard.push(notice));
        expect((await saveHeading('Spring sale')).status).toBe(200);
        await expect
            .poll(() => heard)
            .toEqual([
                {
                    ref: 'page:frontPage',
                    paths: ['heading'],
                },
            ]);
        unsubscribe();
    });

    it('travel on the channel other server instances listen on', async () => {
        const payloads: string[] = [];
        const stop = await pglite.listen(DRAFT_CHANNEL, (payload) => payloads.push(payload));
        await saveHeading('Spring sale');
        await expect
            .poll(() => payloads.map((payload) => JSON.parse(payload) as DraftNotice))
            .toEqual([
                {
                    ref: 'page:frontPage',
                    paths: ['heading'],
                },
            ]);
        await stop();
    });

    it('stay in the process when the driver cannot listen', async () => {
        const notices = new DraftNotices(db, {});
        expect(notices.shared).toBe(false);
        const heard: DraftNotice[] = [];
        const unsubscribe = await notices.subscribe((notice) => heard.push(notice));
        await notices.publish({
            ref: 'global:site',
            paths: null,
        });
        expect(heard).toEqual([
            {
                ref: 'global:site',
                paths: null,
            },
        ]);
        unsubscribe();
        await notices.publish({
            ref: 'global:site',
            paths: null,
        });
        expect(heard).toHaveLength(1);
    });

    it('listen on a connection of its own from a node-postgres pool', async () => {
        const handlers = new Map<string, (value: unknown) => void>();
        const queries: string[] = [];
        let released = false;
        const connection = {
            query: async (text: string) => {
                queries.push(text);
            },
            on: (event: string, handler: (value: unknown) => void) => {
                handlers.set(event, handler);
            },
            removeListener: (event: string) => {
                handlers.delete(event);
            },
            release: () => {
                released = true;
            },
        };
        const pool = {
            totalCount: 0,
            connect: async () => connection,
            query: async () => undefined,
            on: () => undefined,
        };
        const notices = new DraftNotices(db, pool);
        const heard: DraftNotice[] = [];
        const unsubscribe = await notices.subscribe((notice) => heard.push(notice));
        expect(queries).toEqual([`LISTEN ${DRAFT_CHANNEL}`]);
        handlers.get('notification')?.({
            channel: DRAFT_CHANNEL,
            payload: JSON.stringify({
                ref: 'item:articles:k3j9x2',
                paths: ['title'],
            }),
        });
        expect(heard).toEqual([
            {
                ref: 'item:articles:k3j9x2',
                paths: ['title'],
            },
        ]);
        unsubscribe();
        await expect.poll(() => released).toBe(true);
        expect(queries).toEqual([`LISTEN ${DRAFT_CHANNEL}`, `UNLISTEN ${DRAFT_CHANNEL}`]);
        expect(handlers.size).toBe(0);
    });
});

describe('the draft events route', () => {
    it('refuses a caller without a preview that verifies', async () => {
        expect((await request(app).get('/editing/preview/events')).status).toBe(401);
        const expired = signPreviewToken(previewSecret(undefined), 600, Date.now() - 601_000);
        expect((await request(app).get('/editing/preview/events').set('cookie', `${PREVIEW_COOKIE}=${expired}`)).status).toBe(401);
        expect((await request(app).get('/editing/preview/events').set('cookie', `${PREVIEW_COOKIE}=forged.token`)).status).toBe(401);
    });

    it('streams the new text of a change to a page holding the preview cookie', async () => {
        const events = await openEvents('refs=page:frontPage', `${PREVIEW_COOKIE}=${signPreviewToken(previewSecret(undefined))}`);
        expect(events.response.status).toBe(200);
        expect(events.response.headers.get('content-type')).toContain('text/event-stream');
        const next = blocksOf(events.response.body!);
        expect(await next()).toBe(': listening');
        await saveHeading('Spring sale');
        expect(await nextChange(next)).toEqual({
            ref: 'page:frontPage',
            texts: {
                heading: 'Spring sale',
            },
        });
        events.close();
    });

    it('logs a draft it cannot read, and asks for a render', async () => {
        const failure = new Error('bind message supplies 5 parameters, but prepared statement "" requires 0');
        const draft = vi.spyOn(content.service, 'draft').mockRejectedValueOnce(failure);
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const events = await openEvents('refs=page:frontPage', `${PREVIEW_COOKIE}=${signPreviewToken(previewSecret(undefined))}`);
        const next = blocksOf(events.response.body!);
        await next();
        await saveHeading('Spring sale');
        expect(await nextChange(next)).toEqual({
            ref: 'page:frontPage',
            texts: null,
        });
        expect(logged).toHaveBeenCalledWith('[kizuna-cms] The draft preview could not read page:frontPage:', failure);
        events.close();
        draft.mockRestore();
        logged.mockRestore();
    });

    it('asks for a render when the change is not text, for the page at the address', async () => {
        await saveHeading('Spring sale');
        const events = await openEvents('path=/', `${PREVIEW_COOKIE}=${signPreviewToken(previewSecret(undefined))}`);
        const next = blocksOf(events.response.body!);
        await next();
        await request(app)
            .patch('/editing/pages/frontPage/draft')
            .set('authorization', 'Bearer editor-token')
            .send({
                changes: {
                    featured: ['tulips'],
                },
            });
        expect(await nextChange(next)).toEqual({
            ref: 'page:frontPage',
            texts: null,
        });
        events.close();
    });

    it("follows the item a collection's preview page shows, before the page marks it", async () => {
        const created = await request(app)
            .post('/editing/collections/employees/items')
            .set('authorization', 'Bearer editor-token')
            .send({
                values: {
                    name: 'Ada Lovelace',
                },
            });
        const id = created.body.name as string;
        const events = await openEvents(`path=/preview/employees/${id}`, `${PREVIEW_COOKIE}=${signPreviewToken(previewSecret(undefined))}`);
        const next = blocksOf(events.response.body!);
        await next();
        await request(app)
            .patch(`/editing/collections/employees/items/${id}/draft`)
            .set('authorization', 'Bearer editor-token')
            .send({
                changes: {
                    photo: 'ada.jpg',
                },
            });
        expect(await nextChange(next)).toEqual({
            ref: `item:employees:${id}`,
            texts: {
                photo: 'ada.jpg',
            },
        });
        events.close();
    });

    it('opens for a signed-in editor without the cookie', async () => {
        const controller = new AbortController();
        const response = await fetch(`${base}/editing/preview/events`, {
            headers: {
                authorization: 'Bearer editor-token',
            },
            signal: controller.signal,
        });
        expect(response.status).toBe(200);
        controller.abort();
    });
});
