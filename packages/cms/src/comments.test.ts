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
import { richTextFromPlain, RichTextSchema } from './rich-text.js';
import { DocumentStore } from './storage/store.js';
import { textOf } from './comments.js';

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
        {
            name: 'body',
            schema: RichTextSchema.optional(),
        },
        {
            name: 'featured',
            schema: z.boolean().optional(),
        },
    ],
});

let pglite: PGlite;
let app: express.Express;

beforeAll(async () => {
    pglite = new PGlite();
    const db = drizzle(pglite);
    await new DocumentStore(db).createTables();
    const config = defineConfig({
        jobRunner: {
            mode: 'in-process',
        },
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
            },
            auth: {
                identity: 'editor',
                roles: ['editor', 'admin'],
                people: {
                    list: () => [
                        {
                            id: 'ada',
                            name: 'Ada Lovelace',
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
        'delete from cms_comments; delete from cms_reviews; delete from cms_refs; delete from cms_versions; delete from cms_documents;'
    );
});

afterAll(async () => {
    await pglite.close();
});

// Each step is someone who saved and left, so the next person finds the document free.
let lastWho: string | undefined;
const as = (who: 'ada' | 'kari' | 'grace', call: request.Test) => {
    if (who !== lastWho) void pglite.exec('update cms_documents set held_by = null, held_since = null, held_until = null');
    lastWho = who;
    return call.set('authorization', `Bearer ${who}-token`);
};

const draft = (who: 'ada' | 'kari' | 'grace', changes: Record<string, unknown>) =>
    as(who, request(app).patch('/editing/pages/frontPage/draft')).send({
        changes,
    });

const comment = (who: 'ada' | 'kari' | 'grace', body: Record<string, unknown>) =>
    as(who, request(app).post('/editing/comments')).send({
        ref: 'page:frontPage',
        ...body,
    });

const listed = async (who: 'ada' | 'kari' | 'grace') =>
    (await as(who, request(app).get('/editing/comments?ref=page:frontPage'))).body.comments as Array<Record<string, any>>;

const waiting = async (who: 'ada' | 'kari' | 'grace') =>
    (await as(who, request(app).get('/editing/comments/waiting'))).body.comments as Array<Record<string, any>>;

describe('comments on a draft', () => {
    it('anchors a comment to a phrase, and marks the text changed once the phrase is gone', async () => {
        await draft('ada', {
            heading: 'Spring opens in Bergen',
        });
        const added = await comment('kari', {
            path: 'heading',
            anchor: 'in Bergen',
            text: 'Bergen opened in March 2021.',
        });
        expect(added.status).toBe(201);
        expect(added.body).toMatchObject({
            path: 'heading',
            text: 'Bergen opened in March 2021.',
            by: {
                id: 'kari',
                name: 'Kari Nordmann',
            },
            via: null,
            review: null,
            replyTo: null,
            anchor: {
                text: 'in Bergen',
                changed: false,
            },
        });

        await draft('ada', {
            heading: 'Spring opens in Oslo',
        });
        expect(await listed('ada')).toMatchObject([
            {
                id: added.body.id,
                anchor: {
                    text: 'in Bergen',
                    changed: true,
                },
            },
        ]);
    });

    it('anchors to a phrase in rich text', async () => {
        await draft('ada', {
            heading: 'Spring',
            body: richTextFromPlain('Our shops open at nine.\nThe café opens at ten.'),
        });
        const added = await comment('kari', {
            path: 'body',
            anchor: 'opens at ten',
            text: 'Eleven on Sundays.',
        });
        expect(added.status).toBe(201);
        expect(added.body.anchor).toEqual({
            text: 'opens at ten',
            changed: false,
        });
    });

    it('refuses a phrase the field does not hold, a field that holds no text, an unknown field and a document with no draft', async () => {
        const early = await comment('kari', {
            path: 'heading',
            text: 'Name the season',
        });
        expect(early.status).toBe(409);
        await draft('ada', {
            heading: 'Spring opens in Bergen',
            featured: true,
        });
        const missing = await comment('kari', {
            path: 'heading',
            anchor: 'in Oslo',
            text: 'Which city?',
        });
        expect(missing.status).toBe(422);
        expect(missing.body.detail).toContain('in Oslo');
        expect(
            (
                await comment('kari', {
                    path: 'featured',
                    anchor: 'true',
                    text: 'Why?',
                })
            ).status
        ).toBe(422);
        expect(
            (
                await comment('kari', {
                    path: 'subheading',
                    text: 'Add one',
                })
            ).status
        ).toBe(422);
        expect(
            (
                await comment('kari', {
                    text: 'Somewhere',
                })
            ).status
        ).toBe(422);
    });

    it('answers a thread on its field, and resolves the thread from any of its comments', async () => {
        await draft('ada', {
            heading: 'Spring opens in Bergen',
        });
        const started = await comment('kari', {
            path: 'heading',
            anchor: 'Bergen',
            text: 'Which shop?',
        });
        const answer = await comment('ada', {
            replyTo: started.body.id,
            text: 'Bryggen.',
        });
        expect(answer.status).toBe(201);
        expect(answer.body).toMatchObject({
            path: 'heading',
            replyTo: started.body.id,
            anchor: {
                text: 'Bergen',
            },
        });
        const nested = await comment('kari', {
            replyTo: answer.body.id,
            text: 'Thanks.',
        });
        expect(nested.body.replyTo).toBe(started.body.id);
        expect(
            (
                await comment('kari', {
                    replyTo: started.body.id,
                    path: 'body',
                    text: 'Elsewhere',
                })
            ).status
        ).toBe(422);

        const resolved = await as('ada', request(app).post(`/editing/comments/${answer.body.id}/resolve`));
        expect(resolved.status).toBe(200);
        expect(resolved.body).toMatchObject({
            id: started.body.id,
            resolvedBy: {
                id: 'ada',
            },
        });
        expect((await listed('ada')).every((candidate) => candidate['resolvedBy']?.id === 'ada')).toBe(true);
        expect((await as('ada', request(app).post(`/editing/comments/${started.body.id}/resolve`))).status).toBe(200);
        expect(
            (
                await comment('kari', {
                    replyTo: started.body.id,
                    text: 'One more',
                })
            ).status
        ).toBe(409);
        expect((await as('ada', request(app).post('/editing/comments/nothing/resolve'))).status).toBe(404);
    });

    it('lists a thread under Waiting for the people it mentions and its assignee, until it is resolved', async () => {
        await draft('ada', {
            heading: 'Spring opens in Bergen',
        });
        const mentioned = await comment('ada', {
            path: 'heading',
            anchor: 'Bergen',
            text: '@Kari Nordmann is this the right city?',
            mentions: ['kari'],
        });
        expect(mentioned.body.mentions).toEqual([
            {
                id: 'kari',
                name: 'Kari Nordmann',
            },
        ]);
        const assigned = await comment('kari', {
            path: 'heading',
            text: 'Shorten it for the banner.',
            assignee: 'grace',
        });
        expect(assigned.body.assignee).toEqual({
            id: 'grace',
            name: 'Grace Hopper',
        });

        expect(await waiting('kari')).toMatchObject([
            {
                id: mentioned.body.id,
                reason: 'mentioned',
                ref: 'page:frontPage',
                label: 'Front Page',
                by: {
                    id: 'ada',
                },
            },
        ]);
        expect(await waiting('grace')).toMatchObject([
            {
                id: assigned.body.id,
                reason: 'assigned',
            },
        ]);
        expect(await waiting('ada')).toEqual([]);

        // An answer that mentions the person who started the thread puts it in their Waiting.
        const answer = await comment('kari', {
            replyTo: mentioned.body.id,
            text: '@Ada Lovelace yes, Bryggen.',
            mentions: ['ada'],
        });
        expect(await waiting('ada')).toMatchObject([
            {
                id: answer.body.id,
                replyTo: mentioned.body.id,
                reason: 'mentioned',
            },
        ]);

        await as('kari', request(app).post(`/editing/comments/${mentioned.body.id}/resolve`));
        expect(await waiting('kari')).toEqual([]);
        expect(await waiting('ada')).toEqual([]);
        expect(await waiting('grace')).toHaveLength(1);
    });

    it('refuses to mention or assign someone who does not edit here', async () => {
        await draft('ada', {
            heading: 'Spring',
        });
        const mention = await comment('ada', {
            path: 'heading',
            text: 'Look',
            mentions: ['mallory'],
        });
        expect(mention.status).toBe(422);
        const assignee = await comment('ada', {
            path: 'heading',
            text: 'Look',
            assignee: 'mallory',
        });
        expect(assignee.status).toBe(422);
    });

    it('lists the comments left in a review beside those on the draft', async () => {
        await draft('ada', {
            heading: 'Spring opens in Bergen',
        });
        const asked = await as('ada', request(app).post('/editing/reviews')).send({
            refs: ['page:frontPage'],
            reviewers: ['kari'],
        });
        const review = asked.body.reviews[0].id;
        await as('kari', request(app).post('/editing/reviews/comments')).send({
            review,
            path: 'heading',
            text: 'Say which spring',
        });
        await comment('kari', {
            path: 'heading',
            anchor: 'Bergen',
            text: 'Which shop?',
        });
        const comments = await listed('ada');
        expect(comments.map((candidate) => [candidate['text'], candidate['review']])).toEqual([
            ['Say which spring', review],
            ['Which shop?', null],
        ]);
        const described = await as('ada', request(app).get('/editing/describe?ref=page:frontPage'));
        expect(described.body.review.comments).toMatchObject([
            {
                text: 'Say which spring',
                review,
                anchor: null,
                mentions: [],
                assignee: null,
            },
        ]);
    });
});

describe('textOf', () => {
    it('reads a string as it is and rich text a line per block', () => {
        expect(textOf('Spring')).toBe('Spring');
        expect(textOf(richTextFromPlain('One\nTwo'))).toBe('One\nTwo');
        expect(textOf(true)).toBeUndefined();
    });
});
