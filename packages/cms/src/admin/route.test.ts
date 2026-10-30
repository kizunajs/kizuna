import { afterAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { mcpPlugin } from '@kizunajs/mcp';
import { defineCollection } from '../definitions.js';
import { definePages } from '../options.js';
import { definePage } from '../page.js';
import { declareSites, SiteSchema } from '../site.js';
import { cms } from '../provider.js';
import type { AdminConfig } from './config.js';

const k = new Kizuna();
const editorRoles = Kizuna.roles(['editor', 'viewer']);
const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
        roles: editorRoles,
    })
    .guard(({ bearer, deny }) => {
        if (bearer?.token === 'editor-token') {
            return {
                userId: 'ada',
                role: 'editor',
            };
        }
        if (bearer?.token === 'viewer-token') {
            return {
                userId: 'grace',
                role: 'viewer',
            };
        }
        return deny({
            status: 401,
            body: {
                detail: 'Unauthorized',
            },
        });
    });

const Articles = defineCollection({
    name: 'articles',
    id: Kizuna.brand('ArticleId', z.string()),
    group: 'Journal',
    fields: [
        {
            name: 'title',
            schema: z.string(),
        },
    ],
});

const pglite = new PGlite();
const configWith = (adminPath?: `/${string}`, adminCss?: string) =>
    defineConfig({
        adapter: expressAdapter(),
        auth: {
            identities: {
                editor,
            },
        },
        content: cms({
            db: drizzle(pglite),
            pages: {},
            collections: [Articles],
            auth: {
                identity: 'editor',
                roles: ['editor'],
            },
            signInPath: '/login',
            signOutPath: '/logout',
            apiPath: '/cms-api',
            adminPath,
            adminCss,
            preview: {
                url: 'https://site.example/blog',
            },
        }),
    });
const config = configWith();
const app = express();
config.api.mount(app);

/**
 * An app serving the CMS API at `/cms-api`, as the docs mount it.
 */
const appServing = (adminPath: `/${string}`) => {
    const served = express();
    const cmsApi = express.Router();
    configWith(adminPath).api.mount(cmsApi);
    served.use('/cms-api', cmsApi);
    return served;
};

afterAll(async () => {
    await pglite.close();
});

/**
 * The config the server wrote into the page.
 */
const configOf = (html: string): AdminConfig =>
    JSON.parse(/<script id="kizuna-cms-config" type="application\/json">(.*?)<\/script>/s.exec(html)![1]!) as AdminConfig;

describe('the admin route', () => {
    it('sends a signed-out visitor to sign in, and back to the admin after', async () => {
        const response = await request(app).get('/admin');
        expect(response.status).toBe(307);
        expect(response.headers['location']).toBe(`/login?next=${encodeURIComponent('/cms-api/admin')}`);
    });

    it('sends a signed-in caller without an editing role to sign in', async () => {
        const response = await request(app).get('/admin').set('authorization', 'Bearer viewer-token');
        expect(response.status).toBe(307);
        expect(response.headers['location']).toMatch(/^\/login\?next=/);
    });

    it('serves the admin to an editor, with the editing routes it calls', async () => {
        const response = await request(app).get('/admin').set('authorization', 'Bearer editor-token');
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/^text\/html/);
        expect(response.headers['cache-control']).toBe('no-store');
        const served = configOf(response.text);
        expect(served.siteUrl).toBe('https://site.example');
        expect(served.apiPath).toBe('/cms-api');
        expect(served.groups).toEqual({
            articles: 'Journal',
        });
        expect(served.routes['editing_describe']).toEqual({
            method: 'GET',
            path: '/editing/describe',
        });
        expect(served.routes['editing_collections_update_draft']).toEqual({
            method: 'PATCH',
            path: '/editing/collections/:name/items/:id/draft',
        });
        expect(served.routes['content_pages_get_page']).toBeUndefined();
    });

    it('serves the same page at every screen under the admin, and tells it where the admin is', async () => {
        for (const path of [
            '/admin/pages',
            '/admin/pages/frontPage',
            '/admin/collections/articles?page=2',
            '/admin/collections/articles/a%2F1',
            '/admin/views/appUsers/42',
        ]) {
            const response = await request(app).get(path).set('authorization', 'Bearer editor-token');
            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(/^text\/html/);
            expect(configOf(response.text).adminPath).toBe('/cms-api/admin');
        }
        const deeper = await request(app).get('/admin/collections/articles/a1/more').set('authorization', 'Bearer editor-token');
        expect(deeper.status).toBe(404);
    });

    it('sends a signed-out visitor to sign in, and back to the screen and query they asked for', async () => {
        const response = await request(app).get('/admin/collections/articles?filter=status:is:draft&filter=or&page=2');
        expect(response.status).toBe(307);
        expect(response.headers['location']).toBe(
            `/login?next=${encodeURIComponent('/cms-api/admin/collections/articles?filter=status%3Ais%3Adraft&filter=or&page=2')}`
        );
        const item = await request(app).get('/admin/collections/articles/a%2F1');
        expect(item.headers['location']).toBe(`/login?next=${encodeURIComponent('/cms-api/admin/collections/articles/a%2F1')}`);
    });

    it('tells the admin the role the editor signed in with, and where Sign out goes', async () => {
        const response = await request(app).get('/admin').set('authorization', 'Bearer editor-token');
        const served = configOf(response.text);
        expect(served.role).toBe('editor');
        expect(served.signOutPath).toBe('/logout');
    });
});

describe('adminPath', () => {
    it('serves the admin under apiPath from the API mount', async () => {
        const served = appServing('/cms-api/editor');
        const signedIn = await request(served).get('/cms-api/editor').set('authorization', 'Bearer editor-token');
        expect(signedIn.status).toBe(200);
        expect(configOf(signedIn.text).apiPath).toBe('/cms-api');
        const signedOut = await request(served).get('/cms-api/editor');
        expect(signedOut.headers['location']).toBe(`/login?next=${encodeURIComponent('/cms-api/editor')}`);
        const screen = await request(served).get('/cms-api/editor/collections/articles').set('authorization', 'Bearer editor-token');
        expect(screen.status).toBe(200);
        expect(configOf(screen.text).adminPath).toBe('/cms-api/editor');
    });

    it('serves the admin outside apiPath from a second mount at the root', async () => {
        const served = express();
        const cmsApi = express.Router();
        const atRoot = express.Router();
        const moved = configWith('/editor');
        moved.api.mount(cmsApi);
        moved.api.mount(atRoot);
        served.use('/cms-api', cmsApi);
        served.get(['/editor', '/editor/*screen'], atRoot);
        const signedIn = await request(served).get('/editor').set('authorization', 'Bearer editor-token');
        expect(signedIn.status).toBe(200);
        expect(configOf(signedIn.text).apiPath).toBe('/cms-api');
        const signedOut = await request(served).get('/editor');
        expect(signedOut.status).toBe(307);
        expect(signedOut.headers['location']).toBe(`/login?next=${encodeURIComponent('/editor')}`);
        const screen = await request(served).get('/editor/globals/header').set('authorization', 'Bearer editor-token');
        expect(screen.status).toBe(200);
        expect(configOf(screen.text).adminPath).toBe('/editor');
    });
});

describe('Edit in your chat', () => {
    it("tells the admin where the MCP route is, its name, and the editor's token", async () => {
        const connected = express();
        defineConfig({
            adapter: expressAdapter(),
            auth: {
                identities: {
                    editor,
                },
            },
            content: cms({
                db: drizzle(pglite),
                pages: {},
                collections: [Articles],
                auth: {
                    identity: 'editor',
                    roles: ['editor'],
                    chatToken: ({ headers }) => headers.get('authorization')?.replace(/^Bearer /, ''),
                },
                signInPath: '/login',
                apiPath: '/cms-api',
            }),
            plugins: [
                mcpPlugin({
                    name: 'Plant shop content',
                }),
            ],
        }).api.mount(connected);
        const response = await request(connected).get('/admin').set('authorization', 'Bearer editor-token');
        expect(configOf(response.text).chat).toEqual({
            path: '/cms-api/mcp',
            name: 'plant-shop-content',
            oauth: false,
            token: 'editor-token',
        });
    });

    it('offers no chat when the API serves no MCP route', async () => {
        const response = await request(app).get('/admin').set('authorization', 'Bearer editor-token');
        expect(configOf(response.text).chat).toBeNull();
    });
});

describe('adminCss', () => {
    it("links the app's stylesheet after the admin's own", async () => {
        const styled = express();
        configWith(undefined, '/cms-admin.css').api.mount(styled);
        const response = await request(styled).get('/admin').set('authorization', 'Bearer editor-token');
        expect(response.text).toMatch(/<\/style>\s*<link rel="stylesheet" href="\/cms-admin.css">/);
    });

    it('links nothing without one', async () => {
        const response = await request(app).get('/admin').set('authorization', 'Bearer editor-token');
        expect(response.text).not.toContain('<link rel="stylesheet"');
        expect(response.text).not.toContain('kizuna-cms-stylesheet');
    });
});

const Events = defineCollection({
    name: 'events',
    id: Kizuna.brand('EventId', z.string()),
    label: 'Events',
    fields: [
        {
            name: 'title',
            schema: z.string(),
        },
    ],
});

const Offices = defineCollection({
    name: 'offices',
    id: Kizuna.brand('OfficeId', z.string()),
    fields: [
        {
            name: 'name',
            schema: z.string(),
        },
        {
            name: 'phone',
            schema: z.string(),
            perSite: true,
        },
    ],
});

const FrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
    ],
});

const countryPages = definePages({
    frontPage: {
        path: '/',
        page: FrontPage,
    },
});

const withSites = defineConfig({
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
        db: drizzle(pglite),
        locales: ['en-GB'],
        collections: [Articles, Offices],
        sites: declareSites(SiteSchema, {
            uk: {
                label: 'Hagen UK',
                url: 'https://hagen.example.co.uk',
                icon: '/icons/uk.svg',
                locales: ['en-GB'],
                pages: countryPages,
                collections: [Events],
            },
            norway: {
                label: 'Hagen Norge',
                url: 'https://hagen.example.no',
                icon: 'https://cdn.hagen.example.no/norway.svg',
                pages: countryPages,
            },
        }),
        site: () => 'uk',
        auth: {
            identity: 'editor',
            roles: ['editor'],
        },
        signInPath: '/login',
        apiPath: '/cms-api',
    }),
});
const sitesApp = express();
withSites.api.mount(sitesApp);

describe('the admin with several sites', () => {
    it('tells the admin each site, with its icon as a full URL and the content it has of its own', async () => {
        const response = await request(sitesApp).get('/admin').set('authorization', 'Bearer editor-token');
        expect(configOf(response.text).sites).toEqual([
            {
                key: 'uk',
                label: 'Hagen UK',
                icon: 'https://hagen.example.co.uk/icons/uk.svg',
                country: 'GB',
                pages: ['frontPage'],
                globals: [],
                collections: [
                    {
                        name: 'events',
                        label: 'Events',
                    },
                ],
            },
            {
                key: 'norway',
                label: 'Hagen Norge',
                icon: 'https://cdn.hagen.example.no/norway.svg',
                country: null,
                pages: ['frontPage'],
                globals: [],
                collections: [],
            },
        ]);
    });

    it('tells the admin which shared content each site sets its own values on, and that an admin opens All sites', async () => {
        const served = configOf((await request(sitesApp).get('/admin').set('authorization', 'Bearer editor-token')).text);
        expect(served.siteValues).toEqual({
            offices: ['uk', 'norway'],
        });
        expect(served.allSites).toBe(true);
    });

    it("serves a site's view of a shared item, a level deeper than the shared one", async () => {
        const response = await request(sitesApp).get('/admin/uk/collections/articles/a1').set('authorization', 'Bearer editor-token');
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/^text\/html/);
        const unknown = await request(sitesApp).get('/admin/denmark/collections/articles/a1').set('authorization', 'Bearer editor-token');
        expect(unknown.status).toBe(404);
    });

    it('tells a project with one site of no sites', async () => {
        const response = await request(app).get('/admin').set('authorization', 'Bearer editor-token');
        expect(configOf(response.text).sites).toEqual([]);
    });
});
