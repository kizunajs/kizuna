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
import { ImageSchema } from './image.js';
import { memoryMediaStorage } from './media/storage.js';
import { DocumentStore } from './storage/store.js';

const k = new Kizuna();

const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
    })
    .guard(() => ({
        userId: 'ada',
    }));

const Products = defineCollection({
    name: 'products',
    id: Kizuna.brand('ProductId', z.string()),
    fields: [
        {
            type: 'row',
            fields: [
                {
                    name: 'name',
                    schema: z.string(),
                },
                {
                    name: 'price',
                    schema: z.string(),
                },
            ],
        },
        {
            name: 'photo',
            schema: ImageSchema.optional(),
            position: 'sidebar',
        },
    ],
});

const Employees = defineCollection({
    name: 'employees',
    id: Kizuna.brand('EmployeeId', z.string()),
    fields: [
        {
            name: 'name',
            schema: z.string(),
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
        collections: [Products, Employees],
        auth: {
            identity: 'editor',
        },
        media: {
            storage: memoryMediaStorage(),
        },
        appDir: 'src/__fixtures__/app',
    }),
}).api.mount(app);

const create = async (collection: string, values: Record<string, unknown>): Promise<string> => {
    const created = await request(app).post(`/editing/collections/${collection}/items`).send({
        values,
    });
    expect(created.status).toBe(201);
    return created.body.name as string;
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

describe('the picker', () => {
    it("shows an item's thumbnail from the collection's first image field", async () => {
        const fern = await create('products', {
            name: 'Fern',
            price: '£24',
            photo: {
                id: 'media_fern',
                alt: 'A fern in a clay pot',
            },
        });
        const moss = await create('products', {
            name: 'Moss',
            price: '£8',
        });
        const found = await request(app).get('/editing/items/ProductId');
        expect(found.status).toBe(200);
        expect(found.body.items).toEqual([
            {
                id: fern,
                label: 'Fern',
                image: '/api/content/media/media_fern/image?w=160',
            },
            {
                id: moss,
                label: 'Moss',
            },
        ]);
    });

    it('shows no thumbnail for a collection without an image field', async () => {
        const ada = await create('employees', {
            name: 'Ada',
        });
        expect((await request(app).get('/editing/items/EmployeeId')).body.items).toEqual([
            {
                id: ada,
                label: 'Ada',
            },
        ]);
    });
});
