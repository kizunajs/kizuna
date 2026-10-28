import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import type { ContentRuntime } from 'kizunajs/plugin';
import { pluginExportsOf } from 'kizunajs/adapter';
import { expressAdapter } from '@kizunajs/express';
import { defineCollection, defineGlobal } from './definitions.js';
import { definePage } from './page.js';
import { definePages } from './options.js';
import { cms } from './provider.js';
import { collectionPreviewPath } from './cms.js';
import type { CmsExports } from './setup.js';
import { DocumentStore } from './storage/store.js';

const draft = {
    enabled: false,
};

const runtime: ContentRuntime = {
    cache: (read) => read,
    revalidate: () => undefined,
    draftMode: async () => ({
        enabled: draft.enabled,
        enable: () => {
            draft.enabled = true;
        },
        disable: () => {
            draft.enabled = false;
        },
    }),
    cookies: async () => ({
        get: () => undefined,
        set: () => undefined,
        delete: () => undefined,
    }),
    notFound: async () => {
        throw new Error('not found');
    },
};

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

const EmployeeId = Kizuna.brand('EmployeeId', z.string());
const OfficeId = Kizuna.brand('OfficeId', z.string());
const ArticleId = Kizuna.brand('ArticleId', z.string());

const Employees = defineCollection({
    name: 'employees',
    id: EmployeeId,
    preview: {
        url: ({ item }) => `/preview/employees/${item.id}${item.department === undefined ? '' : `?department=${item.department}`}`,
    },
    fields: [
        {
            name: 'name',
            schema: z.string().min(1).max(60),
        },
        {
            name: 'department',
            schema: z.enum(['design', 'engineering']),
        },
    ],
});

const Offices = defineCollection({
    name: 'offices',
    id: OfficeId,
    fields: [
        {
            name: 'city',
            schema: z.string().min(1).max(60),
        },
    ],
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
    ],
});

const Site = defineGlobal({
    name: 'site',
    fields: [
        {
            name: 'footer',
            schema: z.string().max(80),
        },
    ],
});

const ContactPage = definePage({
    name: 'contactPage',
    fields: [
        {
            name: 'office',
            schema: OfficeId,
        },
    ],
});

const ArticlePage = definePage({
    name: 'articlePage',
    collection: Articles,
});

const pglite = new PGlite();
const db = drizzle(pglite);
const config = defineConfig({
    adapter: {
        ...expressAdapter(),
        content: runtime,
    },
    auth: {
        identities: {
            editor,
        },
    },
    content: cms({
        db,
        pages: definePages({
            contactPage: {
                path: '/contact',
                page: ContactPage,
            },
            articlePage: {
                path: '/blog/[slug]',
                page: ArticlePage,
            },
        }),
        globals: [Site],
        collections: [Employees, Offices, Articles],
        auth: {
            identity: 'editor',
        },
        preview: {
            url: 'https://site.example',
        },
    }),
});
const app = express();
config.api.mount(app);
const { service } = pluginExportsOf(config.api)['cms'] as CmsExports;

const asEditor = (call: request.Test) => call.set('authorization', 'Bearer editor-token');

const createItem = async (collection: string, values: Record<string, unknown>): Promise<string> => {
    const created = await asEditor(request(app).post(`/editing/collections/${collection}/items`)).send({
        values,
    });
    expect(created.status).toBe(201);
    return created.body.name as string;
};

const previewPathOf = async (ref: string): Promise<unknown> => {
    const described = await asEditor(request(app).get('/editing/describe').query({ ref }));
    expect(described.status).toBe(200);
    return described.body.previewPath;
};

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    draft.enabled = false;
    await pglite.exec('delete from cms_refs; delete from cms_versions; delete from cms_documents;');
});

afterAll(async () => {
    await pglite.close();
});

describe("a collection's preview", () => {
    it("opens an item on the page its collection's url names, from the draft as it stands", async () => {
        const id = await createItem('employees', {
            name: 'Ada Lovelace',
        });
        expect(await previewPathOf(`item:employees:${id}`)).toBe(`/preview/employees/${id}`);

        await asEditor(request(app).patch(`/editing/collections/employees/items/${id}/draft`)).send({
            changes: {
                department: 'engineering',
            },
        });
        expect(await previewPathOf(`item:employees:${id}`)).toBe(`/preview/employees/${id}?department=engineering`);
    });

    it('lands on that page in draft mode through the draft route', async () => {
        const id = await createItem('employees', {
            name: 'Ada Lovelace',
        });
        const previewPath = (await previewPathOf(`item:employees:${id}`)) as string;
        const minted = await asEditor(request(app).post('/editing/preview')).send({
            path: previewPath,
        });
        expect(minted.status).toBe(200);
        const link = new URL(minted.body.url);
        expect(link.origin).toBe('https://site.example');
        expect(link.pathname).toBe('/api/draft');

        const opened = await request(app).get('/draft').query(Object.fromEntries(link.searchParams));
        expect(opened.status).toBe(307);
        expect(opened.headers['location']).toBe(`/preview/employees/${id}`);
        expect(draft.enabled).toBe(true);
    });

    it('opens an item without one at its address, or on the first page that shows it', async () => {
        const article = await createItem('articles', {
            title: 'Spring sale',
            slug: 'spring-sale',
        });
        expect(await previewPathOf(`item:articles:${article}`)).toBe('/blog/spring-sale');

        const office = await createItem('offices', {
            city: 'Oslo',
        });
        expect(await previewPathOf(`item:offices:${office}`)).toBeNull();
        await asEditor(request(app).patch('/editing/pages/contactPage/draft')).send({
            changes: {
                office,
            },
        });
        expect(await previewPathOf(`item:offices:${office}`)).toBe('/contact');
    });

    it('opens a page at its path, and a global on the front page', async () => {
        expect(await previewPathOf('page:contactPage')).toBe('/contact');
        expect(await previewPathOf('global:site')).toBe('/');
    });

    it('says which collection named a url that is not a path on the site', () => {
        const Broken = defineCollection({
            name: 'employees',
            id: EmployeeId,
            preview: {
                url: ({ item }) => `https://example.com/team/${item.id}`,
            },
            fields: [
                {
                    name: 'name',
                    schema: z.string(),
                },
            ],
        });
        const target = {
            ...service.target({
                type: 'item',
                collection: 'employees',
                id: 'ada',
            }),
            definition: Broken,
        };
        expect(() => collectionPreviewPath(target, {})).toThrow(
            `defineCollection('employees') has a preview.url that returned "https://example.com/team/ada". It returns a path on the site, like '/team'.`
        );
    });

    it('needs a url function', () => {
        expect(() =>
            defineCollection({
                name: 'employees',
                id: EmployeeId,
                preview: {} as never,
                fields: [
                    {
                        name: 'name',
                        schema: z.string(),
                    },
                ],
            })
        ).toThrow("defineCollection('employees') has a `preview` without a `url` function");
    });
});
