import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { MockLanguageModelV4 } from 'ai/test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { pluginExportsOf } from 'kizunajs/adapter';
import { expressAdapter } from '@kizunajs/express';
import { definePage } from './page.js';
import { defineGlobal } from './definitions.js';
import { cms } from './provider.js';
import { definePages } from './options.js';
import { DocumentStore } from './storage/store.js';
import type { CmsExports } from './setup.js';
import type { DocumentRef } from './refs.js';
import { heldJobs } from './held-jobs.fixture.js';

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>;

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

const ArticlePage = definePage({
    name: 'aboutPage',
    fields: [
        {
            name: 'title',
            schema: z.string(),
        },
        {
            name: 'slug',
            schema: z.string().regex(/^[a-z0-9-]+$/),
        },
        {
            name: 'intro',
            schema: z.string().optional(),
        },
        {
            name: 'order',
            schema: z.int().default(0),
        },
    ],
});

const Footer = defineGlobal({
    name: 'footer',
    fields: [
        {
            name: 'note',
            schema: z.string(),
        },
    ],
});

const model = {
    fails: false,
};

const answer = (text: string): GenerateResult => ({
    content: [
        {
            type: 'text',
            text,
        },
    ],
    finishReason: {
        unified: 'stop',
        raw: undefined,
    },
    usage: {
        inputTokens: {
            total: 10,
            noCache: 10,
            cacheRead: undefined,
            cacheWrite: undefined,
        },
        outputTokens: {
            total: 20,
            text: 20,
            reasoning: undefined,
        },
    },
    warnings: [],
});

const NORWEGIAN: Record<string, string> = {
    'About us': 'Om oss',
    'We sell plants.': 'Vi selger planter.',
    'Open every day': 'Åpent hver dag',
};

const translator = new MockLanguageModelV4({
    doGenerate: async (options) => {
        if (model.fails) return answer('{}');
        const message = options.prompt.find((candidate) => candidate.role === 'user');
        const part = message?.role === 'user' ? message.content.find((candidate) => candidate.type === 'text') : undefined;
        const texts: Record<string, string> = JSON.parse(part?.type === 'text' ? part.text : '{}');
        return answer(JSON.stringify(Object.fromEntries(Object.entries(texts).map(([key, text]) => [key, NORWEGIAN[text] ?? text]))));
    },
});

const options = {
    db: drizzle(new PGlite()),
    locales: ['en', 'nb'],
    pages: definePages({
        aboutPage: {
            path: '/about',
            page: ArticlePage,
        },
    }),
    globals: [Footer],
    auth: {
        identity: 'editor',
    },
};

const content = cms({
    ...options,
    translate: {
        model: translator,
    },
});
const pglite = (options.db as unknown as { $client: PGlite }).$client;
const config = defineConfig({
    jobRunner: heldJobs,
    adapter: expressAdapter(),
    auth: {
        identities: {
            editor,
        },
    },
    content,
});
const service = (pluginExportsOf(config.api)['cms'] as CmsExports).service;
const app = express();
config.api.mount(app);

const about: DocumentRef = {
    type: 'page',
    name: 'aboutPage',
};

const asEditor = (call: request.Test) => call.set('authorization', 'Bearer editor-token');

const publishAbout = async (changes: Record<string, unknown>): Promise<void> => {
    await service.update({
        ref: about,
        changes,
        caller: {},
        author: 'ada',
    });
    await service.publish(about, 'ada');
};

beforeAll(async () => {
    await new DocumentStore(options.db).createTables();
});

beforeEach(async () => {
    await pglite.exec(
        'delete from cms_translations; delete from cms_refreshes; delete from cms_refs; delete from cms_versions; delete from cms_documents;'
    );
    model.fails = false;
});

afterAll(async () => {
    await pglite.close();
});

describe('POST /editing/.../translate', () => {
    it('drafts the translation from the published source, and records the version it came from', async () => {
        await publishAbout({
            title: 'About us',
            slug: 'about-us',
            intro: 'We sell plants.',
            order: 2,
        });
        await service.update({
            ref: about,
            changes: {
                intro: 'An unpublished change.',
            },
            caller: {},
            author: 'ada',
        });
        const response = await asEditor(request(app).post('/editing/pages/aboutPage/translate?locale=nb')).send({});
        expect(response.status).toBe(200);
        expect(response.body.fields).toEqual(['title', 'slug', 'intro']);
        expect(response.body.draft).toMatchObject({
            ref: 'page:aboutPage@nb',
            status: 'draft',
            content: {
                title: 'Om oss',
                slug: 'om-oss',
                intro: 'Vi selger planter.',
            },
        });
        const translation = await service.store.get('page', 'aboutPage', 'default', 'nb');
        const source = await service.store.get('page', 'aboutPage');
        expect(await service.store.sourceVersions(translation!.id)).toEqual({
            title: source!.publishedVersion,
            slug: source!.publishedVersion,
            intro: source!.publishedVersion,
        });
    });

    it('translates only the fields asked for', async () => {
        await publishAbout({
            title: 'About us',
            slug: 'about-us',
            intro: 'We sell plants.',
        });
        const response = await asEditor(request(app).post('/editing/pages/aboutPage/translate?locale=nb')).send({
            fields: ['intro'],
        });
        expect(response.status).toBe(200);
        expect(response.body.fields).toEqual(['intro']);
        expect(response.body.draft.content).toEqual({
            intro: 'Vi selger planter.',
        });
    });

    it('writes nothing when the translation already says the same', async () => {
        await publishAbout({
            title: 'About us',
            slug: 'about-us',
            intro: 'We sell plants.',
        });
        const nb: DocumentRef = {
            ...about,
            locale: 'nb',
        };
        await service.update({
            ref: nb,
            changes: {
                title: 'Om oss',
                slug: 'om-oss',
                intro: 'Vi selger planter.',
            },
            caller: {},
            author: 'ada',
        });
        await service.publish(nb, 'ada');
        const response = await asEditor(request(app).post('/editing/pages/aboutPage/translate?locale=nb')).send({});
        expect(response.status).toBe(200);
        expect(response.body.fields).toEqual([]);
        expect(response.body.draft.status).toBe('published');
    });

    it('refuses a source that is not published, no language or its own, and a field that is not translated', async () => {
        await service.update({
            ref: about,
            changes: {
                title: 'About us',
                slug: 'about-us',
            },
            caller: {},
            author: 'ada',
        });
        const unpublished = await asEditor(request(app).post('/editing/pages/aboutPage/translate?locale=nb')).send({});
        expect(unpublished.status).toBe(409);
        await service.publish(about, 'ada');
        const own = await asEditor(request(app).post('/editing/pages/aboutPage/translate?locale=en')).send({});
        expect(own.status).toBe(400);
        const shared = await asEditor(request(app).post('/editing/pages/aboutPage/translate?locale=nb')).send({
            fields: ['order'],
        });
        expect(shared.status).toBe(400);
        const unnamed = await asEditor(request(app).post('/editing/pages/aboutPage/translate')).send({});
        expect(unnamed.status).toBe(400);
    });

    it('answers 502 and writes nothing when the model answers with something the fields cannot hold', async () => {
        await publishAbout({
            title: 'About us',
            slug: 'about-us',
        });
        model.fails = true;
        const response = await asEditor(request(app).post('/editing/pages/aboutPage/translate?locale=nb')).send({});
        expect(response.status).toBe(502);
        expect(await service.store.get('page', 'aboutPage', 'default', 'nb')).toBeUndefined();
    });

    it('is a tool, approved by the person only where a draft write is', () => {
        expect(content.routes.editing.pages.translate?.tool).toBe(true);
        expect(content.routes.editing.globals.translate?.tool).toEqual({
            needsApproval: true,
        });
    });

    it('is left out without a model', () => {
        const without = cms(options);
        expect(without.routes.editing.pages.translate).toBeUndefined();
    });

    it('needs two languages to translate between', () => {
        expect(() =>
            defineConfig({
                jobRunner: heldJobs,
                auth: {
                    identities: {
                        editor,
                    },
                },
                content: cms({
                    ...options,
                    locales: ['en'],
                    translate: {
                        model: translator,
                    },
                }),
            })
        ).toThrow('fewer than two');
    });
});
