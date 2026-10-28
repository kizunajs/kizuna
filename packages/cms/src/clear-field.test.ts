import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { defineBlock } from './block.js';
import { definePage } from './page.js';
import { cms } from './provider.js';
import { memoryMediaStorage } from './media/storage.js';
import { DocumentStore } from './storage/store.js';

const k = new Kizuna();

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

const HeroBlockSchema = defineBlock({
    name: 'hero',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
        {
            name: 'caption',
            schema: z.string().optional(),
        },
    ],
});

const FrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
        {
            name: 'subheading',
            schema: z.string().optional(),
        },
        {
            name: 'announcement',
            schema: z.string().nullable(),
        },
        {
            name: 'hero',
            schema: HeroBlockSchema,
        },
    ],
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
        pages: {
            frontPage: {
                path: '/',
                page: FrontPage,
            },
        },
        auth: {
            identity: 'editor',
        },
        media: {
            storage: memoryMediaStorage(),
        },
        appDir: 'src/__fixtures__/app',
    }),
}).api.mount(app);

const save = (changes: Record<string, unknown>) =>
    request(app).patch('/editing/pages/frontPage/draft').set('authorization', 'Bearer editor-token').send({
        changes,
    });

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec('delete from cms_refs; delete from cms_versions; delete from cms_documents;');
    const saved = await save({
        heading: 'Spring is here',
        subheading: 'New bulbs every week',
        announcement: 'Closed on Monday',
        'hero.heading': 'Tulips',
        'hero.caption': 'Grown in Lisse',
    });
    expect(saved.status).toBe(200);
});

afterAll(async () => {
    await pglite.close();
});

describe('a null in a save', () => {
    it('empties an optional field', async () => {
        const saved = await save({
            subheading: null,
        });
        expect(saved.status).toBe(200);
        expect(saved.body.complete).toBe(true);
        expect(saved.body.content).not.toHaveProperty('subheading');
    });

    it('empties an optional field inside a block', async () => {
        const saved = await save({
            'hero.caption': null,
        });
        expect(saved.status).toBe(200);
        expect(saved.body.content.hero).toEqual({
            heading: 'Tulips',
        });
    });

    it('stays null in a field that takes null', async () => {
        const saved = await save({
            announcement: null,
        });
        expect(saved.status).toBe(200);
        expect(saved.body.content).toHaveProperty('announcement', null);
    });

    it('is refused in a required field, with a 422', async () => {
        const refused = await save({
            heading: null,
        });
        expect(refused.status).toBe(422);
        expect(refused.body.errors).toEqual([
            {
                code: 'invalid_type',
                path: ['heading'],
                message: expect.any(String),
            },
        ]);
    });
});
