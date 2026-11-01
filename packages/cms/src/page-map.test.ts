import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { definePage } from './page.js';
import { defineGlobal } from './definitions.js';
import { cms } from './provider.js';
import { definePages } from './options.js';
import { declareSites, SiteSchema } from './site.js';
import { link } from './links.js';
import { DocumentStore } from './storage/store.js';
import { memoryMediaStorage } from './media/storage.js';
import { heldJobs } from './held-jobs.fixture.js';
import { pageMapOf, type PageMap } from './page-map.js';

const k = new Kizuna();
const roles = Kizuna.roles(['editor', 'admin']);

const EDITORS: Record<string, { userId: string; role: 'editor' | 'admin'; sites?: Record<string, 'editor' | 'admin'> }> = {
    'grace-token': {
        userId: 'grace',
        role: 'admin',
    },
    'sam-token': {
        userId: 'sam',
        role: 'editor',
        sites: {
            uk: 'editor',
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

const textPage = <const Name extends string>(name: Name) =>
    definePage({
        name,
        fields: [
            {
                name: 'heading',
                schema: z.string(),
            },
            {
                name: 'related',
                schema: link().optional(),
            },
        ],
    });

const Footer = defineGlobal({
    name: 'footer',
    fields: [
        {
            name: 'contact',
            schema: link().optional(),
        },
    ],
});

const countryPages = definePages({
    frontPage: {
        path: '/',
        page: textPage('frontPage'),
    },
    aboutPage: {
        path: '/about',
        page: textPage('aboutPage'),
    },
    historyPage: {
        path: '/about/history',
        page: textPage('historyPage'),
    },
});

const sites = declareSites(SiteSchema, {
    uk: {
        label: 'Hagen UK',
        url: 'https://hagen.example.co.uk',
        icon: '/icons/uk.svg',
        pages: countryPages,
    },
    norway: {
        label: 'Hagen Norge',
        url: 'https://hagen.example.no',
        icon: '/icons/norway.svg',
        pages: countryPages,
    },
});

const pglite = new PGlite();
const db = drizzle(pglite);
const config = defineConfig({
    jobRunner: heldJobs,
    adapter: expressAdapter(),
    auth: {
        identities: {
            editor,
        },
    },
    content: cms({
        db,
        sites,
        site: () => 'uk',
        globals: [Footer],
        auth: {
            identity: 'editor',
            roles: ['editor', 'admin'],
            sites: (signedIn) => signedIn.sites,
        },
        media: {
            storage: memoryMediaStorage(),
        },
        revalidate: () => undefined,
    }),
});
const app = express();
config.api.mount(app);

const as = (token: string) => ({
    get: (path: string) => request(app).get(path).set('authorization', `Bearer ${token}`),
    post: (path: string) => request(app).post(path).set('authorization', `Bearer ${token}`),
    patch: (path: string) => request(app).patch(path).set('authorization', `Bearer ${token}`),
});
const grace = as('grace-token');
const sam = as('sam-token');

/**
 * Saves a draft and, unless told otherwise, publishes it.
 */
const write = async (path: string, changes: Record<string, unknown>, published = true): Promise<void> => {
    expect(
        (
            await grace.patch(`/editing${path}/draft`).send({
                changes,
            })
        ).status
    ).toBe(200);
    if (published) expect((await grace.post(`/editing${path}/publish`).send({})).status).toBe(200);
};

const mapOf = async (who: ReturnType<typeof as>): Promise<PageMap> => {
    const answer = await who.get('/editing/map');
    expect(answer.status).toBe(200);
    return answer.body as PageMap;
};

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec('delete from cms_refs; delete from cms_versions; delete from cms_documents;');
    await write('/sites/uk/pages/frontPage', {
        heading: 'Welcome',
        related: {
            ref: 'page:uk:historyPage',
        },
    });
    await write(
        '/sites/uk/pages/historyPage',
        {
            heading: 'Our history',
        },
        false
    );
    await write('/sites/uk/pages/aboutPage', {
        heading: 'About us',
    });
    await write('/sites/norway/pages/frontPage', {
        heading: 'Velkommen',
        related: {
            ref: 'page:uk:aboutPage',
        },
    });
    await write('/globals/footer', {
        contact: {
            ref: 'page:norway:frontPage',
        },
    });
});

afterAll(async () => {
    await pglite.close();
});

describe('the page map', () => {
    it('answers every page with its site, path and status, and every content link across sites', async () => {
        const map = await mapOf(grace);
        expect(map.nodes.find((node) => node.id === 'page:uk:aboutPage')).toEqual({
            id: 'page:uk:aboutPage',
            ref: 'page:uk:aboutPage',
            kind: 'page',
            site: 'uk',
            title: 'About',
            path: '/about',
            status: 'published',
        });
        expect(map.nodes.filter((node) => node.kind === 'page')).toHaveLength(6);
        expect(map.nodes.find((node) => node.id === 'global:footer')).toMatchObject({
            kind: 'document',
            site: null,
            title: 'Footer',
            path: null,
        });
        expect(
            map.links
                .map((link) => ({
                    from: link.from,
                    to: link.to,
                    broken: link.broken,
                }))
                .sort((left, right) => left.from.localeCompare(right.from))
        ).toEqual([
            {
                from: 'global:footer',
                to: 'page:norway:frontPage',
                broken: false,
            },
            {
                from: 'page:norway:frontPage',
                to: 'page:uk:aboutPage',
                broken: false,
            },
            {
                from: 'page:uk:frontPage',
                to: 'page:uk:historyPage',
                broken: true,
            },
        ]);
        expect(map.links.find((link) => link.from === 'page:uk:frontPage')).toMatchObject({
            fieldPaths: ['related'],
            published: true,
        });
    });

    it("shows an editor of one site only that site's pages and the shared content, and the links between them", async () => {
        const map = await mapOf(sam);
        expect(map.nodes.some((node) => node.site === 'norway')).toBe(false);
        expect(map.nodes.filter((node) => node.kind === 'page')).toHaveLength(3);
        expect(map.links.map((link) => `${link.from} > ${link.to}`)).toEqual(['page:uk:frontPage > page:uk:historyPage']);
        expect(map.nodes.some((node) => node.id === 'global:footer')).toBe(false);
    });

    it('marks a link broken once its target goes back to a draft', async () => {
        expect((await grace.post('/editing/sites/uk/pages/aboutPage/unpublish').send({})).status).toBe(200);
        const map = await mapOf(grace);
        expect(map.links.find((link) => link.to === 'page:uk:aboutPage')?.broken).toBe(true);
    });

    it('tells a link target in the trash from one that is gone', () => {
        const map = pageMapOf({
            pages: [],
            collectionPages: [],
            links: [
                {
                    from: 'global:footer',
                    to: 'item:shops:oslo',
                    fieldPaths: ['contact'],
                    published: true,
                },
                {
                    from: 'global:footer',
                    to: 'item:shops:bergen',
                    fieldPaths: ['contact'],
                    published: true,
                },
            ],
            targets: new Map([
                [
                    'item:shops:oslo',
                    {
                        label: 'item:shops:oslo',
                        path: null,
                        status: 'trashed',
                    },
                ],
                [
                    'item:shops:bergen',
                    {
                        label: 'item:shops:bergen',
                        path: null,
                        status: 'missing',
                    },
                ],
            ]),
            sees: () => true,
        });
        expect(map.nodes.find((node) => node.ref === 'item:shops:oslo')?.status).toBe('trashed');
        expect(map.nodes.find((node) => node.ref === 'item:shops:bergen')?.status).toBe('missing');
        expect(map.links.every((link) => link.broken)).toBe(true);
    });
});
