import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import type { ContentRuntime } from 'kizunajs/plugin';
import { expressAdapter } from '@kizunajs/express';
import { cms } from './provider.js';
import { PREVIEW_COOKIE, previewSecret, signPreviewToken } from './preview-token.js';

const draft = {
    enabled: false,
};
const jar = new Map<string, string>();

const runtime: ContentRuntime = {
    cache: (read) => read,
    revalidate: () => undefined,
    draftMode: async () => ({
        enabled: draft.enabled,
        enable: () => {
            draft.enabled = true;
        },
        disable: () => {
            draft.enabled = false;
        },
    }),
    cookies: async () => ({
        get: (name) => jar.get(name),
        set: (name, value) => {
            jar.set(name, value);
        },
        delete: (name) => {
            jar.delete(name);
        },
    }),
    notFound: async () => {
        throw new Error('not found');
    },
};

const k = new Kizuna();
const editorRoles = Kizuna.roles(['editor', 'admin', 'viewer']);
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

const pglite = new PGlite();
const config = defineConfig({
    adapter: {
        ...expressAdapter(),
        content: runtime,
    },
    auth: {
        identities: {
            editor,
        },
    },
    content: cms({
        db: drizzle(pglite),
        pages: {},
        auth: {
            identity: 'editor',
            roles: ['editor', 'admin'],
        },
        signInPath: '/login',
    }),
});
const app = express();
config.api.mount(app);

const asEditor = (call: request.Test) => call.set('authorization', 'Bearer editor-token');

beforeEach(() => {
    draft.enabled = false;
    jar.clear();
});

afterAll(async () => {
    await pglite.close();
});

describe('the draft route', () => {
    it('opens draft mode for an editor and lands them on the page', async () => {
        const response = await asEditor(request(app).get('/draft').query({ redirect: '/blog/welcome' }));
        expect(response.status).toBe(307);
        expect(response.headers['location']).toBe('/blog/welcome');
        expect(draft.enabled).toBe(true);
        expect(jar.has(PREVIEW_COOKIE)).toBe(true);
    });

    it('sends a signed-out editor to sign in, and back to draft mode after', async () => {
        const response = await request(app).get('/draft').query({ redirect: '/blog/welcome' });
        expect(response.status).toBe(307);
        expect(response.headers['location']).toBe(`/login?next=${encodeURIComponent('/api/draft?redirect=%2Fblog%2Fwelcome')}`);
        expect(draft.enabled).toBe(false);
    });

    it('refuses a signed-in caller without an editing role', async () => {
        const response = await request(app).get('/draft').set('authorization', 'Bearer viewer-token');
        expect(response.status).toBe(307);
        expect(response.headers['location']).toMatch(/^\/login\?next=/);
        expect(draft.enabled).toBe(false);
    });

    it('never sends anyone off the site', async () => {
        const response = await asEditor(request(app).get('/draft').query({ redirect: '//example.com' }));
        expect(response.headers['location']).toBe('/');
    });

    it('renews the cookie for the overlay, and says when the page rendered without drafts', async () => {
        jar.set(PREVIEW_COOKIE, signPreviewToken(previewSecret(undefined)));
        expect((await asEditor(request(app).get('/draft').query({ renew: '1' }))).body).toEqual({
            expired: false,
        });
        jar.set(PREVIEW_COOKIE, signPreviewToken(previewSecret(undefined), 600, Date.now() - 601_000));
        expect((await asEditor(request(app).get('/draft').query({ renew: '1' }))).body).toEqual({
            expired: true,
        });
        expect((await request(app).get('/draft').query({ renew: '1' })).status).toBe(401);
    });

    it('closes draft mode and drops the cookie', async () => {
        draft.enabled = true;
        jar.set(PREVIEW_COOKIE, 'held');
        const response = await request(app).get('/draft').query({ disable: '1', redirect: '/' });
        expect(response.status).toBe(307);
        expect(draft.enabled).toBe(false);
        expect(jar.has(PREVIEW_COOKIE)).toBe(false);
    });
});
