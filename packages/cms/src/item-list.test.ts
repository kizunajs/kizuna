import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { defineCollection } from './definitions.js';
import { parseFields, parseFilter } from './item-list.js';
import { cms } from './provider.js';
import { memoryMediaStorage } from './media/storage.js';
import { DocumentStore } from './storage/store.js';

const k = new Kizuna();
const ArticleId = Kizuna.brand('ArticleId', z.string());
const EmployeeId = Kizuna.brand('EmployeeId', z.string());

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

const Employees = defineCollection({
    name: 'employees',
    id: EmployeeId,
    fields: [
        {
            name: 'name',
            schema: z.string().max(60),
        },
    ],
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
            name: 'topic',
            schema: z.enum(['care', 'season', 'growers']),
            options: {
                care: 'Plant care',
                season: 'In season',
                growers: 'Growers',
            },
        },
        {
            name: 'order',
            schema: z.int().optional(),
        },
        {
            name: 'author',
            schema: EmployeeId.optional(),
        },
        {
            name: 'excerpt',
            schema: z.string().optional(),
        },
    ],
    indexes: ['topic', 'order'],
    columns: ['author'],
});

const pglite = new PGlite();
const db = drizzle(pglite);

const app = express();
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
        collections: [Employees, Articles],
        auth: {
            identity: 'editor',
        },
        media: {
            storage: memoryMediaStorage(),
        },
        appDir: 'src/__fixtures__/app',
    }),
}).api.mount(app);

const asEditor = (call: request.Test) => call.set('authorization', 'Bearer editor-token');

const create = async (collection: string, values: Record<string, unknown>): Promise<string> => {
    const created = await asEditor(request(app).post(`/editing/collections/${collection}/items`)).send({
        values,
    });
    expect(created.status).toBe(201);
    return created.body.name as string;
};

const publish = async (id: string): Promise<void> => {
    expect((await asEditor(request(app).post(`/editing/collections/articles/items/${id}/publish`)).send({})).status).toBe(200);
};

const list = (query: Record<string, string | string[] | number>) =>
    asEditor(request(app).get('/editing/collections/articles/items').query(query));

const titles = async (query: Record<string, string | string[] | number>): Promise<string[]> => {
    const listed = await list(query);
    expect(listed.status).toBe(200);
    return listed.body.items.map((item: { label: string }) => item.label);
};

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec('delete from cms_refs; delete from cms_versions; delete from cms_documents;');
});

afterAll(async () => {
    await pglite.close();
});

describe('reading the filter', () => {
    it('reads conditions into sets, a value keeping its colons', () => {
        expect(parseFilter(['topic:is:care', 'status:is:draft', 'or', 'order:isNot:3:30'])).toEqual({
            groups: [
                [
                    {
                        field: 'topic',
                        operator: 'is',
                        value: 'care',
                    },
                    {
                        field: 'status',
                        operator: 'is',
                        value: 'draft',
                    },
                ],
                [
                    {
                        field: 'order',
                        operator: 'isNot',
                        value: '3:30',
                    },
                ],
            ],
        });
    });

    it('names the entry it cannot read', () => {
        expect(parseFilter(['topic'])).toEqual({
            problem: "The filter 'topic' is not written field:operator:value, like topic:is:care.",
        });
        expect(parseFilter(['topic:has:care'])).toEqual({
            problem: "The filter 'topic:has:care' compares with 'has'. A filter compares with is, isNot, within, outside.",
        });
    });

    it('reads fields joined by commas or listed apart', () => {
        expect(parseFields(['topic,author', 'order', 'topic'])).toEqual(['topic', 'author', 'order']);
    });
});

describe('the editing list of a collection', () => {
    it('keeps the items of any one set of conditions, a status among them', async () => {
        const repotting = await create('articles', {
            title: 'Repotting',
            topic: 'care',
        });
        await publish(repotting);
        await create('articles', {
            title: 'Watering',
            topic: 'care',
        });
        await create('articles', {
            title: 'Tulips',
            topic: 'season',
        });
        await create('articles', {
            title: 'Meet the growers',
            topic: 'growers',
        });
        expect(
            await titles({
                filter: ['topic:is:care', 'status:is:draft', 'or', 'topic:is:season'],
            })
        ).toEqual(['Tulips', 'Watering']);
        expect(
            await titles({
                filter: 'topic:isNot:care',
            })
        ).toEqual(['Meet the growers', 'Tulips']);
        expect(
            await titles({
                filter: 'status:is:published',
            })
        ).toEqual(['Repotting']);
    });

    it('sorts by an index, by status and by when an item changed', async () => {
        const first = await create('articles', {
            title: 'Bulbs',
            topic: 'care',
            order: 2,
        });
        await create('articles', {
            title: 'Asters',
            topic: 'care',
            order: 10,
        });
        await create('articles', {
            title: 'Cuttings',
            topic: 'care',
            order: 1,
        });
        await publish(first);
        expect(
            await titles({
                orderBy: 'order',
            })
        ).toEqual(['Cuttings', 'Bulbs', 'Asters']);
        expect(
            await titles({
                orderBy: 'order',
                direction: 'desc',
            })
        ).toEqual(['Asters', 'Bulbs', 'Cuttings']);
        expect(
            await titles({
                orderBy: 'updatedAt',
            })
        ).toEqual(['Bulbs', 'Cuttings', 'Asters']);
        expect(
            (
                await titles({
                    orderBy: 'status',
                })
            )[0]
        ).toBe('Bulbs');
        expect(await titles({})).toEqual(['Asters', 'Bulbs', 'Cuttings']);
    });

    it('answers one page at a time, with how many match in all', async () => {
        for (const title of ['Ash', 'Birch', 'Cedar', 'Douglas fir', 'Elm']) {
            await create('articles', {
                title,
            });
        }
        const page = await list({
            limit: 2,
            offset: 2,
        });
        expect(page.status).toBe(200);
        expect(page.body.total).toBe(5);
        expect(page.body.items.map((item: { label: string }) => item.label)).toEqual(['Cedar', 'Douglas fir']);
        const searched = await list({
            q: 'IR',
        });
        expect(searched.body.total).toBe(2);
        expect(searched.body.items.map((item: { label: string }) => item.label)).toEqual(['Birch', 'Douglas fir']);
    });

    it('carries the fields asked for, with the labels of a choice and of an id', async () => {
        const ingrid = await create('employees', {
            name: 'Ingrid Berg',
        });
        await create('articles', {
            title: 'Repotting',
            topic: 'care',
            author: ingrid,
        });
        const listed = await list({
            fields: 'topic,author,order',
        });
        expect(listed.status).toBe(200);
        expect(listed.body.items[0]).toMatchObject({
            label: 'Repotting',
            values: {
                topic: 'care',
                author: ingrid,
                order: null,
            },
            labels: {
                topic: 'Plant care',
                author: 'Ingrid Berg',
            },
        });
        expect((await list({})).body.items[0]).not.toHaveProperty('values');
    });

    it('refuses a field it keeps no index of, and a column the collection does not list', async () => {
        const sorted = await list({
            orderBy: 'excerpt',
        });
        expect(sorted.status).toBe(400);
        expect(sorted.body.detail).toBe("The list of articles cannot sort by 'excerpt'. It sorts by title, status, updatedAt, topic, order.");
        const filtered = await list({
            filter: 'author:is:ingrid',
        });
        expect(filtered.status).toBe(400);
        expect(filtered.body.detail).toBe(
            "The list of articles cannot filter by 'author', since it is not one of its indexes. It filters by status, topic, order."
        );
        const asked = await list({
            fields: 'excerpt',
        });
        expect(asked.status).toBe(400);
        expect(asked.body.detail).toBe("'excerpt' is not a column of articles. Its list shows topic, order, author.");
        expect(
            (
                await list({
                    filter: 'order:is:soon',
                })
            ).body.detail
        ).toBe("The order field holds a number, not 'soon'.");
        expect(
            (
                await list({
                    filter: 'status:is:archived',
                })
            ).status
        ).toBe(400);
    });
});

describe('a collection that lists', () => {
    it("cannot index a field named for an item's own status or time", () => {
        expect(() =>
            defineCollection({
                name: 'orders',
                id: ArticleId,
                fields: [
                    {
                        name: 'status',
                        schema: z.string(),
                    },
                ],
                indexes: ['status'],
            })
        ).toThrowError("defineCollection('orders') indexes 'status', which the editing list uses for the item's own status. Rename the field.");
    });

    it('names a column among its fields', () => {
        expect(() =>
            defineCollection({
                name: 'orders',
                id: ArticleId,
                fields: [
                    {
                        name: 'total',
                        schema: z.number(),
                    },
                ],
                columns: ['customer' as never],
            })
        ).toThrowError("defineCollection('orders') has the column 'customer', which is not one of its fields.");
    });
});
