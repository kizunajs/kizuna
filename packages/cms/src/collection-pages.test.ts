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
import type { CmsExports } from './plugin.js';
import { cms } from './provider.js';
import { definePages } from './options.js';
import { memoryMediaStorage } from './media/storage.js';
import { DocumentStore } from './storage/store.js';

const k = new Kizuna();
const roles = Kizuna.roles(['editor']);
const ArticleId = Kizuna.brand('ArticleId', z.string());

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
            schema: z.string().min(1).max(80),
        },
        {
            name: 'slug',
            schema: z.string().regex(/^[a-z0-9-]+$/),
        },
        {
            name: 'topic',
            schema: z.enum(['News', 'Guides']),
        },
    ],
    indexes: ['topic'],
});

const ArticlePage = definePage({
    name: 'articlePage',
    collection: Articles,
});

const FrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'featured',
            schema: z.array(ArticleId).max(3),
        },
    ],
});

const pages = definePages({
    frontPage: {
        path: '/',
        page: FrontPage,
    },
    articlePage: {
        path: '/blog/[slug]',
        page: ArticlePage,
    },
});

const revalidated: string[][] = [];
const pglite = new PGlite();
const db = drizzle(pglite);
const content = cms({
    db,
    pages,
    collections: [Articles],
    auth: {
        identity: 'editor',
    },
    media: {
        storage: memoryMediaStorage(),
    },
    revalidate: (tags) => {
        revalidated.push([...tags]);
    },
    appDir: 'src/__fixtures__/app',
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
const { service } = pluginExportsOf(config.api)['cms'] as CmsExports;

const asEditor = (call: request.Test) => call.set('authorization', 'Bearer editor-token');

const createArticle = async (title: string, slug: string, topic: string, publish = true): Promise<string> => {
    const created = await asEditor(request(app).post('/editing/collections/articles/items')).send({
        values: {
            title,
            slug,
            topic,
        },
    });
    expect(created.status).toBe(201);
    const id = created.body.name as string;
    if (publish) expect((await asEditor(request(app).post(`/editing/collections/articles/items/${id}/publish`)).send({})).status).toBe(200);
    return id;
};

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec('delete from cms_refs; delete from cms_versions; delete from cms_documents;');
    revalidated.length = 0;
});

afterAll(async () => {
    await pglite.close();
});

describe('pages that show a collection', () => {
    it('gives each item the address of the page that shows it', async () => {
        const created = await asEditor(request(app).post('/editing/collections/articles/items')).send({
            values: {
                title: 'Hello',
                slug: 'hello',
                topic: 'News',
            },
        });
        expect(created.body).toMatchObject({
            ref: `item:articles:${created.body.name}`,
            path: '/blog/hello',
            status: 'draft',
        });
        const listed = await asEditor(request(app).get('/editing/collections/articles/items'));
        expect(listed.body.items).toMatchObject([
            {
                label: 'Hello',
                path: '/blog/hello',
            },
        ]);
    });

    it('refuses a second item at the same address, in a draft or the published copy', async () => {
        await createArticle('Hello', 'hello', 'News');
        const clash = await asEditor(request(app).post('/editing/collections/articles/items')).send({
            values: {
                title: 'Hello again',
                slug: 'hello',
                topic: 'News',
            },
        });
        expect(clash.status).toBe(409);
        expect(clash.body.detail).toContain('/blog/hello');
        const other = await createArticle('Other', 'other', 'News', false);
        const renamed = await asEditor(request(app).patch(`/editing/collections/articles/items/${other}/draft`)).send({
            changes: {
                slug: 'hello',
            },
        });
        expect(renamed.status).toBe(409);
    });

    it('describes the item at a URL, by its draft address and then its published one', async () => {
        const id = await createArticle('Hello', 'hello', 'News');
        await asEditor(request(app).patch(`/editing/collections/articles/items/${id}/draft`)).send({
            changes: {
                slug: 'hello-world',
            },
        });
        const byDraft = await asEditor(request(app).get('/editing/describe').query({ url: 'https://example.com/blog/hello-world' }));
        expect(byDraft.body).toMatchObject({
            ref: `item:articles:${id}`,
            kind: 'item',
            path: '/blog/hello-world',
            status: 'changed',
        });
        const byPublished = await asEditor(request(app).get('/editing/describe').query({ url: '/blog/hello' }));
        expect(byPublished.body.ref).toBe(`item:articles:${id}`);
        expect((await asEditor(request(app).get('/editing/describe').query({ url: '/blog/missing' }))).status).toBe(404);
    });

    it('marks the address field for editors and the agent', async () => {
        const id = await createArticle('Hello', 'hello', 'News');
        const described = await asEditor(
            request(app)
                .get('/editing/describe')
                .query({ ref: `item:articles:${id}` })
        );
        const slug = (described.body.fields as Array<{ path: string; description?: string }>).find((field) => field.path === 'slug');
        expect(slug?.description).toContain('Part of the address, /blog/[slug]');
    });

    it('filters the public list by the field the address reads, which is indexed', async () => {
        const hello = await createArticle('Hello', 'hello', 'News');
        await createArticle('How to', 'how-to', 'Guides');
        const bySlug = await request(app).get('/content/collections/articles').query({ slug: 'hello' });
        expect(bySlug.body.items).toMatchObject([
            {
                id: hello,
                title: 'Hello',
            },
        ]);
        expect((await request(app).get('/content/collections/articles').query({ title: 'Hello' })).status).toBe(400);
        expect((await request(app).get('/content/pages/articlePage')).status).toBe(404);
    });

    it('lists shown items among the pages at their addresses', async () => {
        const id = await createArticle('Hello', 'hello', 'News');
        const listed = await asEditor(request(app).get('/editing/pages'));
        expect(listed.body.pages).toContainEqual(
            expect.objectContaining({
                name: 'articlePage',
                ref: `item:articles:${id}`,
                path: '/blog/hello',
                status: 'published',
            })
        );
    });

    it('edits items, never the page that shows them', async () => {
        expect((await asEditor(request(app).get('/editing/pages/articlePage/draft'))).status).toBe(400);
    });

    it('says which pages feature an item and refreshes them when it publishes', async () => {
        const id = await createArticle('Hello', 'hello', 'News');
        await asEditor(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                featured: [id],
            },
        });
        const described = await asEditor(
            request(app)
                .get('/editing/describe')
                .query({ ref: `item:articles:${id}` })
        );
        expect(described.body.usedOn.pages).toEqual([
            {
                name: 'frontPage',
                path: '/',
            },
        ]);
        revalidated.length = 0;
        await asEditor(request(app).post(`/editing/collections/articles/items/${id}/publish`)).send({});
        expect(revalidated).toEqual([[`kizuna-cms:item:articles:${id}`, 'kizuna-cms:collection:articles', 'kizuna-cms:page:frontPage']]);
    });

    it('indexes the field the address reads beside the declared indexes', () => {
        expect(service.indexedFields()).toEqual([
            {
                kind: 'item',
                keyPrefix: 'articles/',
                field: 'slug',
                type: 'text',
            },
            {
                kind: 'item',
                keyPrefix: 'articles/',
                field: 'topic',
                type: 'text',
            },
        ]);
    });
});

describe('page checks', () => {
    const assemble = (path: string, definition: typeof ArticlePage | typeof FrontPage, collections = [Articles]) =>
        defineConfig({
            auth: {
                identities: {
                    editor,
                },
            },
            content: cms({
                db,
                pages: {
                    [definition.name]: {
                        path,
                        page: definition,
                    },
                },
                collections,
                auth: {
                    identity: 'editor',
                },
                appDir: 'src/__fixtures__/app',
            }),
        });

    it('refuses a route param that names no field of the collection', () => {
        expect(() => assemble('/blog/[handle]', ArticlePage)).toThrow("the articles collection has no field named 'handle'");
    });

    it('refuses a dynamic route without a collection, and a collection on a static route', () => {
        expect(() => assemble('/[slug]', FrontPage)).toThrow('Give it the collection');
        expect(() => assemble('/blog', ArticlePage)).toThrow('is a static route');
    });

    it('refuses a collection the plugin is not given', () => {
        expect(() => assemble('/blog/[slug]', ArticlePage, [])).toThrow('which cms() is not given');
    });
});
