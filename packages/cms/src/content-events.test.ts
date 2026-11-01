import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { defineJobTransport, pluginExportsOf, type JobMessage } from 'kizunajs/adapter';
import { expressAdapter } from '@kizunajs/express';
import { defineCollection } from './definitions.js';
import { cms } from './provider.js';
import { DocumentStore } from './storage/store.js';
import type { CmsExports } from './setup.js';
import { ContentEventSchema, type ContentEvent } from './content-events.js';
import { eraseExpired, TRASH_DAYS } from './trash.js';
import { runDue } from './schedules.js';
import { withAgent } from './agents.js';
import type { ContentEventName, ContentTrigger } from './options.js';

const k = new Kizuna();
const ArticleId = Kizuna.brand('ArticleId', z.string());
const ProductId = Kizuna.brand('ProductId', z.string());

const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
    })
    .guard(({ bearer, deny }) => {
        if (bearer?.token === 'editor-token') {
            return {
                userId: 'ada',
            };
        }
        return deny({
            status: 401,
            body: {
                detail: 'Unauthorized',
            },
        });
    });

const Articles = defineCollection({
    name: 'articles',
    id: ArticleId,
    fields: [
        {
            name: 'title',
            schema: z.string().max(80),
        },
        {
            name: 'summary',
            schema: z.string().max(280).optional(),
        },
    ],
});

const Products = defineCollection({
    name: 'products',
    id: ProductId,
    fields: [
        {
            name: 'name',
            schema: z.string().max(80),
        },
        {
            name: 'price',
            schema: z.number(),
        },
    ],
});

const contentJob = () =>
    k
        .job({
            input: ContentEventSchema,
        })
        .handler(() => undefined);

const jobs = k.jobs({
    announceArticle: contentJob(),
    syncPrice: contentJob(),
    record: contentJob(),
});

/**
 * What the transport was handed, and whether it refuses the next message.
 */
const sent: JobMessage[] = [];
let refusing = false;

const transport = defineJobTransport({
    name: 'recorded',
    supports: {
        dedupe: true,
    },
    dispatch: (message) => {
        if (refusing) throw new Error('The queue is down.');
        sent.push(message);
    },
});

const recorded: ContentEventName[] = ['unpublished', 'trashed', 'restored', 'deleted', 'scheduled'];

const triggers: ContentTrigger[] = [
    {
        event: 'published',
        collection: 'articles',
        job: jobs.announceArticle,
    },
    {
        event: 'published',
        collection: 'products',
        job: jobs.syncPrice,
        when: (event) => event.changed.includes('price'),
    },
    ...recorded.map(
        (event): ContentTrigger => ({
            event,
            job: jobs.record,
        })
    ),
];

const pglite = new PGlite();
const db = drizzle(pglite);

const configWith = (on: readonly ContentTrigger[]) =>
    defineConfig({
        jobs,
        jobRunner: {
            mode: 'in-process',
            transport,
        },
        adapter: expressAdapter(),
        auth: {
            identities: {
                editor,
            },
        },
        content: cms({
            db,
            collections: [Articles, Products],
            on,
            auth: {
                identity: 'editor',
                author: (context) => String(context['userId']),
            },
            revalidate: () => undefined,
        }),
    });

const config = configWith(triggers);
const app = express();
config.api.mount(app);
const service = (pluginExportsOf(config.api)['cms'] as CmsExports).service;

const asEditor = (call: request.Test) => call.set('authorization', 'Bearer editor-token');

const create = async (collection: string, values: Record<string, unknown>): Promise<string> => {
    const created = await asEditor(request(app).post(`/editing/collections/${collection}/items`)).send({
        values,
    });
    expect(created.status).toBe(201);
    return created.body.name as string;
};

const save = async (collection: string, id: string, changes: Record<string, unknown>): Promise<void> => {
    const saved = await asEditor(request(app).patch(`/editing/collections/${collection}/items/${id}/draft`)).send({
        changes,
    });
    expect(saved.status).toBe(200);
};

const publish = (collection: string, id: string) =>
    asEditor(request(app).post(`/editing/collections/${collection}/items/${id}/publish`)).send({});

const events = (job?: string): ContentEvent[] =>
    sent.filter((message) => job === undefined || message.job === job).map((message) => message.input as ContentEvent);

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec(
        'delete from cms_schedules; delete from cms_releases; delete from cms_refs; delete from cms_versions; delete from cms_documents;'
    );
    sent.length = 0;
    refusing = false;
});

afterAll(async () => {
    await pglite.close();
});

describe('a published event', () => {
    it('names the document, who published it, and every field of a first publish', async () => {
        const id = await create('articles', {
            title: 'Repotting a monstera',
            summary: 'When the roots show, it is time.',
        });
        expect((await publish('articles', id)).status).toBe(200);

        expect(sent).toEqual([
            expect.objectContaining({
                job: 'announceArticle',
            }),
        ]);
        const [event] = events();
        expect(ContentEventSchema.parse(event)).toEqual(event);
        expect(event).toEqual({
            event: 'published',
            ref: `item:articles:${id}`,
            type: 'item',
            name: 'articles',
            id,
            site: null,
            locale: null,
            by: 'ada',
            via: null,
            at: expect.any(String),
            changed: ['title', 'summary'],
            before: {},
            after: {
                title: 'Repotting a monstera',
                summary: 'When the roots show, it is time.',
            },
            release: null,
            schedule: null,
        });
    });

    it('names only the fields that changed since the last publish, with their values before and after', async () => {
        const id = await create('articles', {
            title: 'Repotting a monstera',
        });
        await publish('articles', id);
        await save('articles', id, {
            title: 'Repotting a monstera in spring',
        });
        await publish('articles', id);

        expect(events()[1]).toMatchObject({
            changed: ['title'],
            before: {
                title: 'Repotting a monstera',
            },
            after: {
                title: 'Repotting a monstera in spring',
            },
        });
    });

    it('credits the agent that published for the person', async () => {
        const id = await create('articles', {
            title: 'Repotting a monstera',
        });
        await withAgent('Claude', () => service.publish(service.listing('articles', 'default').refOf(id), 'ada'));

        expect(events()[0]).toMatchObject({
            by: 'ada',
            via: 'Claude',
        });
    });

    it('carries a dedupe key of its own per job and event', async () => {
        const id = await create('articles', {
            title: 'Repotting a monstera',
        });
        await publish('articles', id);

        const [message] = sent;
        expect(message!.dedupeKey).toBe(`announceArticle:item:articles:${id}:published@${events()[0]!.at}`);
    });
});

describe('a trigger', () => {
    it('queues its job only for the collection it names', async () => {
        const id = await create('products', {
            name: 'Fiddle leaf fig',
            price: 49,
        });
        await publish('products', id);

        expect(events('announceArticle')).toEqual([]);
        expect(events('syncPrice')).toHaveLength(1);
    });

    it('queues its job only when its `when` answers true', async () => {
        const id = await create('products', {
            name: 'Fiddle leaf fig',
            price: 49,
        });
        await publish('products', id);
        await save('products', id, {
            name: 'Fiddle-leaf fig',
        });
        await publish('products', id);
        await save('products', id, {
            price: 45,
        });
        await publish('products', id);

        expect(events('syncPrice').map((event) => event.after)).toEqual([
            {
                name: 'Fiddle leaf fig',
                price: 49,
            },
            {
                price: 45,
            },
        ]);
    });

    it('refuses a job the config does not declare', () => {
        const stray = k.jobs({
            stray: contentJob(),
        });
        expect(() =>
            configWith([
                {
                    event: 'published',
                    job: stray.stray,
                },
            ])
        ).toThrow(/names a job that `jobs` on defineConfig does not declare/);
    });

    it('refuses a collection the CMS does not have', () => {
        expect(() =>
            configWith([
                {
                    event: 'published',
                    collection: 'events',
                    job: jobs.record,
                },
            ])
        ).toThrow(/names the collection 'events', which cms\(\) does not have/);
    });
});

describe('a job that fails', () => {
    it('never stops the publish', async () => {
        const id = await create('articles', {
            title: 'Repotting a monstera',
        });
        refusing = true;
        const published = await publish('articles', id);

        expect(published.status).toBe(200);
        expect(published.body.status).toBe('published');
        expect(sent).toEqual([]);
    });

    it('never stops the publish when its `when` throws', async () => {
        const throwing = configWith([
            {
                event: 'published',
                job: jobs.record,
                when: () => {
                    throw new Error('No price.');
                },
            },
        ]);
        const throwingApp = express();
        throwing.api.mount(throwingApp);
        const id = await create('articles', {
            title: 'Repotting a monstera',
        });
        const published = await asEditor(request(throwingApp).post(`/editing/collections/articles/items/${id}/publish`)).send({});

        expect(published.status).toBe(200);
        expect(sent).toEqual([]);
    });
});

describe('the other events', () => {
    it('fire on unpublish, trash, restore and delete forever, credited to the editor', async () => {
        const id = await create('articles', {
            title: 'Repotting a monstera',
        });
        await publish('articles', id);
        expect((await asEditor(request(app).post(`/editing/collections/articles/items/${id}/unpublish`)).send({})).status).toBe(200);
        expect((await asEditor(request(app).delete(`/editing/collections/articles/items/${id}`))).status).toBe(204);
        expect((await asEditor(request(app).post(`/editing/trash/articles/${id}/restore`))).status).toBe(204);
        expect((await asEditor(request(app).delete(`/editing/collections/articles/items/${id}`))).status).toBe(204);
        expect((await asEditor(request(app).delete(`/editing/trash/articles/${id}`))).status).toBe(204);

        expect(events('record').map((event) => [event.event, event.ref, event.by, event.changed])).toEqual([
            ['unpublished', `item:articles:${id}`, 'ada', []],
            ['trashed', `item:articles:${id}`, 'ada', []],
            ['restored', `item:articles:${id}`, 'ada', []],
            ['trashed', `item:articles:${id}`, 'ada', []],
            ['deleted', `item:articles:${id}`, 'ada', []],
        ]);
    });

    it('credits a delete to no one when the daily job empties the trash', async () => {
        const id = await create('articles', {
            title: 'Repotting a monstera',
        });
        await asEditor(request(app).delete(`/editing/collections/articles/items/${id}`));
        await eraseExpired(service, new Date(Date.now() + (TRASH_DAYS + 1) * 24 * 60 * 60 * 1000));

        expect(events('record').at(-1)).toMatchObject({
            event: 'deleted',
            ref: `item:articles:${id}`,
            by: null,
            via: null,
        });
    });

    it('fire scheduled when a publish is set, and published when it runs', async () => {
        const id = await create('articles', {
            title: 'Repotting a monstera',
        });
        const at = new Date(Date.now() + 60 * 60 * 1000);
        const scheduled = await asEditor(request(app).put(`/editing/collections/articles/items/${id}/schedule`)).send({
            action: 'publish',
            at: at.toISOString(),
        });
        expect(scheduled.status).toBe(200);
        expect(events('record')).toEqual([
            expect.objectContaining({
                event: 'scheduled',
                ref: `item:articles:${id}`,
                by: 'ada',
                schedule: {
                    action: 'publish',
                    at: at.toISOString(),
                },
            }),
        ]);

        await runDue(service, new Date(at.getTime() + 1000));
        expect(events('announceArticle')).toEqual([
            expect.objectContaining({
                event: 'published',
                by: 'ada',
            }),
        ]);
    });

    it('fire published once per document a release publishes, naming the release', async () => {
        const first = await create('articles', {
            title: 'Repotting a monstera',
        });
        const second = await create('articles', {
            title: 'Pruning a fig',
        });
        const created = await asEditor(request(app).post('/editing/releases')).send({
            name: 'Spring journal',
            refs: [`item:articles:${first}`, `item:articles:${second}`],
        });
        expect(created.status).toBe(201);
        const published = await asEditor(request(app).post(`/editing/releases/${created.body.id}/publish`)).send({});
        expect(published.status).toBe(200);

        expect(events('announceArticle').map((event) => [event.ref, event.release])).toEqual([
            [
                `item:articles:${first}`,
                {
                    id: created.body.id,
                    name: 'Spring journal',
                },
            ],
            [
                `item:articles:${second}`,
                {
                    id: created.body.id,
                    name: 'Spring journal',
                },
            ],
        ]);
    });
});
