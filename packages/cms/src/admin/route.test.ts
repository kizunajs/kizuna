import { afterAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { defineCollection } from '../definitions.js';
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
    });

    it('serves the admin outside apiPath from a second mount at the root', async () => {
        const served = express();
        const cmsApi = express.Router();
        const atRoot = express.Router();
        const moved = configWith('/editor');
        moved.api.mount(cmsApi);
        moved.api.mount(atRoot);
        served.use('/cms-api', cmsApi);
        served.get('/editor', atRoot);
        const signedIn = await request(served).get('/editor').set('authorization', 'Bearer editor-token');
        expect(signedIn.status).toBe(200);
        expect(configOf(signedIn.text).apiPath).toBe('/cms-api');
        const signedOut = await request(served).get('/editor');
        expect(signedOut.status).toBe(307);
        expect(signedOut.headers['location']).toBe(`/login?next=${encodeURIComponent('/editor')}`);
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
