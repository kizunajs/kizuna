import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { cms } from './provider.js';
import { definePages } from './options.js';
import { declareSites, SiteSchema } from './site.js';
import { DocumentStore } from './storage/store.js';
import { runDue } from './schedules.js';
import type { CmsExports } from './setup.js';

const k = new Kizuna();
const EDITORS: Record<string, { userId: string; sites: Record<string, 'editor' | 'admin'>; role: 'editor' | 'admin' }> = {
    'mia-token': {
        userId: 'mia',
        sites: {},
        role: 'admin',
    },
    'nils-token': {
        userId: 'nils',
        sites: {
            norway: 'admin',
        },
        role: 'editor',
    },
    'kari-token': {
        userId: 'kari',
        sites: {
            norway: 'editor',
        },
        role: 'editor',
    },
};
const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
            sites: z.record(z.string(), z.enum(['editor', 'admin'])),
        }),
        roles: Kizuna.roles(['editor', 'admin']),
    })
    .guard(
        ({ bearer, deny }) =>
            EDITORS[bearer?.token ?? ''] ??
            deny({
                status: 401,
                body: {
                    detail: 'Unauthorized',
                },
            })
    );

const FrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'heading',
            schema: z.string().min(1),
        },
    ],
});

const StoresPage = definePage({
    name: 'storesPage',
    fields: [
        {
            name: 'heading',
            schema: z.string().min(1),
        },
        {
            name: 'intro',
            schema: z.string().min(1),
        },
    ],
});

const PressPage = definePage({
    name: 'pressPage',
    requireReview: true,
    fields: [
        {
            name: 'heading',
            schema: z.string().min(1),
        },
    ],
});

const Offices = defineCollection({
    name: 'offices',
    id: Kizuna.brand('OfficeId', z.string()),
    fields: [
        {
            name: 'city',
            schema: z.string().min(1),
        },
    ],
});

const pages = definePages({
    frontPage: {
        path: '/',
        page: FrontPage,
    },
    pressPage: {
        path: '/press',
        page: PressPage,
    },
    storesPage: {
        path: '/stores',
        page: StoresPage,
    },
});

const sites = declareSites(SiteSchema, {
    uk: {
        label: 'Hagen UK',
        url: 'https://hagen.example.co.uk',
        icon: '/icons/uk.svg',
        pages,
    },
    norway: {
        label: 'Hagen Norge',
        url: 'https://hagen.example.no',
        icon: '/icons/norway.svg',
        pages,
    },
});

const pglite = new PGlite();
const db = drizzle(pglite);
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
        sites,
        site: () => 'norway',
        collections: [Offices],
        auth: {
            identity: 'editor',
            roles: ['editor', 'admin'],
            sites: (signedIn) => signedIn.sites,
            people: {
                list: () => [
                    {
                        id: 'mia',
                        name: 'Mia Holm',
                        roles: ['admin'],
                    },
                    {
                        id: 'nils',
                        name: 'Nils Aas',
                        roles: ['editor'],
                        sites: {
                            norway: 'admin',
                        },
                    },
                    {
                        id: 'kari',
                        name: 'Kari Nordmann',
                        roles: ['editor'],
                        sites: {
                            norway: 'editor',
                        },
                    },
                ],
            },
        },
        reviews: {
            roles: 'admin',
        },
    }),
});
const service = (pluginExportsOf(config.api)['cms'] as CmsExports).service;
const app = express();
app.use(express.json());
config.api.mount(app);

const as = (who: 'mia' | 'nils' | 'kari', call: request.Test) => call.set('authorization', `Bearer ${who}-token`);
const FRONT = '/editing/sites/norway/pages/frontPage';
const PRESS = '/editing/sites/norway/pages/pressPage';
const STORES = '/editing/sites/norway/pages/storesPage';
const inAnHour = () => new Date(Date.now() + 60 * 60_000);
const later = (at: Date) => new Date(at.getTime() + 60_000);

/**
 * Saves a draft as someone, then lets go of the document, as the hold would
 * two minutes later.
 */
const save = async (who: 'mia' | 'nils' | 'kari', path: string, changes: Record<string, unknown>) => {
    const answer = await as(who, request(app).patch(`${path}/draft`)).send({
        changes,
    });
    expect(answer.status).toBe(200);
    await service.releaseHold((await service.draftState(service.canonical(refFor(path)))).target.ref, who);
    return answer.body;
};

const refFor = (path: string) => {
    if (path.startsWith('/editing/sites/')) {
        const [, , , site, , name] = path.split('/');
        return {
            type: 'page' as const,
            site: site!,
            name: name!,
        };
    }
    const [, , , collection, , id] = path.split('/');
    return {
        type: 'item' as const,
        collection: collection!,
        id: id!,
    };
};

const draftOf = async (who: 'mia' | 'nils' | 'kari', path: string) => (await as(who, request(app).get(`${path}/draft`))).body;

const schedule = (who: 'mia' | 'nils' | 'kari', path: string, at: Date, action: 'publish' | 'unpublish' = 'publish') =>
    as(who, request(app).put(`${path}/schedule`)).send({
        action,
        at: at.toISOString(),
    });

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    // Every site answers its refresh.
    vi.stubGlobal(
        'fetch',
        async () =>
            new Response(null, {
                status: 204,
            })
    );
    await pglite.exec(
        'delete from cms_schedules; delete from cms_releases; delete from cms_refreshes; delete from cms_review_comments; delete from cms_reviews; delete from cms_refs; delete from cms_versions; delete from cms_documents;'
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
});

afterAll(async () => {
    await pglite.close();
});

describe('scheduling one document', () => {
    it('publishes the draft at its time, and the draft carries the schedule until then', async () => {
        await save('kari', FRONT, {
            heading: 'Planter som blir hos deg',
        });
        const at = inAnHour();
        const scheduled = await schedule('nils', FRONT, at);
        expect(scheduled.status).toBe(200);
        expect(scheduled.body).toMatchObject({
            ref: 'page:norway:frontPage',
            action: 'publish',
            at: at.toISOString(),
            state: 'scheduled',
            waitingFor: null,
            scheduledBy: {
                name: 'Nils Aas',
            },
        });
        expect((await draftOf('nils', FRONT)).schedule).toEqual({
            action: 'publish',
            at: at.toISOString(),
            release: null,
            by: 'nils',
        });

        expect(await runDue(service, new Date())).toEqual({
            published: 0,
            held: 0,
        });
        expect((await draftOf('nils', FRONT)).status).toBe('draft');

        expect(await runDue(service, later(at))).toEqual({
            published: 1,
            held: 0,
        });
        const draft = await draftOf('nils', FRONT);
        expect(draft.status).toBe('published');
        expect(draft.schedule).toBeNull();
    });

    it('publishes the draft as it stands when the time comes, saves after scheduling included', async () => {
        await save('kari', FRONT, {
            heading: 'Planter som blir hos deg',
        });
        const at = inAnHour();
        await schedule('nils', FRONT, at);
        await save('kari', FRONT, {
            heading: 'Planter som blir hos deg, nå også i Trondheim',
        });
        await runDue(service, later(at));
        expect((await service.published(refFor(FRONT)))?.content).toEqual({
            heading: 'Planter som blir hos deg, nå også i Trondheim',
        });
    });

    it('refuses a time that has passed', async () => {
        await save('kari', FRONT, {
            heading: 'Planter',
        });
        const answer = await schedule('nils', FRONT, new Date(Date.now() - 60_000));
        expect(answer.status).toBe(422);
    });

    it('ends the schedule when someone publishes by hand', async () => {
        await save('kari', FRONT, {
            heading: 'Planter',
        });
        const at = inAnHour();
        await schedule('nils', FRONT, at);
        expect((await as('nils', request(app).post(`${FRONT}/publish`)).send({})).status).toBe(200);
        expect((await draftOf('nils', FRONT)).schedule).toBeNull();
        expect(await runDue(service, later(at))).toEqual({
            published: 0,
            held: 0,
        });
    });

    it('cancels a schedule and keeps the draft', async () => {
        await save('kari', FRONT, {
            heading: 'Planter',
        });
        await schedule('nils', FRONT, inAnHour());
        expect((await as('nils', request(app).delete(`${FRONT}/schedule`))).status).toBe(204);
        expect((await as('nils', request(app).delete(`${FRONT}/schedule`))).status).toBe(404);
        const draft = await draftOf('nils', FRONT);
        expect(draft.schedule).toBeNull();
        expect(draft.status).toBe('draft');
    });

    it('unpublishes at its time', async () => {
        await save('kari', FRONT, {
            heading: 'Planter',
        });
        await as('nils', request(app).post(`${FRONT}/publish`)).send({});
        const at = inAnHour();
        expect((await schedule('nils', FRONT, at, 'unpublish')).body.action).toBe('unpublish');
        await runDue(service, later(at));
        expect(await service.published(refFor(FRONT))).toBeUndefined();
    });

    it('waits while a draft misses a field, and runs on the first tick after it is filled', async () => {
        await save('kari', STORES, {
            heading: 'Butikkene våre',
        });
        const at = inAnHour();
        await schedule('nils', STORES, at);
        expect(await runDue(service, later(at))).toEqual({
            published: 0,
            held: 1,
        });
        const listed = await as('nils', request(app).get('/editing/schedules')).query({
            site: 'norway',
        });
        expect(listed.body.schedules[0]).toMatchObject({
            state: 'waiting',
            waitingFor: 'intro',
        });
        await save('kari', STORES, {
            intro: 'Oslo, Bergen og Trondheim.',
        });
        expect((await runDue(service, later(at))).published).toBe(1);
    });

    it('publishes once when two ticks run together', async () => {
        await save('kari', FRONT, {
            heading: 'Planter',
        });
        const at = inAnHour();
        await schedule('nils', FRONT, at);
        const [first, second] = await Promise.all([runDue(service, later(at)), runDue(service, later(at))]);
        expect(first.published + second.published).toBe(1);
        expect((await service.history(refFor(FRONT))).filter((version) => version.published)).toHaveLength(1);
    });

    it('lists only what changes on the site asked for', async () => {
        await save('mia', '/editing/sites/uk/pages/frontPage', {
            heading: 'Plants that stay with you',
        });
        await schedule('mia', '/editing/sites/uk/pages/frontPage', inAnHour());
        await save('kari', FRONT, {
            heading: 'Planter',
        });
        await schedule('nils', FRONT, inAnHour());
        const norway = await as('mia', request(app).get('/editing/schedules')).query({
            site: 'norway',
        });
        expect(norway.body.schedules.map((row: { ref: string }) => row.ref)).toEqual(['page:norway:frontPage']);
        const kari = await as('kari', request(app).get('/editing/schedules'));
        expect(kari.body.schedules.map((row: { ref: string }) => row.ref)).toEqual(['page:norway:frontPage']);
    });
});

describe('a schedule meets a required review', () => {
    it('waits for the approval, holds past its time, and publishes on the tick after someone approves', async () => {
        await save('kari', PRESS, {
            heading: 'Vi åpner i Trondheim',
        });
        const at = inAnHour();
        expect((await schedule('kari', PRESS, at)).body).toMatchObject({
            state: 'waiting',
            waitingFor: 'a review',
        });
        const asked = await as('kari', request(app).post('/editing/reviews')).send({
            refs: ['page:norway:pressPage'],
            reviewers: ['nils'],
        });
        expect(asked.status).toBe(201);
        const listed = await as('kari', request(app).get('/editing/schedules'));
        expect(listed.body.schedules[0].waitingFor).toBe('Nils Aas to approve');

        expect(await runDue(service, later(at))).toEqual({
            published: 0,
            held: 1,
        });
        vi.useFakeTimers({
            toFake: ['Date'],
            now: later(at),
        });
        const held = await as('kari', request(app).get('/editing/schedules'));
        vi.useRealTimers();
        expect(held.body.schedules[0]).toMatchObject({
            state: 'held',
            waitingFor: 'Nils Aas to approve',
        });
        expect((await draftOf('kari', PRESS)).status).toBe('draft');

        const decided = await as('nils', request(app).post('/editing/reviews/decide')).send({
            ids: [asked.body.reviews[0].id],
            decision: 'approve',
        });
        expect(decided.status).toBe(200);
        expect((await runDue(service, later(at))).published).toBe(1);
        expect((await draftOf('kari', PRESS)).status).toBe('published');
    });
});

describe('releases', () => {
    const office = async (city: string): Promise<string> => {
        const created = await as('mia', request(app).post('/editing/collections/offices/items')).send({
            values: {
                city,
            },
        });
        expect(created.status).toBe(201);
        const ref = created.body.ref as string;
        await service.releaseHold(service.canonical(refFor(`/editing/collections/offices/items/${ref.split(':').pop()}`)), 'mia');
        return ref;
    };

    it('publishes every document together at its time, and holds them all while one would not publish', async () => {
        await save('kari', FRONT, {
            heading: 'Planter som blir hos deg, nå også i Trondheim',
        });
        await save('kari', STORES, {
            heading: 'Butikkene våre',
        });
        const officeRef = await office('Trondheim');
        const created = await as('nils', request(app).post('/editing/releases')).send({
            name: 'Trondheim opening',
            refs: ['page:norway:frontPage', 'page:norway:storesPage', officeRef],
        });
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({
            name: 'Trondheim opening',
            state: 'open',
            mayPublish: false,
        });
        expect(created.body.documents.map((document: { ref: string }) => document.ref)).toEqual([
            'page:norway:frontPage',
            'page:norway:storesPage',
            officeRef,
        ]);
        expect((await draftOf('kari', FRONT)).schedule).toMatchObject({
            release: {
                name: 'Trondheim opening',
            },
        });

        const id = created.body.id as string;
        const at = inAnHour();
        const refused = await as('nils', request(app).put(`/editing/releases/${id}/schedule`)).send({
            at: at.toISOString(),
        });
        expect(refused.status).toBe(403);
        const scheduled = await as('mia', request(app).put(`/editing/releases/${id}/schedule`)).send({
            at: at.toISOString(),
        });
        expect(scheduled.status).toBe(200);
        expect(scheduled.body).toMatchObject({
            state: 'waiting',
            waiting: 1,
        });

        expect(await runDue(service, later(at))).toEqual({
            published: 0,
            held: 1,
        });
        expect(await service.published(refFor(FRONT))).toBeUndefined();

        await save('kari', STORES, {
            intro: 'Oslo, Bergen og Trondheim.',
        });
        expect(await runDue(service, later(at))).toEqual({
            published: 3,
            held: 0,
        });
        expect((await draftOf('kari', FRONT)).status).toBe('published');
        expect((await as('mia', request(app).get(`/editing/releases/${id}`))).body.state).toBe('published');
    });

    it('shows a site editor nothing of the documents on sites they cannot open', async () => {
        await save('kari', FRONT, {
            heading: 'Planter',
        });
        await save('mia', '/editing/sites/uk/pages/frontPage', {
            heading: 'Plants',
        });
        const created = await as('mia', request(app).post('/editing/releases')).send({
            name: 'Winter',
            refs: ['page:norway:frontPage', 'page:uk:frontPage'],
        });
        const seen = await as('kari', request(app).get(`/editing/releases/${created.body.id}`));
        expect(seen.status).toBe(200);
        expect(seen.body.documents.map((document: { ref: string }) => document.ref)).toEqual(['page:norway:frontPage']);
        expect(JSON.stringify(seen.body)).not.toContain('uk');
        expect(seen.body.mayPublish).toBe(false);
    });

    it('keeps a document in one schedule at a time', async () => {
        await save('kari', FRONT, {
            heading: 'Planter',
        });
        await schedule('nils', FRONT, inAnHour());
        const created = await as('nils', request(app).post('/editing/releases')).send({
            name: 'Trondheim opening',
            refs: ['page:norway:frontPage'],
        });
        expect(created.status).toBe(409);
    });

    it('publishes now, removes a document, and deletes a release with its drafts kept', async () => {
        await save('kari', FRONT, {
            heading: 'Planter',
        });
        const officeRef = await office('Trondheim');
        const created = await as('mia', request(app).post('/editing/releases')).send({
            name: 'Trondheim opening',
            refs: ['page:norway:frontPage', officeRef],
        });
        const id = created.body.id as string;
        const removed = await as('mia', request(app).post(`/editing/releases/${id}/remove`)).send({
            refs: [officeRef],
        });
        expect(removed.body.documents).toHaveLength(1);
        const published = await as('mia', request(app).post(`/editing/releases/${id}/publish`)).send({});
        expect(published.status).toBe(200);
        expect(published.body.state).toBe('published');
        expect((await draftOf('kari', FRONT)).status).toBe('published');

        const other = await as('mia', request(app).post('/editing/releases')).send({
            name: 'Julelevering',
            refs: [officeRef],
        });
        expect((await as('mia', request(app).delete(`/editing/releases/${other.body.id}`))).status).toBe(204);
        expect((await as('mia', request(app).get(`/editing/releases/${other.body.id}`))).status).toBe(404);
    });
});
