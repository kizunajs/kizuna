import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { pluginExportsOf } from 'kizunajs/adapter';
import { expressAdapter } from '@kizunajs/express';
import { defineCollection } from './definitions.js';
import { definePage } from './page.js';
import { definePages } from './options.js';
import { cms } from './provider.js';
import { ImageSchema } from './image.js';
import { memoryMediaStorage } from './media/storage.js';
import { DocumentStore } from './storage/store.js';
import type { CmsExports } from './setup.js';
import { eraseExpired, TRASH_DAYS } from './trash.js';

const k = new Kizuna();
const TagId = Kizuna.brand('TagId', z.string());
const ArticleId = Kizuna.brand('ArticleId', z.string());

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

const Tags = defineCollection({
    name: 'tags',
    id: TagId,
    tree: 'parent',
    fields: [
        {
            name: 'name',
            schema: z.string().max(40),
        },
        {
            name: 'parent',
            schema: TagId.optional(),
        },
    ],
    indexes: ['parent'],
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
            name: 'slug',
            schema: z.string().regex(/^[a-z0-9-]+$/),
        },
        {
            name: 'image',
            schema: ImageSchema.optional(),
        },
    ],
});

const pages = definePages({
    articlePage: {
        path: '/blog/[slug]',
        page: definePage({
            name: 'articlePage',
            collection: Articles,
        }),
    },
});

const pglite = new PGlite();
const db = drizzle(pglite);
const storage = memoryMediaStorage();

const config = defineConfig({
    jobRunner: {
        mode: 'in-process',
    },
    adapter: expressAdapter(),
    auth: {
        identities: {
            editor,
        },
    },
    content: cms({
        db,
        pages,
        collections: [Tags, Articles],
        auth: {
            identity: 'editor',
            author: (context) => String(context['userId']),
        },
        media: {
            storage,
        },
        appDir: 'src/__fixtures__/app',
    }),
});

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

const publish = async (collection: string, id: string): Promise<void> => {
    expect((await asEditor(request(app).post(`/editing/collections/${collection}/items/${id}/publish`)).send({})).status).toBe(200);
};

const remove = async (collection: string, id: string): Promise<void> => {
    expect((await asEditor(request(app).delete(`/editing/collections/${collection}/items/${id}`))).status).toBe(204);
};

const restore = (collection: string, id: string) => asEditor(request(app).post(`/editing/trash/${collection}/${id}/restore`));

const trash = async () => {
    const answer = await asEditor(request(app).get('/editing/trash'));
    expect(answer.status).toBe(200);
    return answer.body as {
        days: number;
        items: Array<{ id: string; label: string; under: number; published: boolean; deletedBy: { id: string } }>;
    };
};

const png = async (): Promise<Uint8Array> =>
    new Uint8Array(
        await sharp({
            create: {
                width: 8,
                height: 8,
                channels: 3,
                background: {
                    r: 40,
                    g: 40,
                    b: 40,
                },
            },
        })
            .png()
            .toBuffer()
    );

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec('delete from cms_refs; delete from cms_versions; delete from cms_documents;');
});

afterAll(async () => {
    await pglite.close();
});

describe('deleting an item', () => {
    it('moves it to the trash, where no read finds it and its address says so', async () => {
        const id = await create('articles', {
            title: 'Spring sale',
            slug: 'spring-sale',
        });
        await publish('articles', id);
        await remove('articles', id);

        expect((await request(app).get('/content/collections/articles')).body.items).toEqual([]);
        expect((await asEditor(request(app).get('/editing/collections/articles/items'))).body.items).toEqual([]);
        const described = await asEditor(
            request(app)
                .get('/editing/describe')
                .query({
                    ref: `item:articles:${id}`,
                })
        );
        expect(described.status).toBe(404);
        expect(described.body.trashed).toMatchObject({
            by: 'ada',
        });
        expect((await asEditor(request(app).get(`/editing/collections/articles/items/${id}/draft`))).status).toBe(404);
        const written = await asEditor(request(app).patch(`/editing/collections/articles/items/${id}/draft`)).send({
            changes: {
                title: 'Summer sale',
            },
        });
        expect(written.status).toBe(404);

        const listed = await trash();
        expect(listed.days).toBe(TRASH_DAYS);
        expect(listed.items).toEqual([
            expect.objectContaining({
                id,
                label: 'Spring sale',
                under: 0,
                published: true,
                deletedBy: expect.objectContaining({
                    id: 'ada',
                }),
            }),
        ]);
    });

    it('restores a published item as published, and a draft as a draft', async () => {
        const live = await create('articles', {
            title: 'Spring sale',
            slug: 'spring-sale',
        });
        await publish('articles', live);
        const draft = await create('articles', {
            title: 'Autumn sale',
            slug: 'autumn-sale',
        });
        await remove('articles', live);
        await remove('articles', draft);

        expect((await restore('articles', live)).status).toBe(204);
        expect((await restore('articles', draft)).status).toBe(204);

        expect((await request(app).get('/content/collections/articles')).body.items.map((item: { id: string }) => item.id)).toEqual([live]);
        const restored = await asEditor(request(app).get(`/editing/collections/articles/items/${draft}/draft`));
        expect(restored.body).toMatchObject({
            status: 'draft',
            content: {
                title: 'Autumn sale',
            },
        });
        expect((await trash()).items).toEqual([]);
    });

    it('refuses a restore while another item has its address', async () => {
        const first = await create('articles', {
            title: 'Spring sale',
            slug: 'spring-sale',
        });
        await remove('articles', first);
        await create('articles', {
            title: 'Spring sale again',
            slug: 'spring-sale',
        });
        expect((await restore('articles', first)).status).toBe(409);
    });

    it('deletes it for good', async () => {
        const id = await create('articles', {
            title: 'Spring sale',
            slug: 'spring-sale',
        });
        await remove('articles', id);
        expect((await asEditor(request(app).delete(`/editing/trash/articles/${id}`))).status).toBe(204);
        expect((await pglite.query('select id from cms_documents')).rows).toEqual([]);
        expect((await pglite.query('select document_id from cms_versions')).rows).toEqual([]);
        expect((await restore('articles', id)).status).toBe(404);
    });

    it('empties the trash', async () => {
        await remove(
            'articles',
            await create('articles', {
                title: 'Spring sale',
                slug: 'spring-sale',
            })
        );
        await remove(
            'tags',
            await create('tags', {
                name: 'Lighting',
            })
        );
        expect((await asEditor(request(app).delete('/editing/trash'))).status).toBe(204);
        expect((await trash()).items).toEqual([]);
        expect((await pglite.query('select id from cms_documents')).rows).toEqual([]);
    });

    it('deletes for good what has waited out the window, and keeps the rest', async () => {
        const id = await create('articles', {
            title: 'Spring sale',
            slug: 'spring-sale',
        });
        await remove('articles', id);
        expect(await eraseExpired(service, new Date(Date.now() + (TRASH_DAYS - 1) * 24 * 60 * 60 * 1000))).toEqual({
            erased: 0,
        });
        expect(await eraseExpired(service, new Date(Date.now() + (TRASH_DAYS + 1) * 24 * 60 * 60 * 1000))).toEqual({
            erased: 1,
        });
        expect((await pglite.query('select id from cms_documents')).rows).toEqual([]);
    });
});

describe('deleting in a tree', () => {
    it('takes the branch to the trash as one delete, and brings it back with the parent', async () => {
        const lighting = await create('tags', {
            name: 'Lighting',
        });
        const workshop = await create('tags', {
            name: 'Workshop',
            parent: lighting,
        });
        await remove('tags', lighting);

        expect((await asEditor(request(app).get('/editing/collections/tags/items'))).body.items).toEqual([]);
        expect((await trash()).items).toEqual([
            expect.objectContaining({
                id: lighting,
                under: 1,
            }),
        ]);
        expect((await restore('tags', workshop)).status).toBe(409);

        expect((await restore('tags', lighting)).status).toBe(204);
        expect(
            (await asEditor(request(app).get('/editing/collections/tags/items'))).body.items.map((item: { id: string }) => item.id).sort()
        ).toEqual([lighting, workshop].sort());
    });

    it('refuses to restore an item while the one above it is in the trash', async () => {
        const lighting = await create('tags', {
            name: 'Lighting',
        });
        const workshop = await create('tags', {
            name: 'Workshop',
            parent: lighting,
        });
        await remove('tags', workshop);
        await remove('tags', lighting);
        expect((await restore('tags', workshop)).status).toBe(409);
        expect((await restore('tags', lighting)).status).toBe(204);
        expect((await restore('tags', workshop)).status).toBe(204);
    });
});

describe('images held in the trash', () => {
    it('counts an image held only in the trash as unused, and restoring its holder brings it back', async () => {
        const image = await service.media.storeBytes(await png(), 'sale.png', 'ada');
        const id = await create('articles', {
            title: 'Spring sale',
            slug: 'spring-sale',
            image: {
                id: image.id,
                alt: 'A sale sign',
            },
        });
        await remove('articles', id);
        expect((await asEditor(request(app).get(`/editing/media/${image.id}/uses`))).body.uses).toEqual([]);

        expect((await asEditor(request(app).delete(`/editing/media/${image.id}`))).status).toBe(204);
        expect((await asEditor(request(app).get('/editing/media'))).body.media).toEqual([]);
        expect(await storage.get(image.key)).toBeDefined();

        expect((await restore('articles', id)).status).toBe(204);
        expect((await asEditor(request(app).get('/editing/media'))).body.media.map((record: { id: string }) => record.id)).toEqual([
            image.id,
        ]);
    });

    it('deletes the image with the last document in the trash that held it', async () => {
        const image = await service.media.storeBytes(await png(), 'sale.png', 'ada');
        const id = await create('articles', {
            title: 'Spring sale',
            slug: 'spring-sale',
            image: {
                id: image.id,
                alt: 'A sale sign',
            },
        });
        await remove('articles', id);
        expect((await asEditor(request(app).delete(`/editing/media/${image.id}`))).status).toBe(204);
        expect((await asEditor(request(app).delete(`/editing/trash/articles/${id}`))).status).toBe(204);
        expect((await pglite.query('select id from cms_documents')).rows).toEqual([]);
        expect(await storage.get(image.key)).toBeUndefined();
    });
});
