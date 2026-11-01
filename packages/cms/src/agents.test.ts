import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { pluginExportsOf, ROUTER_META } from 'kizunajs/adapter';
import { expressAdapter } from '@kizunajs/express';
import { createMcpServer } from '@kizunajs/mcp';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { agentOf, UNNAMED_AGENT } from './agents.js';
import { definePage } from './page.js';
import { cms as cmsContent } from './provider.js';
import { DocumentStore } from './storage/store.js';

const k = new Kizuna();
const roles = Kizuna.roles(['editor', 'admin']);

const TOKENS: Record<string, { userId: string; role: 'editor' | 'admin' }> = {
    'mia-token': {
        userId: 'mia',
        role: 'admin',
    },
    'kari-token': {
        userId: 'kari',
        role: 'editor',
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
    instructions: 'Write in a calm, plain voice. Never change the opening hours.',
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
let config: ReturnType<typeof makeConfig>;

const makeConfig = (db: ReturnType<typeof drizzle>) =>
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
                            id: 'mia',
                            name: 'Mia Holm',
                            roles: ['admin'],
                        },
                        {
                            id: 'kari',
                            name: 'Kari Nordmann',
                        },
                    ],
                },
            },
            reviews: {
                roles: 'admin',
            },
            revalidate: () => undefined,
            appDir: 'src/__fixtures__/app',
        }),
    });

beforeAll(async () => {
    pglite = new PGlite();
    const db = drizzle(pglite);
    await new DocumentStore(db).createTables();
    config = makeConfig(db);
    app = express();
    config.api.mount(app);
});

beforeEach(async () => {
    await pglite.exec(
        'delete from cms_schedules; delete from cms_releases; delete from cms_comments; delete from cms_reviews; delete from cms_refs; delete from cms_versions; delete from cms_documents;'
    );
});

afterAll(async () => {
    await pglite.close();
});

const MCP_CALL = Symbol.for('kizuna.mcp.call');

type Handler = (args: Record<PropertyKey, unknown>) => Promise<{ status: number; body: unknown }>;

/**
 * Runs an editing route's handler the way `@kizunajs/mcp` runs a tool call:
 * with the client that made it on the args.
 */
const asTool = async (
    path: string,
    who: 'mia' | 'kari',
    client: { name: string; title?: string } | undefined,
    input: {
        params?: Record<string, string>;
        body?: unknown;
    }
): Promise<{ status: number; body: Record<string, unknown> }> => {
    let handler: unknown = (config.api as unknown as Record<typeof ROUTER_META, Record<string, unknown>>)[ROUTER_META];
    for (const segment of path.split('.')) handler = (handler as Record<string, unknown>)[segment];
    try {
        return (await (handler as Handler)({
            params: input.params ?? {},
            query: {},
            body: input.body,
            headers: {},
            plugins: pluginExportsOf(config.api),
            auth: {
                editor: TOKENS[`${who}-token`],
            },
            throwError: (response: unknown) => {
                throw response;
            },
            [MCP_CALL]: {
                client: client === undefined ? undefined : client,
            },
        })) as { status: number; body: Record<string, unknown> };
    } catch (thrown) {
        return thrown as { status: number; body: Record<string, unknown> };
    }
};

const CLAUDE = {
    name: 'claude-ai',
    title: 'Claude',
};

const as = (who: 'mia' | 'kari', call: request.Test) => call.set('authorization', `Bearer ${who}-token`);

const freeHolds = () => pglite.exec('update cms_documents set held_by = null, held_since = null, held_until = null');

const agentDraft = (page: string, heading: string, client: { name: string; title?: string } | null = CLAUDE) =>
    asTool('editing.pages.updateDraft', 'mia', client ?? undefined, {
        params: {
            name: page,
        },
        body: {
            changes: {
                heading,
            },
        },
    });

describe('who made a change', () => {
    it('reads the agent from a tool call, falls back when the client never named itself, and finds none on an HTTP request', () => {
        expect(
            agentOf({
                [MCP_CALL]: {
                    client: CLAUDE,
                },
            })
        ).toBe('Claude');
        expect(
            agentOf({
                [MCP_CALL]: {
                    client: {
                        name: 'cursor',
                    },
                },
            })
        ).toBe('cursor');
        expect(
            agentOf({
                [MCP_CALL]: {
                    client: undefined,
                },
            })
        ).toBe(UNNAMED_AGENT);
        expect(agentOf({})).toBeNull();
    });

    it("credits a tool call's draft to the agent beside the person, on the version and the draft", async () => {
        const saved = await agentDraft('frontPage', 'Winter care, made simple');
        expect(saved.status).toBe(200);
        expect(saved.body['updatedBy']).toBe('mia');
        expect(saved.body['updatedVia']).toBe('Claude');
        const versions = await as('mia', request(app).get('/editing/pages/frontPage/versions'));
        expect(versions.body.versions[0]).toMatchObject({
            createdBy: 'mia',
            via: 'Claude',
        });
    });

    it('says "an agent" when the client never named itself', async () => {
        const saved = await agentDraft('frontPage', 'Winter care', null);
        expect(saved.body['updatedVia']).toBe(UNNAMED_AGENT);
    });

    it("keeps a person's own save in the admin uncredited, and gives it a version of its own after an agent's", async () => {
        await agentDraft('frontPage', 'Winter care');
        const own = await as('mia', request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                heading: 'Winter care, by Mia',
            },
            autosave: true,
        });
        expect(own.body.updatedVia).toBeNull();
        const versions = await as('mia', request(app).get('/editing/pages/frontPage/versions'));
        expect(versions.body.versions.map((version: { via: string | null }) => version.via)).toEqual([null, 'Claude']);
    });

    it('credits a release and a review an agent asked for', async () => {
        await agentDraft('frontPage', 'Winter care');
        const release = await asTool('editing.releases.create', 'mia', CLAUDE, {
            body: {
                name: 'Agent: winter care refresh',
                refs: ['page:frontPage'],
            },
        });
        expect(release.status).toBe(201);
        expect(release.body['createdVia']).toBe('Claude');
        const asked = await asTool('editing.reviews.request', 'mia', CLAUDE, {
            body: {
                refs: ['page:frontPage'],
                reviewers: ['mia'],
            },
        });
        expect(asked.status).toBe(201);
        const described = await as('mia', request(app).get('/editing/describe?ref=page:frontPage'));
        expect(described.body.review).toMatchObject({
            requestedBy: {
                id: 'mia',
            },
            requestedVia: 'Claude',
        });
    });
});

describe('approving what an agent wrote', () => {
    const askMia = async () => {
        const asked = await as('kari', request(app).post('/editing/reviews')).send({
            refs: ['page:investorRelationsPage'],
            reviewers: ['mia'],
        });
        return asked.body.reviews[0].id as string;
    };

    it('lets the person approve a draft an agent wrote for them', async () => {
        await agentDraft('investorRelationsPage', 'Results for the third quarter');
        await freeHolds();
        const id = await askMia();
        const decided = await as('mia', request(app).post('/editing/reviews/decide')).send({
            ids: [id],
            decision: 'approve',
        });
        expect(decided.status).toBe(200);
        expect(decided.body.reviews[0].status).toBe('approved');
    });

    it('refuses an approval from someone who changed the draft themselves', async () => {
        await as('mia', request(app).patch('/editing/pages/investorRelationsPage/draft')).send({
            changes: {
                heading: 'Results for the third quarter',
            },
        });
        await freeHolds();
        const id = await askMia();
        const decided = await as('mia', request(app).post('/editing/reviews/decide')).send({
            ids: [id],
            decision: 'approve',
        });
        expect(decided.status).toBe(403);
    });

    it('leaves approving and sending back to the person: the model sees no tool for either', async () => {
        const server = createMcpServer(config.api as never, {
            credentialHeaders: {
                authorization: 'Bearer mia-token',
            },
        });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({
            name: 'test-client',
            version: '1.0.0',
        });
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        const { tools } = await client.listTools();
        const forModel = tools.filter((tool) => {
            const visibility = (tool._meta?.['ui'] as { visibility?: string[] } | undefined)?.visibility;
            return visibility === undefined || visibility.includes('model');
        });
        const names = forModel.map((tool) => tool.name);
        expect(names).toContain('editing_reviews_request');
        expect(names).not.toContain('editing_reviews_decide');
        expect(names).not.toContain('editing_reviews_approve_and_publish');
        expect(names).not.toContain('editing_releases_send_back');
        expect(tools.map((tool) => tool.name)).toContain('editing_reviews_decide');
        await client.close();
    });
});

describe('an agent release', () => {
    const agentRelease = async () => {
        await agentDraft('frontPage', 'Winter care, made simple');
        await freeHolds();
        await as('mia', request(app).patch('/editing/pages/investorRelationsPage/draft')).send({
            changes: {
                heading: 'Winter results',
            },
        });
        await freeHolds();
        const release = await asTool('editing.releases.create', 'mia', CLAUDE, {
            body: {
                name: 'Agent: winter care refresh',
                refs: ['page:frontPage', 'page:investorRelationsPage'],
            },
        });
        await asTool('editing.reviews.request', 'mia', CLAUDE, {
            body: {
                refs: ['page:frontPage', 'page:investorRelationsPage'],
                reviewers: ['mia'],
            },
        });
        return release.body['id'] as string;
    };

    it('shows each document waiting for the review, and sends them all back with one note', async () => {
        const id = await agentRelease();
        const read = await as('mia', request(app).get(`/editing/releases/${id}`));
        expect(read.body.createdVia).toBe('Claude');
        expect(read.body.documents.map((document: { review: { status: string } }) => document.review.status)).toEqual(['open', 'open']);
        const sent = await as('mia', request(app).post(`/editing/releases/${id}/send-back`)).send({
            note: 'Keep the opening hours as they are.',
        });
        expect(sent.status).toBe(200);
        expect(
            sent.body.documents.map((document: { review: { status: string; decisionNote: string } }) => [
                document.review.status,
                document.review.decisionNote,
            ])
        ).toEqual([
            ['changes', 'Keep the opening hours as they are.'],
            ['changes', 'Keep the opening hours as they are.'],
        ]);
        const again = await as('mia', request(app).post(`/editing/releases/${id}/send-back`)).send({
            note: 'And the heading.',
        });
        expect(again.status).toBe(409);
    });

    it('checks the release document by document, saving nothing', async () => {
        const id = await agentRelease();
        const checked = await as('kari', request(app).get(`/editing/check?release=${id}`));
        expect(checked.status).toBe(200);
        expect(checked.body.ready).toBe(false);
        const issues = Object.fromEntries(
            checked.body.documents.map((document: { ref: string; issues: Array<{ level: string; kind: string }> }) => [
                document.ref,
                document.issues.map((issue) => `${issue.level} ${issue.kind}`),
            ])
        );
        expect(issues).toEqual({
            'page:frontPage': ['warning review'],
            'page:investorRelationsPage': ['block review'],
        });
    });
});

describe('the check before publishing', () => {
    const check = (who: 'mia' | 'kari', ref: string) => as(who, request(app).get(`/editing/check?ref=${encodeURIComponent(ref)}`));

    it('blocks on a required field and on someone else editing, per site and language', async () => {
        await as('kari', request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                intro: 'Ready for the cold',
            },
        });
        const checked = await check('mia', 'page:frontPage');
        expect(checked.body.ready).toBe(false);
        expect(checked.body.documents[0].issues).toEqual([
            {
                level: 'block',
                kind: 'missing',
                detail: 'heading is required.',
                path: 'heading',
                site: null,
                locale: null,
            },
            {
                level: 'block',
                kind: 'held',
                detail: 'Kari Nordmann is editing it. It publishes once they stop.',
                path: null,
                site: null,
                locale: null,
            },
        ]);
    });

    it('is ready when nothing stops it, and warns of a schedule the publish ends', async () => {
        await as('mia', request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                heading: 'Winter care',
            },
        });
        const ready = await check('mia', 'page:frontPage');
        expect(ready.body).toEqual({
            ready: true,
            documents: [
                {
                    ref: 'page:frontPage',
                    title: 'Front Page',
                    issues: [],
                },
            ],
        });
        const put = await as('mia', request(app).put('/editing/pages/frontPage/schedule')).send({
            action: 'publish',
            at: new Date(Date.now() + 86_400_000).toISOString(),
        });
        expect(put.status).toBe(200);
        const scheduled = await check('mia', 'page:frontPage');
        expect(scheduled.body.ready).toBe(true);
        expect(scheduled.body.documents[0].issues.map((issue: { kind: string; level: string }) => `${issue.level} ${issue.kind}`)).toEqual([
            'warning schedule',
        ]);
    });

    it('blocks a document that requires a review nobody approved', async () => {
        await as('kari', request(app).patch('/editing/pages/investorRelationsPage/draft')).send({
            changes: {
                heading: 'Winter results',
            },
        });
        const checked = await check('mia', 'page:investorRelationsPage');
        expect(checked.body.documents[0].issues.map((issue: { detail: string }) => issue.detail)).toContain(
            'It needs an approved review first.'
        );
    });

    it('asks for a ref or a release, one of them', async () => {
        const neither = await as('mia', request(app).get('/editing/check'));
        expect(neither.status).toBe(400);
    });
});

describe('instructions an agent reads', () => {
    it("joins the page's own instructions to the tool that writes pages", () => {
        const { editing } = config.api.routes as unknown as Record<
            'editing',
            Record<'pages' | 'globals', Record<'updateDraft', { description: string }>>
        >;
        expect(editing.pages.updateDraft.description).toContain(
            '### Front Page (frontPage)\n\nWrite in a calm, plain voice. Never change the opening hours.'
        );
        expect(editing.globals.updateDraft.description).not.toContain('frontPage');
    });

    it("answers describe with the page's own instructions", async () => {
        const described = await as('mia', request(app).get('/editing/describe?ref=page:frontPage'));
        expect(described.body.instructions).toBe('Write in a calm, plain voice. Never change the opening hours.');
        const other = await as('mia', request(app).get('/editing/describe?ref=page:investorRelationsPage'));
        expect(other.body.instructions).toBeNull();
    });
});
