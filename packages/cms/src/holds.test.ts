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
import { DocumentHeldError, DocumentStore } from './storage/store.js';
import { HOLD_IDLE_MS } from './cms.js';

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

    it('names the holder in the changes Publish reads, so it holds the document back', async () => {
        await save('kari-token', {
            heading: 'Planter',
        });
        const changes = await request(app).get('/editing/pages/frontPage/changes').set('authorization', 'Bearer nils-token');
        expect(changes.status).toBe(200);
        expect(changes.body.heldBy).toBe('kari@hagen.example.com');
        await request(app).delete('/editing/hold?ref=page:frontPage').set('authorization', 'Bearer kari-token');
        expect(
            (await request(app).get('/editing/pages/frontPage/changes').set('authorization', 'Bearer nils-token')).body.heldBy
        ).toBeNull();
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

    it('lasts two minutes after the holder’s last save, and then goes to the next person to save', async () => {
        await save('kari-token', {
            heading: 'Planter',
        });
        const row = await content.service.store.get('page', 'frontPage');
        expect(row?.heldBy).toBe('kari@hagen.example.com');
        expect(row!.heldUntil!.getTime()).toBeGreaterThan(Date.now() + HOLD_IDLE_MS - 5_000);
        expect(row!.heldUntil!.getTime()).toBeLessThanOrEqual(Date.now() + HOLD_IDLE_MS);
        await pglite.exec(`update cms_documents set held_until = now() - interval '1 second'`);
        const taken = await save('nils-token', {
            intro: 'Levert neste dag.',
        });
        expect(taken.status).toBe(200);
        expect(taken.body.heldBy).toBe('nils@hagen.example.com');
    });

    it('is not taken by the app’s own writes, like a seed', async () => {
        await content.service.update({
            ref: {
                type: 'page',
                name: 'frontPage',
            },
            changes: {
                heading: 'Planter',
            },
            caller: {
                role: 'admin',
            },
            author: 'seed',
        });
        expect((await content.service.draftState({ type: 'page', name: 'frontPage' })).heldBy).toBeNull();
        expect(
            (
                await save('nils-token', {
                    intro: 'Levert neste dag.',
                })
            ).status
        ).toBe(200);
    });

    it('is kept in the database, so a write through another server instance is refused too', async () => {
        await save('kari-token', {
            heading: 'Planter',
        });
        const elsewhere = new DocumentStore(db);
        await expect(
            elsewhere.saveDraft({
                kind: 'page',
                key: 'frontPage',
                draft: {
                    heading: 'Planter',
                    intro: 'Levert neste dag.',
                },
                author: 'nils@hagen.example.com',
                hold: HOLD_IDLE_MS,
            })
        ).rejects.toBeInstanceOf(DocumentHeldError);
    });
});
