import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { defineCollection, type Collection } from './definitions.js';
import { cms } from './provider.js';
import { memoryMediaStorage } from './media/storage.js';
import { DocumentStore } from './storage/store.js';
import { closesLoop, descendantsOf, placeInTree } from './tree.js';

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
            name: 'tags',
            schema: z.array(TagId),
        },
    ],
});

const pglite = new PGlite();
const db = drizzle(pglite);

const configWith = (collections: Collection[]) =>
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
            collections,
            auth: {
                identity: 'editor',
            },
            media: {
                storage: memoryMediaStorage(),
            },
            appDir: 'src/__fixtures__/app',
        }),
    });

const app = express();
configWith([Tags, Articles]).api.mount(app);

const asEditor = (call: request.Test) => call.set('authorization', 'Bearer editor-token');

const create = async (collection: string, values: Record<string, unknown>): Promise<string> => {
    const created = await asEditor(request(app).post(`/editing/collections/${collection}/items`)).send({
        values,
    });
    expect(created.status).toBe(201);
    return created.body.name as string;
};

const setParent = (id: string, parent: string) =>
    asEditor(request(app).patch(`/editing/collections/tags/items/${id}/draft`)).send({
        changes: {
            parent,
        },
    });

const publish = async (id: string): Promise<void> => {
    expect((await asEditor(request(app).post(`/editing/collections/tags/items/${id}/publish`)).send({})).status).toBe(200);
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

describe('checking a tree', () => {
    const treeOf = (parent: z.ZodType) =>
        defineCollection({
            name: 'tags',
            id: TagId,
            tree: 'parent',
            fields: [
                {
                    name: 'name',
                    schema: z.string(),
                },
                {
                    name: 'parent',
                    schema: parent,
                },
            ],
        });

    it('takes an optional field holding the collection’s own id', () => {
        expect(() => configWith([treeOf(TagId.optional())])).not.toThrow();
        expect(() => configWith([treeOf(TagId.nullable())])).not.toThrow();
    });

    it('refuses a tree naming no field of the collection', () => {
        const collection = defineCollection({
            name: 'tags',
            id: TagId,
            tree: 'above' as never,
            fields: [
                {
                    name: 'name',
                    schema: z.string(),
                },
            ],
        });
        expect(() => configWith([collection])).toThrow("Collection 'tags' has the tree 'above', which is not one of its fields.");
    });

    it('refuses a field holding something other than the collection’s own id', () => {
        const message =
            "Collection 'tags' has the tree 'parent', so that field holds the id of the item above. Make its schema TagId.optional().";
        expect(() => configWith([treeOf(z.string().optional())])).toThrow(message);
        expect(() => configWith([treeOf(ArticleId.optional())])).toThrow(message);
        expect(() => configWith([treeOf(z.array(TagId).optional())])).toThrow(message);
    });

    it('refuses a required parent, since an item at the top has none', () => {
        expect(() => configWith([treeOf(TagId)])).toThrow(
            "Collection 'tags' has the tree 'parent', which is required. Make it TagId.optional(), since an item at the top has none."
        );
    });
});

describe('a loop', () => {
    it('closes when the parent is the item or sits under it', () => {
        const parents = new Map<string, string | undefined>([
            ['lighting', undefined],
            ['workshop', 'lighting'],
            ['bench', 'workshop'],
        ]);
        expect(closesLoop(parents, 'lighting', 'lighting')).toBe(true);
        expect(closesLoop(parents, 'lighting', 'bench')).toBe(true);
        expect(closesLoop(parents, 'bench', 'lighting')).toBe(false);
        expect(closesLoop(parents, 'lighting', undefined)).toBe(false);
    });

    it('stops on a loop stored before the tree was declared', () => {
        const parents = new Map<string, string | undefined>([
            ['brass', 'materials'],
            ['materials', 'brass'],
        ]);
        expect(closesLoop(parents, 'lighting', 'brass')).toBe(false);
        expect(
            placeInTree(
                [
                    {
                        id: 'brass',
                        label: 'Brass',
                    },
                    {
                        id: 'materials',
                        label: 'Materials',
                    },
                ],
                parents
            ).map((item) => item.treeLabel)
        ).toEqual(['Materials / Brass', 'Brass / Materials']);
    });

    it('refuses a save that puts a tag under itself, with a 409', async () => {
        const lighting = await create('tags', {
            name: 'Lighting',
        });
        const refused = await setParent(lighting, lighting);
        expect(refused.status).toBe(409);
        expect(refused.body.detail).toBe(`Item '${lighting}' of tags cannot sit under itself.`);
    });

    it('refuses a save that puts a tag under one of its own', async () => {
        const lighting = await create('tags', {
            name: 'Lighting',
        });
        const workshop = await create('tags', {
            name: 'Workshop',
            parent: lighting,
        });
        const bench = await create('tags', {
            name: 'Bench',
            parent: workshop,
        });
        const refused = await setParent(lighting, bench);
        expect(refused.status).toBe(409);
        expect(refused.body.detail).toBe(`Item '${lighting}' of tags cannot sit under '${bench}', which sits under it.`);
        expect((await setParent(bench, lighting)).status).toBe(200);
    });

    it('refuses a publish that would close a loop among the published tags', async () => {
        const lighting = await create('tags', {
            name: 'Lighting',
        });
        const workshop = await create('tags', {
            name: 'Workshop',
            parent: lighting,
        });
        const brass = await create('tags', {
            name: 'Brass',
        });
        await publish(lighting);
        await publish(workshop);
        expect((await setParent(workshop, brass)).status).toBe(200);
        expect((await setParent(lighting, workshop)).status).toBe(200);
        const refused = await asEditor(request(app).post(`/editing/collections/tags/items/${lighting}/publish`)).send({});
        expect(refused.status).toBe(409);
        await publish(workshop);
        await publish(lighting);
    });

    it('refuses restoring a version that would close a loop', async () => {
        const lighting = await create('tags', {
            name: 'Lighting',
        });
        const workshop = await create('tags', {
            name: 'Workshop',
        });
        const brass = await create('tags', {
            name: 'Brass',
        });
        expect((await setParent(workshop, lighting)).status).toBe(200);
        expect((await setParent(workshop, brass)).status).toBe(200);
        expect((await setParent(lighting, workshop)).status).toBe(200);
        const refused = await asEditor(request(app).post(`/editing/collections/tags/items/${workshop}/rollback`)).send({
            version: 2,
        });
        expect(refused.status).toBe(409);
    });
});

describe('labels', () => {
    it('lists each tag with its parent and its path', async () => {
        const lighting = await create('tags', {
            name: 'Lighting',
        });
        const workshop = await create('tags', {
            name: 'Workshop',
            parent: lighting,
        });
        const listed = await asEditor(request(app).get('/editing/collections/tags/items'));
        expect(listed.status).toBe(200);
        expect(listed.body.items).toMatchObject([
            {
                id: lighting,
                label: 'Lighting',
                parent: null,
                treeLabel: 'Lighting',
            },
            {
                id: workshop,
                label: 'Workshop',
                parent: lighting,
                treeLabel: 'Lighting / Workshop',
            },
        ]);
    });

    it('gives the picker the path, and finds a tag by a tag above it', async () => {
        const lighting = await create('tags', {
            name: 'Lighting',
        });
        const workshop = await create('tags', {
            name: 'Workshop',
            parent: lighting,
        });
        await create('tags', {
            name: 'Brass',
        });
        const found = await asEditor(
            request(app).get('/editing/items/TagId').query({
                q: 'lighting',
            })
        );
        expect(found.status).toBe(200);
        expect(found.body.items).toEqual([
            {
                id: lighting,
                label: 'Lighting',
                parent: null,
                treeLabel: 'Lighting',
            },
            {
                id: workshop,
                label: 'Workshop',
                parent: lighting,
                treeLabel: 'Lighting / Workshop',
            },
        ]);
    });

    it('leaves the tree fields out of a collection without one', async () => {
        await create('articles', {
            title: 'Spring lamps',
        });
        const listed = await asEditor(request(app).get('/editing/collections/articles/items'));
        expect(listed.body.items[0]).not.toHaveProperty('treeLabel');
        expect(listed.body.items[0]).not.toHaveProperty('parent');
    });

    it('puts a tag whose parent was deleted at the top', async () => {
        const lighting = await create('tags', {
            name: 'Lighting',
        });
        await create('tags', {
            name: 'Workshop',
            parent: lighting,
        });
        expect((await asEditor(request(app).delete(`/editing/collections/tags/items/${lighting}`))).status).toBe(204);
        const listed = await asEditor(request(app).get('/editing/collections/tags/items'));
        expect(listed.body.items).toMatchObject([
            {
                label: 'Workshop',
                parent: null,
                treeLabel: 'Workshop',
            },
        ]);
    });
});

describe('filtering by a tag and the tags under it', () => {
    it('finds every tag under one, at any depth', () => {
        const parents = new Map<string, string | undefined>([
            ['materials', undefined],
            ['brass', 'materials'],
            ['brushedBrass', 'brass'],
            ['lighting', undefined],
        ]);
        expect([...descendantsOf(parents, 'materials')].sort()).toEqual(['brass', 'brushedBrass', 'materials']);
    });

    it('keeps the articles holding the tag, or with descendants, a tag under it', async () => {
        const lighting = await create('tags', {
            name: 'Lighting',
        });
        const workshop = await create('tags', {
            name: 'Workshop',
            parent: lighting,
        });
        const brass = await create('tags', {
            name: 'Brass',
        });
        await create('articles', {
            title: 'Bench lamps',
            tags: [workshop],
        });
        await create('articles', {
            title: 'Ceiling lights',
            tags: [lighting, brass],
        });
        await create('articles', {
            title: 'Polishing brass',
            tags: [brass],
        });
        const titles = async (query: Record<string, string>) => {
            const listed = await asEditor(request(app).get('/editing/collections/articles/items').query(query));
            expect(listed.status).toBe(200);
            return listed.body.items.map((item: { label: string }) => item.label);
        };
        expect(
            await titles({
                field: 'tags',
                value: lighting,
            })
        ).toEqual(['Ceiling lights']);
        expect(
            await titles({
                field: 'tags',
                value: lighting,
                descendants: 'true',
            })
        ).toEqual(['Bench lamps', 'Ceiling lights']);
        expect(
            await titles({
                field: 'tags',
                value: workshop,
                descendants: 'true',
            })
        ).toEqual(['Bench lamps']);
    });

    it('lists the tags under one by their parent', async () => {
        const materials = await create('tags', {
            name: 'Materials',
        });
        const brass = await create('tags', {
            name: 'Brass',
            parent: materials,
        });
        await create('tags', {
            name: 'Brushed brass',
            parent: brass,
        });
        await create('tags', {
            name: 'Lighting',
        });
        const listed = await asEditor(
            request(app).get('/editing/collections/tags/items').query({
                field: 'parent',
                value: materials,
                descendants: 'true',
            })
        );
        expect(listed.body.items.map((item: { treeLabel: string }) => item.treeLabel)).toEqual([
            'Materials / Brass',
            'Materials / Brass / Brushed brass',
        ]);
    });

    it('refuses descendants on a field whose ids have no tree, and a field the collection lacks', async () => {
        const noTree = await asEditor(
            request(app).get('/editing/collections/articles/items').query({
                field: 'title',
                value: 'Bench lamps',
                descendants: 'true',
            })
        );
        expect(noTree.status).toBe(400);
        expect(noTree.body.detail).toBe("The title field holds no ids of a collection with a tree, so nothing sits under 'Bench lamps'.");
        const unknown = await asEditor(
            request(app).get('/editing/collections/articles/items').query({
                field: 'author',
                value: 'ada',
            })
        );
        expect(unknown.status).toBe(400);
        const half = await asEditor(
            request(app).get('/editing/collections/articles/items').query({
                field: 'tags',
            })
        );
        expect(half.status).toBe(400);
    });
});
