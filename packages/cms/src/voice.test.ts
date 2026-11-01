import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { MockLanguageModelV4 } from 'ai/test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { definePage } from './page.js';
import { defineGlobal } from './definitions.js';
import { cms } from './provider.js';
import { definePages } from './options.js';
import { declareSites, SiteSchema } from './site.js';
import { DocumentStore } from './storage/store.js';
import { heldJobs } from './held-jobs.fixture.js';

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>;

const k = new Kizuna();
const roles = Kizuna.roles(['editor', 'admin']);

const EDITORS: Record<string, { userId: string; role: 'editor' | 'admin'; sites?: Record<string, 'editor' | 'admin'> }> = {
    'mia-token': {
        userId: 'mia',
        role: 'admin',
    },
    'nils-token': {
        userId: 'nils',
        role: 'editor',
        sites: {
            norway: 'admin',
        },
    },
    'kari-token': {
        userId: 'kari',
        role: 'editor',
        sites: {
            norway: 'editor',
        },
    },
};

const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
            sites: z.record(z.string(), z.enum(['editor', 'admin'])).optional(),
        }),
        roles,
    })
    .guard(({ bearer, deny }) => {
        const found = EDITORS[bearer?.token ?? ''];
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

const Footer = defineGlobal({
    name: 'footer',
    fields: [
        {
            name: 'note',
            schema: z.string(),
        },
    ],
});

const ENGLISH: Record<string, string> = {
    'Rimelige planter': 'Cheap plants',
    'Spør Plantedoktoren om stell.': 'Ask the Plant Doctor about care.',
};

const prompts: string[] = [];

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

const translator = new MockLanguageModelV4({
    doGenerate: async (options) => {
        const system = options.prompt.find((candidate) => candidate.role === 'system');
        prompts.push(system?.role === 'system' ? system.content : '');
        const message = options.prompt.find((candidate) => candidate.role === 'user');
        const part = message?.role === 'user' ? message.content.find((candidate) => candidate.type === 'text') : undefined;
        const texts: Record<string, string> = JSON.parse(part?.type === 'text' ? part.text : '{}');
        return answer(JSON.stringify(Object.fromEntries(Object.entries(texts).map(([key, text]) => [key, ENGLISH[text] ?? text]))));
    },
});

const pages = definePages({
    frontPage: {
        path: '/',
        page: FrontPage,
    },
});

const sites = declareSites(SiteSchema.extend({}), {
    uk: {
        label: 'Hagen UK',
        url: 'https://hagen.example.co.uk',
        icon: '/icons/uk.svg',
        locales: ['en'],
        pages,
    },
    norway: {
        label: 'Hagen Norge',
        url: 'https://hagen.example.no',
        icon: '/icons/norway.svg',
        locales: ['nb', 'en'],
        pages,
    },
});

const pglite = new PGlite();
const db = drizzle(pglite);
await new DocumentStore(db).createTables();
const config = defineConfig({
    jobRunner: heldJobs,
    adapter: expressAdapter(),
    auth: {
        identities: {
            editor,
        },
    },
    content: cms({
        name: 'Hagen',
        db,
        sites,
        locales: ['en', 'nb'],
        globals: [Footer],
        translate: {
            model: translator,
        },
        voice: {
            roles: 'admin',
        },
        auth: {
            identity: 'editor',
            roles: ['editor', 'admin'],
            sites: (signedIn) => signedIn.sites,
        },
        revalidate: () => undefined,
    }),
});
const app = express();
config.api.mount(app);

// Each step is someone who saved and left, so the next person finds the document free.
const as = (token: string) => {
    const free = <Call extends request.Test>(call: Call): Call => {
        void pglite.exec('update cms_documents set held_by = null, held_since = null, held_until = null');
        return call.set('authorization', `Bearer ${token}`);
    };
    return {
        get: (path: string) => free(request(app).get(path)),
        post: (path: string) => free(request(app).post(path)),
        patch: (path: string) => free(request(app).patch(path)),
    };
};
const mia = as('mia-token');
const nils = as('nils-token');
const kari = as('kari-token');

const groupVoice = {
    tone: 'Warm and practical, with no hype.',
    glossary: [
        {
            forms: ['Hagen Club'],
            rule: 'keep',
        },
        {
            forms: ['cheap'],
            rule: 'avoid',
            language: 'en',
            use: 'affordable',
        },
    ],
};

const norwayVoice = {
    rules: [
        {
            kind: 'do',
            text: 'Skriv du, aldri De.',
            language: 'nb',
        },
    ],
    glossary: [
        {
            forms: ['Plantedoktoren'],
            rule: 'keep',
            note: 'The name of our advice service.',
        },
        {
            forms: ['billig', 'billige', 'billigste'],
            rule: 'avoid',
            language: 'nb',
            use: 'rimelig',
        },
        {
            forms: ['Hagen Club'],
            rule: 'translate',
            language: 'nb',
            use: 'Hagen-klubben',
        },
    ],
};

const setVoice = async (path: string, changes: Record<string, unknown>, publish = true): Promise<void> => {
    const saved = await mia.patch(`/editing${path}/globals/voice/draft`).send({
        changes,
    });
    expect(saved.status).toBe(200);
    if (publish) expect((await mia.post(`/editing${path}/globals/voice/publish`).send({})).status).toBe(200);
};

beforeEach(async () => {
    await pglite.exec(
        'delete from cms_translations; delete from cms_refreshes; delete from cms_refs; delete from cms_versions; delete from cms_documents;'
    );
    prompts.length = 0;
});

afterAll(async () => {
    await pglite.close();
});

describe('the voice global', () => {
    it('is a global of Shared and of every site', async () => {
        const shared = await mia.get('/editing/globals');
        expect(shared.body.globals.map((global: { name: string }) => global.name)).toEqual(['footer', 'voice']);
        const norway = await mia.get('/editing/sites/norway/globals');
        expect(norway.body.globals.map((global: { name: string }) => global.name)).toEqual(['voice']);
    });

    it('takes changes only from its roles', async () => {
        const refused = await kari.patch('/editing/sites/norway/globals/voice/draft').send({
            changes: {
                tone: 'Loud.',
            },
        });
        expect(refused.status).toBe(403);
        const saved = await nils.patch('/editing/sites/norway/globals/voice/draft').send({
            changes: norwayVoice,
        });
        expect(saved.status).toBe(200);
    });

    it('serves no content route', async () => {
        await setVoice('', groupVoice);
        expect((await request(app).get('/content/globals/voice')).status).toBe(404);
        expect((await request(app).get('/content/sites/norway/globals/voice')).status).toBe(404);
    });
});

describe('editing_voice', () => {
    it("answers the group's published voice, then the site's, with the site's term in place of the group's", async () => {
        await setVoice('', groupVoice);
        await setVoice('/sites/norway', norwayVoice, false);
        const drafted = await kari.get('/editing/voice?site=norway&language=nb');
        expect(drafted.body.glossary.map((term: { forms: string[] }) => term.forms[0])).toEqual(['Hagen Club']);
        await mia.post('/editing/sites/norway/globals/voice/publish').send({});
        const published = await kari.get('/editing/voice?site=norway&language=nb');
        expect(published.body).toMatchObject({
            site: 'norway',
            language: 'nb',
            tone: ['Warm and practical, with no hype.'],
            rules: [
                {
                    kind: 'do',
                    text: 'Skriv du, aldri De.',
                    from: 'site',
                },
            ],
        });
        expect(
            published.body.glossary.map(
                (term: { from: string; rule: string; forms: string[] }) => `${term.from} ${term.rule} ${term.forms[0]}`
            )
        ).toEqual(['site keep Plantedoktoren', 'site avoid billig', 'site translate Hagen Club']);
        expect(published.body.text).toContain('- Write "rimelig", never "billig", "billige", "billigste" in nb.');
        const english = await kari.get('/editing/voice?site=norway&language=en');
        expect(english.body.rules).toEqual([]);
        expect(english.body.glossary.map((term: { forms: string[] }) => term.forms[0])).toEqual(['Hagen Club', 'cheap', 'Plantedoktoren']);
    });

    it('hides a site the editor does not open', async () => {
        expect((await kari.get('/editing/voice?site=uk')).status).toBe(404);
    });
});

describe('glossary issues', () => {
    beforeEach(async () => {
        await setVoice('', groupVoice);
        await setVoice('/sites/norway', norwayVoice);
    });

    it('answers update_draft with the issues in the fields it wrote', async () => {
        const first = await kari.patch('/editing/sites/norway/pages/frontPage/draft').send({
            changes: {
                heading: 'Billige planter',
            },
        });
        expect(first.body.glossary).toEqual([
            {
                path: 'heading',
                locale: 'nb',
                form: 'Billige',
                rule: 'avoid',
                use: 'rimelig',
                detail: 'The heading says Billige. Hagen Norge writes rimelig.',
            },
        ]);
        const second = await kari.patch('/editing/sites/norway/pages/frontPage/draft').send({
            changes: {
                intro: 'Bli med i Hagen-klubben.',
            },
        });
        expect(second.body.glossary).toEqual([]);
    });

    it('answers describe with the voice for the document and what its draft breaks', async () => {
        await kari.patch('/editing/sites/norway/pages/frontPage/draft').send({
            changes: {
                heading: 'Rimelig plantestell',
                intro: 'Bli med i Hagen Club.',
            },
        });
        const described = await kari.get('/editing/describe?ref=page:norway:frontPage');
        expect(described.body.voice.text).toContain('Tone:\nWarm and practical, with no hype.');
        expect(described.body.voice.text).toContain('Skriv du, aldri De.');
        expect(described.body.voice.glossary.map((term: { forms: string[] }) => term.forms[0])).toEqual(['billig', 'Hagen Club']);
        expect(described.body.glossary.map((issue: { detail: string }) => issue.detail)).toEqual([
            'The intro says Hagen Club. Hagen Norge writes Hagen-klubben.',
        ]);
    });

    it('warns in editing_check, scanning the translations of a source', async () => {
        await kari.patch('/editing/sites/norway/pages/frontPage/draft').send({
            changes: {
                heading: 'Billige planter',
            },
        });
        await kari.patch('/editing/sites/norway/pages/frontPage/draft?locale=en').send({
            changes: {
                heading: 'Cheap plants',
            },
        });
        const checked = await mia.get('/editing/check?ref=page:norway:frontPage');
        const glossary = checked.body.documents[0].issues.filter((issue: { kind: string }) => issue.kind === 'glossary');
        expect(glossary).toEqual([
            {
                level: 'warning',
                kind: 'glossary',
                path: 'heading',
                site: 'norway',
                locale: null,
                detail: 'The heading says Billige. Hagen Norge writes rimelig.',
            },
            {
                level: 'warning',
                kind: 'glossary',
                path: 'heading',
                site: 'norway',
                locale: 'en',
                detail: 'The heading says Cheap. Hagen Norge writes affordable.',
            },
        ]);
    });

    it('lists them in the Publish dialog beside the broken links', async () => {
        await kari.patch('/editing/sites/norway/pages/frontPage/draft').send({
            changes: {
                heading: 'Billige planter',
            },
        });
        const changes = await mia.get('/editing/sites/norway/pages/frontPage/changes');
        expect(changes.body.glossary.map((issue: { detail: string }) => issue.detail)).toEqual([
            'The heading says Billige. Hagen Norge writes rimelig.',
        ]);
    });

    it('carries the voice and the terms the source holds into the translation, and answers its issues', async () => {
        await mia.patch('/editing/sites/norway/pages/frontPage/draft').send({
            changes: {
                heading: 'Rimelige planter',
                intro: 'Spør Plantedoktoren om stell.',
            },
        });
        await mia.post('/editing/sites/norway/pages/frontPage/publish').send({});
        const translated = await mia.post('/editing/sites/norway/pages/frontPage/translate?locale=en').send({
            save: false,
        });
        expect(translated.status).toBe(200);
        expect(prompts[0]).toContain('Warm and practical, with no hype.');
        expect(prompts[0]).toContain('- Keep "Plantedoktoren" exactly as written, in every language. The name of our advice service.');
        expect(prompts[0]).not.toContain('Skriv du');
        expect(prompts[0]).not.toContain('Hagen Club');
        expect(translated.body.issues.map((issue: { detail: string }) => issue.detail)).toEqual([
            'The heading says Cheap. Hagen Norge writes affordable.',
            'The intro leaves out Plantedoktoren, which its source says and every language keeps as written.',
        ]);
    });

    it('checks nothing against a voice of its own', async () => {
        const described = await mia.get('/editing/describe?ref=global:norway:voice');
        expect(described.body.voice).toBeNull();
        expect(described.body.glossary).toEqual([]);
    });
});
