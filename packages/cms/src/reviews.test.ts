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
                            roles: ['admin'],
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
    await pglite.exec(
        'delete from cms_review_comments; delete from cms_reviews; delete from cms_refs; delete from cms_versions; delete from cms_documents;'
    );
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
        expect(response.body.people[2]).toEqual({
            id: 'grace',
            name: 'Grace Hopper',
            roles: ['admin'],
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

    it('lets a role under reviews.roles publish past an open review, and records who did', async () => {
        await draft('ada', 'investorRelationsPage', 'Results for Q3');
        const asked = await as('ada', request(app).post('/editing/reviews')).send({
            refs: ['page:investorRelationsPage'],
            reviewers: ['kari'],
        });
        const changes = await as('grace', request(app).get('/editing/pages/investorRelationsPage/changes'));
        expect(changes.body.canPublishPastReview).toBe(true);

        const published = await as('grace', request(app).post('/editing/pages/investorRelationsPage/publish')).send({
            force: true,
        });
        expect(published.status).toBe(200);
        expect(published.body.status).toBe('published');
        const [record] = await new DocumentStore(drizzle(pglite)).reviews([asked.body.reviews[0].id]);
        expect(record).toMatchObject({
            status: 'published-past-review',
            decidedBy: 'grace',
            decisionNote: null,
        });
        const history = await as('ada', request(app).get('/editing/pages/investorRelationsPage/versions'));
        expect(history.body.versions[0]).toMatchObject({
            published: true,
            review: {
                status: 'published-past-review',
                by: {
                    name: 'Grace Hopper',
                },
            },
        });
        expect((await as('kari', request(app).get('/editing/reviews'))).body.reviews).toEqual([]);
    });

    it('records a publish past a review nobody asked for', async () => {
        await draft('ada', 'investorRelationsPage', 'Results for Q3');
        const published = await as('grace', request(app).post('/editing/pages/investorRelationsPage/publish')).send({
            force: true,
        });
        expect(published.status).toBe(200);
        const rows = await pglite.query<{ decided_by: string; decision_note: string; status: string }>(
            'select decided_by, decision_note, status from cms_reviews'
        );
        expect(rows.rows).toEqual([
            {
                decided_by: 'grace',
                decision_note: null,
                status: 'published-past-review',
            },
        ]);

        // The next round of changes starts without a review.
        await draft('ada', 'investorRelationsPage', 'Results for Q4');
        const next = await as('ada', request(app).get('/editing/describe?ref=page:investorRelationsPage'));
        expect(next.body.review).toBeNull();
    });

    it('ignores force from anyone without a role under reviews.roles', async () => {
        await draft('ada', 'investorRelationsPage', 'Results for Q3');
        await as('ada', request(app).post('/editing/reviews')).send({
            refs: ['page:investorRelationsPage'],
            reviewers: ['grace'],
        });
        const changes = await as('kari', request(app).get('/editing/pages/investorRelationsPage/changes'));
        expect(changes.body.canPublishPastReview).toBe(false);
        const refused = await as('kari', request(app).post('/editing/pages/investorRelationsPage/publish')).send({
            force: true,
        });
        expect(refused.status).toBe(409);
        expect(refused.body.detail).toBe('Investor Relations is waiting for Grace Hopper to approve it.');
        const rows = await pglite.query<{ status: string }>('select status from cms_reviews');
        expect(rows.rows).toEqual([
            {
                status: 'open',
            },
        ]);
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

describe('changing a review', () => {
    const ask = async (page = 'investorRelationsPage') => {
        await draft('ada', page, 'Results for Q3');
        const asked = await as('ada', request(app).post('/editing/reviews')).send({
            refs: [`page:${page}`],
            reviewers: ['kari'],
        });
        return asked.body.reviews[0].id as string;
    };

    it('lets the person who asked withdraw an open review, and nobody else', async () => {
        const id = await ask();
        const stranger = await as('kari', request(app).post('/editing/reviews/withdraw')).send({
            ids: [id],
        });
        expect(stranger.status).toBe(403);
        const withdrawn = await as('ada', request(app).post('/editing/reviews/withdraw')).send({
            ids: [id],
        });
        expect(withdrawn.status).toBe(200);
        expect(withdrawn.body.reviews[0]).toMatchObject({
            status: 'withdrawn',
            decidedBy: {
                id: 'ada',
            },
        });
        const described = await as('ada', request(app).get('/editing/describe?ref=page:investorRelationsPage'));
        expect(described.body.review).toBeNull();
        expect((await as('kari', request(app).get('/editing/reviews'))).body.reviews).toEqual([]);
        const twice = await as('ada', request(app).post('/editing/reviews/withdraw')).send({
            ids: [id],
        });
        expect(twice.status).toBe(409);
    });

    it('refuses to withdraw a review that was answered', async () => {
        const id = await ask();
        await as('kari', request(app).post('/editing/reviews/decide')).send({
            ids: [id],
            decision: 'approve',
        });
        const response = await as('ada', request(app).post('/editing/reviews/withdraw')).send({
            ids: [id],
        });
        expect(response.status).toBe(409);
    });

    it('lets the reviewer undo their approval until the draft is published', async () => {
        const id = await ask();
        await as('kari', request(app).post('/editing/reviews/decide')).send({
            ids: [id],
            decision: 'approve',
            note: 'Looks right',
        });
        const someoneElse = await as('grace', request(app).post('/editing/reviews/reopen')).send({
            ids: [id],
        });
        expect(someoneElse.status).toBe(403);

        const reopened = await as('kari', request(app).post('/editing/reviews/reopen')).send({
            ids: [id],
        });
        expect(reopened.status).toBe(200);
        expect(reopened.body.reviews[0]).toMatchObject({
            status: 'open',
            decidedBy: null,
            decisionNote: null,
        });
        expect((await as('ada', request(app).post('/editing/pages/investorRelationsPage/publish'))).status).toBe(409);
        expect((await as('kari', request(app).get('/editing/reviews'))).body.reviews).toHaveLength(1);

        await as('kari', request(app).post('/editing/reviews/decide')).send({
            ids: [id],
            decision: 'approve',
        });
        expect((await as('ada', request(app).post('/editing/pages/investorRelationsPage/publish'))).status).toBe(200);
        const late = await as('kari', request(app).post('/editing/reviews/reopen')).send({
            ids: [id],
        });
        expect(late.status).toBe(409);
        const history = await as('ada', request(app).get('/editing/pages/investorRelationsPage/versions'));
        expect(history.body.versions[0].review).toMatchObject({
            status: 'approved',
            by: {
                id: 'kari',
            },
        });
    });

    it('refuses to undo a review that asked for changes', async () => {
        const id = await ask();
        await as('kari', request(app).post('/editing/reviews/decide')).send({
            ids: [id],
            decision: 'requestChanges',
            note: 'Add the date',
        });
        const response = await as('kari', request(app).post('/editing/reviews/reopen')).send({
            ids: [id],
        });
        expect(response.status).toBe(409);
    });
});

describe('comments on a field', () => {
    it('keeps comments from the reviewer and the person who asked under their field, until someone resolves them', async () => {
        await draft('ada', 'frontPage', 'Spring is here');
        const asked = await as('ada', request(app).post('/editing/reviews')).send({
            refs: ['page:frontPage'],
            reviewers: ['kari'],
        });
        const id = asked.body.reviews[0].id;
        const commented = await as('kari', request(app).post('/editing/reviews/comments')).send({
            review: id,
            path: 'heading',
            text: 'Say which spring',
        });
        expect(commented.status).toBe(201);
        expect(commented.body.comments).toMatchObject([
            {
                path: 'heading',
                text: 'Say which spring',
                by: {
                    id: 'kari',
                },
                resolvedBy: null,
            },
        ]);
        const answered = await as('ada', request(app).post('/editing/reviews/comments')).send({
            review: id,
            path: 'heading',
            text: 'Spring 2027 it is',
        });
        expect(answered.status).toBe(201);

        const described = await as('ada', request(app).get('/editing/describe?ref=page:frontPage'));
        expect(described.body.review.comments.map((comment: { text: string }) => comment.text)).toEqual([
            'Say which spring',
            'Spring 2027 it is',
        ]);

        const commentId = described.body.review.comments[0].id;
        const resolved = await as('ada', request(app).post(`/editing/reviews/comments/${commentId}/resolve`));
        expect(resolved.status).toBe(200);
        expect(resolved.body.comments[0]).toMatchObject({
            resolvedBy: {
                id: 'ada',
            },
        });
        expect((await as('ada', request(app).post(`/editing/reviews/comments/${commentId}/resolve`))).status).toBe(200);
    });

    it('refuses someone outside the review, and a field the document does not have', async () => {
        await draft('ada', 'frontPage', 'Spring is here');
        const asked = await as('ada', request(app).post('/editing/reviews')).send({
            refs: ['page:frontPage'],
            reviewers: ['grace'],
        });
        const id = asked.body.reviews[0].id;
        const outsider = await as('kari', request(app).post('/editing/reviews/comments')).send({
            review: id,
            path: 'heading',
            text: 'Looks fine',
        });
        expect(outsider.status).toBe(403);
        const unknown = await as('grace', request(app).post('/editing/reviews/comments')).send({
            review: id,
            path: 'subheading',
            text: 'Add one',
        });
        expect(unknown.status).toBe(422);
    });

    it('keeps comments when the reviewer is asked again, and clears them once the draft is published', async () => {
        await draft('ada', 'frontPage', 'Spring is here');
        const asked = await as('ada', request(app).post('/editing/reviews')).send({
            refs: ['page:frontPage'],
            reviewers: ['kari'],
        });
        const id = asked.body.reviews[0].id;
        await as('kari', request(app).post('/editing/reviews/comments')).send({
            review: id,
            path: 'heading',
            text: 'Say which spring',
        });
        await as('kari', request(app).post('/editing/reviews/decide')).send({
            ids: [id],
            decision: 'requestChanges',
            note: 'See the heading',
        });
        await draft('ada', 'frontPage', 'Spring 2027 is here');
        const again = await as('ada', request(app).post('/editing/reviews')).send({
            refs: ['page:frontPage'],
            reviewers: ['kari'],
        });
        expect(again.body.reviews[0].comments).toHaveLength(1);

        await as('kari', request(app).post('/editing/reviews/decide')).send({
            ids: [again.body.reviews[0].id],
            decision: 'approve',
        });
        await as('ada', request(app).post('/editing/pages/frontPage/publish'));
        const late = await as('kari', request(app).post('/editing/reviews/comments')).send({
            review: again.body.reviews[0].id,
            path: 'heading',
            text: 'One more thing',
        });
        expect(late.status).toBe(409);

        await draft('ada', 'frontPage', 'Summer is here');
        const next = await as('ada', request(app).post('/editing/reviews')).send({
            refs: ['page:frontPage'],
            reviewers: ['kari'],
        });
        expect(next.body.reviews[0].comments).toEqual([]);
    });
});

describe('storage', () => {
    it('reads a publish past a review recorded as an approval with a note as published past the review, and creates the tables again', async () => {
        await draft('ada', 'investorRelationsPage', 'Results for Q3');
        await as('ada', request(app).post('/editing/reviews')).send({
            refs: ['page:investorRelationsPage'],
            reviewers: ['kari'],
        });
        await pglite.exec(
            "update cms_reviews set status = 'approved', decided_by = 'grace', decision_note = 'Published past the review by Grace Hopper.'"
        );
        await new DocumentStore(drizzle(pglite)).createTables();
        const rows = await pglite.query<{ status: string; decision_note: string | null }>('select status, decision_note from cms_reviews');
        expect(rows.rows).toEqual([
            {
                status: 'published-past-review',
                decision_note: null,
            },
        ]);
    });
});
