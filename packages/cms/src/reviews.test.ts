import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { definePage } from './page.js';
import { cms as cmsContent } from './provider.js';
import { DocumentStore } from './storage/store.js';
import type { ReviewRequest } from './options.js';

const k = new Kizuna();
const roles = Kizuna.roles(['editor', 'admin']);

const TOKENS: Record<string, { userId: string; role: 'editor' | 'admin' }> = {
    'ada-token': {
        userId: 'ada',
        role: 'editor',
    },
    'kari-token': {
        userId: 'kari',
        role: 'editor',
    },
    'grace-token': {
        userId: 'grace',
        role: 'admin',
    },
};

const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
        roles,
    })
    .guard(({ bearer, deny }) => {
        const found = TOKENS[bearer?.token ?? ''];
        if (found !== undefined) return found;
        return deny({
            status: 401,
            body: {
                detail: 'Unauthorized',
            },
        });
    });

const FrontPage = definePage({
    name: 'frontPage',
    label: 'Front Page',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
    ],
});

const InvestorRelationsPage = definePage({
    name: 'investorRelationsPage',
    label: 'Investor Relations',
    requireReview: true,
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
    ],
});

let pglite: PGlite;
let app: express.Express;
const requested: ReviewRequest[] = [];

beforeAll(async () => {
    pglite = new PGlite();
    const db = drizzle(pglite);
    await new DocumentStore(db).createTables();
    const config = defineConfig({
        adapter: expressAdapter(),
        auth: {
            identities: {
                editor,
            },
        },
        content: cmsContent({
            db,
            pages: {
                frontPage: {
                    path: '/',
                    page: FrontPage,
                },
                investorRelationsPage: {
                    path: '/investor-relations',
                    page: InvestorRelationsPage,
                },
            },
            auth: {
                identity: 'editor',
                roles: ['editor', 'admin'],
                people: {
                    list: () => [
                        {
                            id: 'ada',
                            name: 'Ada Lovelace',
                            image: 'https://images.example.com/ada.jpg',
                        },
                        {
                            id: 'kari',
                            name: 'Kari Nordmann',
                        },
                        {
                            id: 'grace',
                            name: 'Grace Hopper',
                        },
                    ],
                    imageOrigins: ['https://images.example.com'],
                },
            },
            reviews: {
                roles: 'admin',
                onReviewRequested: (review) => {
                    requested.push(review);
                },
            },
            revalidate: () => undefined,
            appDir: 'src/__fixtures__/app',
        }),
    });
    app = express();
    config.api.mount(app);
});

beforeEach(async () => {
    await pglite.exec('delete from cms_reviews; delete from cms_refs; delete from cms_versions; delete from cms_documents;');
    requested.length = 0;
});

afterAll(async () => {
    await pglite.close();
});

const as = (who: 'ada' | 'kari' | 'grace', call: request.Test) => call.set('authorization', `Bearer ${who}-token`);

const draft = (who: 'ada' | 'kari' | 'grace', page: string, heading: string) =>
    as(who, request(app).patch(`/editing/pages/${page}/draft`)).send({
        changes: {
            heading,
        },
    });

describe('people and owners', () => {
    it('lists the people who edit, and who is asking', async () => {
        const response = await as('kari', request(app).get('/editing/people'));
        expect(response.status).toBe(200);
        expect(response.body.me).toBe('kari');
        expect(response.body.people[0]).toEqual({
            id: 'ada',
            name: 'Ada Lovelace',
            image: 'https://images.example.com/ada.jpg',
        });
    });

    it('names an owner, shown with their picture, and refuses someone who does not edit', async () => {
        await draft('ada', 'frontPage', 'Spring is here');
        const set = await as('ada', request(app).put('/editing/pages/frontPage/owner')).send({
            owner: 'ada',
        });
        expect(set.status).toBe(204);
        const described = await as('kari', request(app).get('/editing/describe?ref=page:frontPage'));
        expect(described.body.owner).toEqual({
            id: 'ada',
            name: 'Ada Lovelace',
            image: 'https://images.example.com/ada.jpg',
        });
        const unknown = await as('ada', request(app).put('/editing/pages/frontPage/owner')).send({
            owner: 'mallory',
        });
        expect(unknown.status).toBe(422);
    });
});

describe('reviews', () => {
    it('asks for a review of several documents in one request, and tells the reviewers', async () => {
        await draft('ada', 'frontPage', 'Spring is here');
        await draft('ada', 'investorRelationsPage', 'Results for Q3');
        const response = await as('ada', request(app).post('/editing/reviews')).send({
            refs: ['page:frontPage', 'page:investorRelationsPage'],
            reviewers: ['kari'],
            note: 'The new season copy',
        });
        expect(response.status).toBe(201);
        expect(response.body.reviews).toHaveLength(2);
        expect(requested).toEqual([
            {
                documents: [
                    {
                        ref: 'page:frontPage',
                        label: 'Front Page',
                        path: '/',
                    },
                    {
                        ref: 'page:investorRelationsPage',
                        label: 'Investor Relations',
                        path: '/investor-relations',
                    },
                ],
                reviewers: [
                    {
                        id: 'kari',
                        name: 'Kari Nordmann',
                    },
                ],
                requestedBy: {
                    id: 'ada',
                    name: 'Ada Lovelace',
                    image: 'https://images.example.com/ada.jpg',
                },
                note: 'The new season copy',
            },
        ]);

        const waiting = await as('kari', request(app).get('/editing/reviews'));
        expect(waiting.body.reviews.map((review: { label: string }) => review.label)).toEqual(['Front Page', 'Investor Relations']);
        expect((await as('ada', request(app).get('/editing/reviews'))).body.reviews).toEqual([]);
        expect((await as('ada', request(app).get('/editing/reviews?for=anyone'))).body.reviews).toHaveLength(2);
    });

    it('refuses a review of a document with nothing unpublished, and of someone who does not edit', async () => {
        const nothing = await as('ada', request(app).post('/editing/reviews')).send({
            refs: ['page:frontPage'],
            reviewers: ['kari'],
        });
        expect(nothing.status).toBe(409);
        await draft('ada', 'frontPage', 'Spring is here');
        const stranger = await as('ada', request(app).post('/editing/reviews')).send({
            refs: ['page:frontPage'],
            reviewers: ['mallory'],
        });
        expect(stranger.status).toBe(422);
    });

    it('holds a page that requires review until someone else approves the draft as it is', async () => {
        await draft('ada', 'investorRelationsPage', 'Results for Q3');
        const early = await as('ada', request(app).post('/editing/pages/investorRelationsPage/publish'));
        expect(early.status).toBe(409);
        expect(early.body.detail).toBe('Investor Relations needs an approval before it goes live. Ask someone to review it.');

        const asked = await as('ada', request(app).post('/editing/reviews')).send({
            refs: ['page:investorRelationsPage'],
            reviewers: ['kari'],
        });
        const id = asked.body.reviews[0].id;
        const waiting = await as('ada', request(app).post('/editing/pages/investorRelationsPage/publish'));
        expect(waiting.body.detail).toBe('Investor Relations is waiting for Kari Nordmann to approve it.');

        const approved = await as('kari', request(app).post('/editing/reviews/decide')).send({
            ids: [id],
            decision: 'approve',
        });
        expect(approved.status).toBe(200);
        expect(approved.body.reviews[0]).toMatchObject({
            status: 'approved',
            decidedBy: {
                id: 'kari',
            },
        });

        // A save after the approval needs a new one.
        await draft('ada', 'investorRelationsPage', 'Results for Q3, revised');
        const changed = await as('ada', request(app).get('/editing/pages/investorRelationsPage/changes'));
        expect(changed.body.review.status).toBe('outdated');
        expect((await as('ada', request(app).post('/editing/pages/investorRelationsPage/publish'))).status).toBe(409);

        const again = await as('ada', request(app).post('/editing/reviews')).send({
            refs: ['page:investorRelationsPage'],
            reviewers: ['kari'],
        });
        await as('kari', request(app).post('/editing/reviews/decide')).send({
            ids: [again.body.reviews[0].id],
            decision: 'approve',
        });
        const published = await as('ada', request(app).post('/editing/pages/investorRelationsPage/publish'));
        expect(published.status).toBe(200);
        const described = await as('ada', request(app).get('/editing/describe?ref=page:investorRelationsPage'));
        expect(described.body.review).toBeNull();

        // The next round of changes starts without a review.
        await draft('ada', 'investorRelationsPage', 'Results for Q4');
        const next = await as('ada', request(app).get('/editing/describe?ref=page:investorRelationsPage'));
        expect(next.body.review).toBeNull();
    });

    it('lets only a reviewer who was asked, or a role under reviews.roles, answer, and never the person who made the changes', async () => {
        await draft('ada', 'frontPage', 'Spring is here');
        const asked = await as('ada', request(app).post('/editing/reviews')).send({
            refs: ['page:frontPage'],
            reviewers: ['kari', 'ada'],
        });
        const id = asked.body.reviews[0].id;
        const self = await as('ada', request(app).post('/editing/reviews/decide')).send({
            ids: [id],
            decision: 'approve',
        });
        expect(self.status).toBe(403);
        expect(self.body.detail).toBe("You changed 'page:frontPage' yourself, so someone else approves it.");

        const admin = await as('grace', request(app).post('/editing/reviews/decide')).send({
            ids: [id],
            decision: 'requestChanges',
            note: 'The heading needs a date',
        });
        expect(admin.status).toBe(200);
        const described = await as('ada', request(app).get('/editing/describe?ref=page:frontPage'));
        expect(described.body.review).toMatchObject({
            status: 'changes',
            decisionNote: 'The heading needs a date',
            decidedBy: {
                name: 'Grace Hopper',
            },
        });
        const twice = await as('kari', request(app).post('/editing/reviews/decide')).send({
            ids: [id],
            decision: 'approve',
        });
        expect(twice.status).toBe(409);
    });

    it('refuses an editor who was not asked', async () => {
        await draft('ada', 'frontPage', 'Spring is here');
        const asked = await as('ada', request(app).post('/editing/reviews')).send({
            refs: ['page:frontPage'],
            reviewers: ['grace'],
        });
        const response = await as('kari', request(app).post('/editing/reviews/decide')).send({
            ids: [asked.body.reviews[0].id],
            decision: 'approve',
        });
        expect(response.status).toBe(403);
    });
});
