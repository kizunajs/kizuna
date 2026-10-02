import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { defineCollection, defineGlobal } from './definitions.js';
import { definePage } from './page.js';
import { cms } from './provider.js';
import { memoryMediaStorage } from './media/storage.js';
import { DocumentStore } from './storage/store.js';
import { indexSql } from './storage/migration.js';
import { pluginExportsOf } from 'kizunajs/adapter';
import type { CmsExports } from './plugin.js';

const k = new Kizuna();
const roles = Kizuna.roles(['editor', 'admin']);
const EmployeeId = Kizuna.brand('EmployeeId', z.string());

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

const Site = defineGlobal({
    name: 'site',
    fields: [
        {
            name: 'footer',
            schema: z.string().max(80),
        },
    ],
});

const Employees = defineCollection({
    name: 'employees',
    id: EmployeeId,
    fields: [
        {
            name: 'name',
            schema: z.string().min(1).max(40),
        },
        {
            name: 'department',
            schema: z.enum(['Design', 'Engineering']),
        },
        {
            name: 'order',
            schema: z.int().min(0),
        },
    ],
    indexes: ['department', 'order'],
});

const ContactPage = definePage({
    name: 'contactPage',
    fields: [
        {
            name: 'contacts',
            schema: z.array(EmployeeId).max(3),
        },
    ],
});

const revalidated: string[][] = [];
const pglite = new PGlite();
const db = drizzle(pglite);
const content = cms({
    db,
    pages: {
        contactPage: {
            path: '/contact',
            page: ContactPage,
        },
    },
    globals: [Site],
    collections: [Employees],
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

const createEmployee = async (name: string, department: string, order: number): Promise<string> => {
    const created = await asEditor(request(app).post('/editing/collections/employees/items')).send({
        values: {
            name,
            department,
            order,
        },
    });
    expect(created.status).toBe(201);
    const id = created.body.name as string;
    expect((await asEditor(request(app).post(`/editing/collections/employees/items/${id}/publish`)).send({})).status).toBe(200);
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

describe('globals', () => {
    it('drafts, publishes and reads one global', async () => {
        expect((await request(app).get('/content/globals/site')).status).toBe(404);
        const saved = await asEditor(request(app).patch('/editing/globals/site/draft')).send({
            changes: {
                footer: 'Made in Oslo',
            },
        });
        expect(saved.body).toMatchObject({
            ref: 'global:site',
            path: null,
            complete: true,
        });
        await asEditor(request(app).post('/editing/globals/site/publish')).send({});
        expect(revalidated).toContainEqual(['kizuna-cms:global:site']);
        const read = await request(app).get('/content/globals/site');
        expect(read.body.content).toEqual({
            footer: 'Made in Oslo',
        });
    });

    it('says a global appears everywhere', async () => {
        const described = await asEditor(request(app).get('/editing/describe').query({ ref: 'global:site' }));
        expect(described.body.usedOn).toEqual({
            everywhere: true,
            pages: [],
        });
    });
});

describe('collections', () => {
    it('creates items as drafts with generated ids, and lists them for editors', async () => {
        const created = await asEditor(request(app).post('/editing/collections/employees/items')).send({
            values: {
                name: 'Ada',
            },
        });
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({
            status: 'draft',
            complete: false,
            missing: ['department', 'order'],
        });
        expect(created.body.ref).toMatch(/^item:employees:[a-z0-9]{12}$/);
        const listed = await asEditor(request(app).get('/editing/collections/employees/items'));
        expect(listed.body.items).toMatchObject([
            {
                label: 'Ada',
                status: 'draft',
                complete: false,
            },
        ]);
        expect((await request(app).get('/content/collections/employees')).body.items).toEqual([]);
    });

    it('lists published items filtered and sorted by their indexes, a page at a time', async () => {
        await createEmployee('Grace', 'Engineering', 2);
        await createEmployee('Ada', 'Engineering', 1);
        await createEmployee('Dieter', 'Design', 1);
        const engineering = await request(app).get('/content/collections/employees').query({
            department: 'Engineering',
            orderBy: 'order',
        });
        expect(engineering.status).toBe(200);
        expect(engineering.body.items.map((item: { name: string }) => item.name)).toEqual(['Ada', 'Grace']);
        expect(engineering.body.items[0].id).toMatch(/^[a-z0-9]{12}$/);
        const first = await request(app).get('/content/collections/employees').query({
            orderBy: 'order',
            direction: 'desc',
            limit: 2,
        });
        expect(first.body.items.map((item: { order: number }) => item.order)).toEqual([2, 1]);
        const second = await request(app).get('/content/collections/employees').query({
            orderBy: 'order',
            direction: 'desc',
            limit: 2,
            cursor: first.body.next,
        });
        expect(second.body.items).toHaveLength(1);
        expect(second.body.next).toBeNull();
        const names = [...first.body.items, ...second.body.items].map((item: { name: string }) => item.name);
        expect(new Set(names).size).toBe(3);
    });

    it('refuses to filter by a field that is not indexed', async () => {
        const response = await request(app).get('/content/collections/employees').query({
            name: 'Ada',
        });
        expect(response.status).toBe(400);
    });

    it('reads one item, and says which pages reference it', async () => {
        const id = await createEmployee('Ada', 'Engineering', 1);
        expect((await request(app).get(`/content/collections/employees/${id}`)).body).toEqual({
            id,
            name: 'Ada',
            department: 'Engineering',
            order: 1,
        });
        await asEditor(request(app).patch('/editing/pages/contactPage/draft')).send({
            changes: {
                contacts: [id],
            },
        });
        const described = await asEditor(
            request(app)
                .get('/editing/describe')
                .query({ ref: `item:employees:${id}` })
        );
        expect(described.body.usedOn).toEqual({
            everywhere: false,
            pages: [
                {
                    name: 'contactPage',
                    path: '/contact',
                },
            ],
        });
        const contacts = (await asEditor(request(app).get('/editing/describe').query({ url: '/contact' }))).body.fields[0];
        expect(contacts.brand).toBe('EmployeeId');
        expect(contacts.description).toContain('employees collection');
    });

    it('drops the item, its collection and the pages that reference it when it publishes', async () => {
        const id = await createEmployee('Ada', 'Engineering', 1);
        await asEditor(request(app).patch('/editing/pages/contactPage/draft')).send({
            changes: {
                contacts: [id],
            },
        });
        revalidated.length = 0;
        await asEditor(request(app).patch(`/editing/collections/employees/items/${id}/draft`)).send({
            changes: {
                name: 'Ada Lovelace',
            },
        });
        await asEditor(request(app).post(`/editing/collections/employees/items/${id}/publish`)).send({});
        expect(revalidated).toEqual([
            [`kizuna-cms:item:employees:${id}`, 'kizuna-cms:collection:employees', 'kizuna-cms:page:contactPage'],
        ]);
    });

    it('deletes an item with its history', async () => {
        const id = await createEmployee('Ada', 'Engineering', 1);
        expect((await asEditor(request(app).delete(`/editing/collections/employees/items/${id}`))).status).toBe(204);
        expect((await request(app).get(`/content/collections/employees/${id}`)).status).toBe(404);
        expect((await asEditor(request(app).get('/editing/collections/employees/items'))).body.items).toEqual([]);
        expect((await asEditor(request(app).delete(`/editing/collections/employees/items/${id}`))).status).toBe(404);
    });

    it('keeps an item refused when a value breaks its schema', async () => {
        const created = await asEditor(request(app).post('/editing/collections/employees/items')).send({
            values: {
                name: 'x'.repeat(41),
            },
        });
        expect(created.status).toBe(422);
    });
});

describe('copying between environments', () => {
    it('reads published content as stored, for editors only', async () => {
        const id = await createEmployee('Ada', 'Engineering', 1);
        const stored = await asEditor(request(app).get(`/editing/collections/employees/items/${id}/published`));
        expect(stored.status).toBe(200);
        expect(stored.body).toMatchObject({
            ref: `item:employees:${id}`,
            version: 1,
            content: {
                name: 'Ada',
                department: 'Engineering',
                order: 1,
            },
        });
        expect((await request(app).get(`/editing/collections/employees/items/${id}/published`)).status).toBe(401);
        expect((await asEditor(request(app).get('/editing/globals/site/published'))).status).toBe(404);
    });
});

describe('indexes', () => {
    it('lists every indexed field of every collection with how it is read', () => {
        expect(service.indexedFields()).toEqual([
            {
                kind: 'item',
                keyPrefix: 'employees/',
                field: 'department',
                type: 'text',
            },
            {
                kind: 'item',
                keyPrefix: 'employees/',
                field: 'order',
                type: 'numeric',
            },
        ]);
    });

    it('writes the indexes after the tables, and they apply more than once', async () => {
        const migration = service.migrationSql();
        expect(migration.indexOf('create table cms_documents')).toBeLessThan(migration.indexOf('cms_index_employees_order_published'));
        const indexes = indexSql(service.indexedFields());
        await pglite.exec(indexes);
        await pglite.exec(indexes);
        const created = await pglite.query<{ indexname: string }>(
            "select indexname from pg_indexes where indexname like 'cms_index_employees_%' order by indexname"
        );
        expect(created.rows.map((row) => row.indexname)).toEqual([
            'cms_index_employees_department_draft',
            'cms_index_employees_department_published',
            'cms_index_employees_order_draft',
            'cms_index_employees_order_published',
        ]);
    });
});
