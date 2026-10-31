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
import { memoryMediaStorage } from './media/storage.js';
import { DocumentStore } from './storage/store.js';
import { byPlace, isKey, keyBetween, keysBetween } from './place.js';
import vectors from './keys.vectors.json';

const k = new Kizuna();
const EmployeeId = Kizuna.brand('EmployeeId', z.string());
const MenuItemId = Kizuna.brand('MenuItemId', z.string());
const TagId = Kizuna.brand('TagId', z.string());

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
    orderable: true,
    fields: [
        {
            name: 'name',
            schema: z.string().max(60),
        },
        {
            name: 'office',
            schema: z.string().max(60),
        },
    ],
    indexes: ['office'],
});

const MenuItems = defineCollection({
    name: 'menuItems',
    id: MenuItemId,
    tree: {
        field: 'parent',
        depth: 2,
    },
    orderable: true,
    fields: [
        {
            name: 'label',
            schema: z.string().max(40),
        },
        {
            name: 'parent',
            schema: MenuItemId.optional(),
        },
    ],
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
});

const pglite = new PGlite();
const db = drizzle(pglite);

const app = express();
defineConfig({
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
        pages: {},
        collections: [Employees, MenuItems, Tags],
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

const publish = async (collection: string, id: string): Promise<void> => {
    expect((await asEditor(request(app).post(`/editing/collections/${collection}/items/${id}/publish`)).send({})).status).toBe(200);
};

const place = (collection: string, id: string, body: Record<string, unknown>) =>
    asEditor(request(app).put(`/editing/collections/${collection}/items/${id}/place`)).send(body);

const editingNames = async (collection: string, query: Record<string, unknown> = {}): Promise<string[]> => {
    const listed = await asEditor(request(app).get(`/editing/collections/${collection}/items`)).query(query);
    expect(listed.status).toBe(200);
    return (listed.body.items as Array<{ label: string }>).map((item) => item.label);
};

const publishedNames = async (collection: string, field: string, query: Record<string, unknown> = {}): Promise<string[]> => {
    const listed = await request(app).get(`/content/collections/${collection}`).query(query);
    expect(listed.status).toBe(200);
    return (listed.body.items as Array<Record<string, string>>).map((item) => item[field]!);
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

describe('declaring an order and a tree', () => {
    it('takes the tree as a field or with a depth, and refuses a depth below one', () => {
        expect(MenuItems.tree).toBe('parent');
        expect(MenuItems.treeDepth).toBe(2);
        expect(Tags.treeDepth).toBeUndefined();
        expect(() =>
            defineCollection({
                name: 'menuItems',
                id: MenuItemId,
                tree: {
                    field: 'parent',
                    depth: 0,
                },
                fields: [
                    {
                        name: 'parent',
                        schema: MenuItemId.optional(),
                    },
                ],
            })
        ).toThrow('depth 0');
    });
});

describe('keys', () => {
    it('match every shared vector', () => {
        for (const { before, after, key } of vectors.between) {
            expect(keyBetween(before ?? undefined, after ?? undefined)).toBe(key);
        }
        for (const { before, after, count, keys } of vectors.several) {
            expect(keysBetween(before ?? undefined, after ?? undefined, count)).toEqual(keys);
        }
    });

    it('stay short and in order through long runs at either end and in one gap', () => {
        const runFrom = (count: number, step: (key: string | undefined) => string) => {
            const keys: string[] = [];
            let key: string | undefined;
            for (let index = 0; index < count; index++) {
                key = step(key);
                keys.push(key);
            }
            return keys;
        };
        const append = runFrom(vectors.runs.append.count, (key) => keyBetween(key, undefined));
        expect(append.at(-1)).toBe(vectors.runs.append.last);
        expect(Math.max(...append.map((key) => key.length))).toBe(vectors.runs.append.longest);
        expect([...append].sort()).toEqual(append);
        const prepend = runFrom(vectors.runs.prepend.count, (key) => keyBetween(undefined, key));
        expect(prepend.at(-1)).toBe(vectors.runs.prepend.last);
        expect([...prepend].sort().reverse()).toEqual(prepend);
        const { gap } = vectors.runs;
        const inGap = runFrom(gap.count, (key) => keyBetween(key ?? gap.before, gap.after));
        expect(inGap.at(-1)).toBe(gap.last);
        expect(Math.max(...inGap.map((key) => key.length))).toBe(gap.longest);
        expect(inGap.every(isKey)).toBe(true);
    });

    it('refuses what is not a key, and a pair out of order', () => {
        expect(isKey('a0')).toBe(true);
        expect(isKey('a0i0')).toBe(false);
        expect(isKey('A0')).toBe(false);
        expect(isKey('b0')).toBe(false);
        expect(() => keyBetween('a1', 'a0')).toThrow();
    });

    it('sorts an item without a place after the others, then by id', () => {
        const sorted = [
            {
                place: undefined,
                id: 'a',
            },
            {
                place: 'n',
                id: 'b',
            },
            {
                place: 'n',
                id: 'a',
            },
        ].sort(byPlace);
        expect(sorted.map((item) => `${item.place}:${item.id}`)).toEqual(['n:a', 'n:b', 'undefined:a']);
    });
});

describe('an orderable collection', () => {
    const team = async (): Promise<Record<string, string>> => {
        const ids: Record<string, string> = {};
        for (const [name, office] of [
            ['Ingrid Solberg', 'oslo'],
            ['Eleanor Price', 'london'],
            ['Martin Hale', 'london'],
            ['Priya Shah', 'london'],
        ]) {
            ids[name!] = await create('employees', {
                name,
                office,
            });
            await publish('employees', ids[name!]!);
        }
        return ids;
    };

    it('lists new items last, in the editing list and the published one', async () => {
        await team();
        const order = ['Ingrid Solberg', 'Eleanor Price', 'Martin Hale', 'Priya Shah'];
        expect(await editingNames('employees')).toEqual(order);
        expect(await publishedNames('employees', 'name')).toEqual(order);
    });

    it('moves an item before or after another, or to either end, as a draft the site sees once published', async () => {
        const ids = await team();
        expect(
            (
                await place('employees', ids['Priya Shah']!, {
                    before: ids['Eleanor Price'],
                })
            ).body.status
        ).toBe('changed');
        expect(await editingNames('employees')).toEqual(['Ingrid Solberg', 'Priya Shah', 'Eleanor Price', 'Martin Hale']);
        expect(await publishedNames('employees', 'name')).toEqual(['Ingrid Solberg', 'Eleanor Price', 'Martin Hale', 'Priya Shah']);
        await publish('employees', ids['Priya Shah']!);
        expect(await publishedNames('employees', 'name')).toEqual(['Ingrid Solberg', 'Priya Shah', 'Eleanor Price', 'Martin Hale']);

        await place('employees', ids['Ingrid Solberg']!, {
            after: ids['Martin Hale'],
        });
        await place('employees', ids['Martin Hale']!, {
            at: 'first',
        });
        expect(await editingNames('employees')).toEqual(['Martin Hale', 'Priya Shah', 'Eleanor Price', 'Ingrid Solberg']);
        await place('employees', ids['Martin Hale']!, {});
        expect(await editingNames('employees')).toEqual(['Priya Shah', 'Eleanor Price', 'Ingrid Solberg', 'Martin Hale']);
    });

    it('keeps the order through a filter, and reads it by another index when asked', async () => {
        const ids = await team();
        await place('employees', ids['Priya Shah']!, {
            before: ids['Eleanor Price'],
        });
        expect(
            await editingNames('employees', {
                filter: ['office:is:london'],
            })
        ).toEqual(['Priya Shah', 'Eleanor Price', 'Martin Hale']);
        expect(
            await editingNames('employees', {
                orderBy: 'title',
            })
        ).toEqual(['Eleanor Price', 'Ingrid Solberg', 'Martin Hale', 'Priya Shah']);
    });

    it('keeps an item where it is when it already sits there, and its place through an edit', async () => {
        const ids = await team();
        const before = (await asEditor(request(app).get(`/editing/collections/employees/items/${ids['Martin Hale']}/versions`))).body;
        const stayed = await place('employees', ids['Martin Hale']!, {
            after: ids['Eleanor Price'],
        });
        expect(stayed.status).toBe(200);
        expect(stayed.body.status).toBe('published');
        expect((await asEditor(request(app).get(`/editing/collections/employees/items/${ids['Martin Hale']}/versions`))).body).toEqual(
            before
        );
        await asEditor(request(app).patch(`/editing/collections/employees/items/${ids['Eleanor Price']}/draft`)).send({
            changes: {
                name: 'Eleanor Price-Hale',
            },
        });
        expect(await editingNames('employees')).toEqual(['Ingrid Solberg', 'Eleanor Price-Hale', 'Martin Hale', 'Priya Shah']);
    });

    it('never shows the place to a reader', async () => {
        await team();
        const listed = await request(app).get('/content/collections/employees');
        expect(Object.keys(listed.body.items[0]).sort()).toEqual(['id', 'name', 'office']);
    });

    it('refuses two places at once, an item beside itself, and one that is not there', async () => {
        const ids = await team();
        expect(
            (
                await place('employees', ids['Priya Shah']!, {
                    at: 'first',
                    after: ids['Eleanor Price'],
                })
            ).status
        ).toBe(400);
        expect(
            (
                await place('employees', ids['Priya Shah']!, {
                    before: ids['Priya Shah'],
                })
            ).status
        ).toBe(400);
        expect(
            (
                await place('employees', ids['Priya Shah']!, {
                    before: 'nobody',
                })
            ).status
        ).toBe(404);
        expect(
            (
                await place('employees', ids['Priya Shah']!, {
                    parent: ids['Eleanor Price'],
                })
            ).status
        ).toBe(400);
    });
});

describe('an orderable tree', () => {
    const menu = async (): Promise<Record<string, string>> => {
        const ids: Record<string, string> = {};
        const add = async (label: string, parent?: string) => {
            ids[label] = await create('menuItems', {
                label,
                ...(parent === undefined
                    ? {}
                    : {
                          parent: ids[parent],
                      }),
            });
            await publish('menuItems', ids[label]!);
        };
        await add('Butikker');
        await add('Oslo', 'Butikker');
        await add('Bergen', 'Butikker');
        await add('Om oss');
        await add('Jobb hos oss', 'Om oss');
        await add('Personvern');
        return ids;
    };

    it('moves an item beside another as its sibling, under its parent', async () => {
        const ids = await menu();
        const moved = await place('menuItems', ids['Personvern']!, {
            after: ids['Jobb hos oss'],
        });
        expect(moved.status).toBe(200);
        expect(moved.body.content.parent).toBe(ids['Om oss']);
        await place('menuItems', ids['Bergen']!, {
            before: ids['Oslo'],
        });
        const names = await editingNames('menuItems');
        expect(names.indexOf('Bergen')).toBeLessThan(names.indexOf('Oslo'));
        expect(names.indexOf('Jobb hos oss')).toBeLessThan(names.indexOf('Personvern'));
    });

    it('puts an item first or last under a parent, and back at the top', async () => {
        const ids = await menu();
        await place('menuItems', ids['Personvern']!, {
            parent: ids['Butikker'],
            at: 'first',
        });
        expect(
            (await asEditor(request(app).get(`/editing/collections/menuItems/items/${ids['Personvern']}/draft`))).body.content.parent
        ).toBe(ids['Butikker']);
        const top = await place('menuItems', ids['Personvern']!, {
            parent: null,
        });
        expect(top.body.content.parent).toBeUndefined();
    });

    it('refuses a parent that disagrees with the item named beside it', async () => {
        const ids = await menu();
        expect(
            (
                await place('menuItems', ids['Personvern']!, {
                    after: ids['Oslo'],
                    parent: ids['Om oss'],
                })
            ).status
        ).toBe(409);
    });

    it('refuses a move deeper than its depth, for the item or anything under it', async () => {
        const ids = await menu();
        const under = await place('menuItems', ids['Personvern']!, {
            parent: ids['Oslo'],
        });
        expect(under.status).toBe(409);
        expect(under.body.detail).toContain('2 levels');
        expect(
            (
                await place('menuItems', ids['Om oss']!, {
                    parent: ids['Butikker'],
                })
            ).status
        ).toBe(409);
        expect(
            (
                await asEditor(request(app).patch(`/editing/collections/menuItems/items/${ids['Personvern']}/draft`)).send({
                    changes: {
                        parent: ids['Bergen'],
                    },
                })
            ).status
        ).toBe(409);
    });

    it('leaves an item off the site until everything above it is published', async () => {
        const ids = await menu();
        await asEditor(request(app).post(`/editing/collections/menuItems/items/${ids['Om oss']}/unpublish`)).send({});
        expect(await publishedNames('menuItems', 'label')).toEqual(['Butikker', 'Oslo', 'Bergen', 'Personvern']);
    });

    it('deletes everything under an item with it', async () => {
        const ids = await menu();
        expect((await asEditor(request(app).delete(`/editing/collections/menuItems/items/${ids['Butikker']}`))).status).toBe(204);
        expect(await editingNames('menuItems')).toEqual(['Om oss', 'Jobb hos oss', 'Personvern']);
    });
});

describe('a tree without an order', () => {
    it('moves an item by its parent alone', async () => {
        const lighting = await create('tags', {
            name: 'Lighting',
        });
        const workshop = await create('tags', {
            name: 'Workshop',
        });
        const moved = await place('tags', workshop, {
            parent: lighting,
        });
        expect(moved.status).toBe(200);
        expect(moved.body.content.parent).toBe(lighting);
        expect(
            (
                await place('tags', workshop, {
                    at: 'first',
                })
            ).status
        ).toBe(400);
        expect(
            (
                await place('tags', lighting, {
                    parent: workshop,
                })
            ).status
        ).toBe(409);
    });
});
