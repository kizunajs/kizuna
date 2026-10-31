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
import type { CmsExports } from './setup.js';
import { cms } from './provider.js';
import { DocumentStore } from './storage/store.js';
import { DocumentHolds, HOLD_IDLE_MS } from './holds.js';

describe('a hold', () => {
    it('goes to the first to claim it, and refuses anyone else until it ends', () => {
        let now = 1_000;
        const holds = new DocumentHolds(() => now);
        expect(holds.claim('page:frontPage', 'kari')).toBeUndefined();
        expect(holds.claim('page:frontPage', 'nils')).toMatchObject({
            by: 'kari',
        });
        expect(holds.holder('page:frontPage')?.by).toBe('kari');
        expect(holds.claim('page:aboutPage', 'nils')).toBeUndefined();
        now += HOLD_IDLE_MS + 1;
        expect(holds.holder('page:frontPage')).toBeUndefined();
        expect(holds.claim('page:frontPage', 'nils')).toBeUndefined();
    });

    it('is renewed by its holder, keeping when it started', () => {
        let now = 1_000;
        const holds = new DocumentHolds(() => now);
        holds.claim('page:frontPage', 'kari');
        now += HOLD_IDLE_MS - 10;
        holds.claim('page:frontPage', 'kari');
        now += HOLD_IDLE_MS - 10;
        expect(holds.holder('page:frontPage')).toMatchObject({
            by: 'kari',
            since: 1_000,
        });
    });

    it('ends when its holder releases it, and only then', () => {
        const holds = new DocumentHolds();
        holds.claim('page:frontPage', 'kari');
        expect(holds.release('page:frontPage', 'nils')).toBe(false);
        expect(holds.heldByOther('page:frontPage', 'nils')?.by).toBe('kari');
        expect(holds.heldByOther('page:frontPage', 'kari')).toBeUndefined();
        expect(holds.release('page:frontPage', 'kari')).toBe(true);
        expect(holds.holder('page:frontPage')).toBeUndefined();
    });
});

const k = new Kizuna();
const TOKENS: Record<string, string> = {
    'kari-token': 'kari@hagen.example.com',
    'nils-token': 'nils@hagen.example.com',
};
const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
        roles: Kizuna.roles(['editor', 'admin']),
    })
    .guard(({ bearer, deny }) => {
        const userId = TOKENS[bearer?.token ?? ''];
        if (userId !== undefined) {
            return {
                userId,
                role: 'admin',
            };
        }
        return deny({
            status: 401,
            body: {
                detail: 'Unauthorized',
            },
        });
    });

const FrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
        {
            name: 'intro',
            schema: z.string().optional(),
        },
    ],
});

const pglite = new PGlite();
const db = drizzle(pglite);
let app: express.Express;
let content: CmsExports;

beforeAll(async () => {
    await new DocumentStore(db).createTables();
    const config = defineConfig({
        adapter: expressAdapter(),
        jobRunner: {
            mode: 'in-process',
        },
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
                people: {
                    list: () => [
                        {
                            id: 'kari@hagen.example.com',
                            name: 'Kari Nordmann',
                        },
                        {
                            id: 'nils@hagen.example.com',
                            name: 'Nils Aas',
                        },
                    ],
                },
            },
        }),
    });
    app = express();
    config.api.mount(app);
    content = pluginExportsOf(config.api)['cms'] as CmsExports;
}, 30_000);

beforeEach(async () => {
    await pglite.exec('delete from cms_refs; delete from cms_versions; delete from cms_documents;');
    content.service.holds.clear();
});

afterAll(async () => {
    await pglite.close();
});

const save = (token: string, changes: Record<string, unknown>) =>
    request(app).patch('/editing/pages/frontPage/draft').set('authorization', `Bearer ${token}`).send({
        changes,
    });

describe('one editor per document', () => {
    it('lets the first to save hold it, and refuses a save from anyone else with 409 naming them', async () => {
        const first = await save('kari-token', {
            heading: 'Planter som blir hos deg',
        });
        expect(first.status).toBe(200);
        expect(first.body.heldBy).toBe('kari@hagen.example.com');

        const second = await save('nils-token', {
            intro: 'Levert neste dag.',
        });
        expect(second.status).toBe(409);
        expect(second.body.heldBy).toBe('kari@hagen.example.com');
        expect(second.body.detail).toContain('Kari Nordmann is editing');

        const draft = await request(app).get('/editing/pages/frontPage/draft').set('authorization', 'Bearer nils-token');
        expect(draft.body.content).toEqual({
            heading: 'Planter som blir hos deg',
        });
        expect(draft.body.heldBy).toBe('kari@hagen.example.com');
    });

    it('keeps taking the holder’s own saves', async () => {
        expect(
            (
                await save('kari-token', {
                    heading: 'Planter',
                })
            ).status
        ).toBe(200);
        expect(
            (
                await save('kari-token', {
                    intro: 'Levert neste dag.',
                })
            ).status
        ).toBe(200);
    });

    it('names the holder when the document is described', async () => {
        await save('kari-token', {
            heading: 'Planter',
        });
        const described = await request(app).get('/editing/describe?ref=page:frontPage').set('authorization', 'Bearer nils-token');
        expect(described.status).toBe(200);
        expect(described.body.heldBy).toBe('kari@hagen.example.com');
    });

    it('refuses publishing and unpublishing by anyone but the holder', async () => {
        await save('kari-token', {
            heading: 'Planter',
        });
        const published = await request(app).post('/editing/pages/frontPage/publish').set('authorization', 'Bearer nils-token').send({});
        expect(published.status).toBe(409);
        expect(published.body.heldBy).toBe('kari@hagen.example.com');
        expect(
            (await request(app).post('/editing/pages/frontPage/publish').set('authorization', 'Bearer kari-token').send({})).status
        ).toBe(200);
        expect(
            (await request(app).post('/editing/pages/frontPage/unpublish').set('authorization', 'Bearer nils-token').send({})).status
        ).toBe(409);
    });

    it('frees the document when its holder releases it, and ignores a release by anyone else', async () => {
        await save('kari-token', {
            heading: 'Planter',
        });
        expect((await request(app).delete('/editing/hold?ref=page:frontPage').set('authorization', 'Bearer nils-token')).status).toBe(204);
        expect(
            (
                await save('nils-token', {
                    intro: 'Levert neste dag.',
                })
            ).status
        ).toBe(409);
        expect((await request(app).delete('/editing/hold?ref=page:frontPage').set('authorization', 'Bearer kari-token')).status).toBe(204);
        const taken = await save('nils-token', {
            intro: 'Levert neste dag.',
        });
        expect(taken.status).toBe(200);
        expect(taken.body.heldBy).toBe('nils@hagen.example.com');
    });

    it('lasts two minutes after the holder’s last save', async () => {
        await save('kari-token', {
            heading: 'Planter',
        });
        const hold = content.service.holds.holder('page:frontPage');
        expect(hold?.until).toBeGreaterThan(Date.now() + HOLD_IDLE_MS - 5_000);
        expect(hold?.until).toBeLessThanOrEqual(Date.now() + HOLD_IDLE_MS);
    });
});
