import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import type { ContentRuntime } from 'kizunajs/plugin';
import { expressAdapter } from '@kizunajs/express';
import { cms } from '../provider.js';
import { declareSites, SiteSchema } from '../site.js';
import type { SignInAttempt, SignOutRequest } from '../options.js';
import { PREVIEW_COOKIE } from '../preview-token.js';
import type { AdminConfig } from './config.js';
import type { SignInConfig } from './sign-in-config.js';

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

const attempts: SignInAttempt[] = [];
const signOuts: SignOutRequest[] = [];

const signIn = ({ email, password, headers }: SignInAttempt): Response => {
    attempts.push({
        email,
        password,
        headers,
    });
    if (email !== 'ada@example.com' || password !== 'correct horse') {
        return Response.json(
            {
                message: 'No user with that email',
            },
            {
                status: 401,
            }
        );
    }
    return Response.json(
        {
            ok: true,
        },
        {
            headers: {
                'set-cookie': 'session=ada; Path=/; HttpOnly',
            },
        }
    );
};

const signOut = (request: SignOutRequest): Response => {
    signOuts.push(request);
    return new Response(null, {
        headers: {
            'set-cookie': 'session=; Path=/; Max-Age=0',
        },
    });
};

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
        name: 'Hagen',
        db: drizzle(pglite),
        pages: {},
        auth: {
            identity: 'editor',
            roles: ['editor'],
            signIn,
            signOut,
        },
        apiPath: '/cms-api',
    }),
});
const app = express();
config.api.mount(app);

const ORIGIN = 'http://cms.example';
const HOST = 'cms.example';

beforeEach(() => {
    attempts.length = 0;
    signOuts.length = 0;
    draft.enabled = false;
    jar.clear();
});

afterAll(async () => {
    await pglite.close();
});

const configIn = <Config>(html: string): Config =>
    JSON.parse(/<script id="kizuna-cms-config" type="application\/json">(.*?)<\/script>/s.exec(html)![1]!) as Config;

const signingIn = (body: Record<string, string>) =>
    request(app).post('/sign-in').set('host', HOST).set('origin', ORIGIN).set('user-agent', 'test-browser').send(body);

describe("the admin's sign-in screen", () => {
    it('is where a signed-out editor opening the admin goes, and comes back from', async () => {
        const response = await request(app).get('/admin');
        expect(response.status).toBe(307);
        expect(response.headers['location']).toBe(`/cms-api/admin/login?next=${encodeURIComponent('/cms-api/admin')}`);
    });

    it('keeps the screen and query a signed-out editor asked for, and still serves itself under the admin', async () => {
        const response = await request(app).get('/admin/collections/articles?page=2&sort=-updatedAt');
        expect(response.status).toBe(307);
        const next = '/cms-api/admin/collections/articles?page=2&sort=-updatedAt';
        expect(response.headers['location']).toBe(`/cms-api/admin/login?next=${encodeURIComponent(next)}`);
        const screen = await request(app).get('/admin/login').query({
            next,
        });
        expect(screen.status).toBe(200);
        expect(configIn<SignInConfig>(screen.text).next).toBe(next);
        const signedIn = await request(app)
            .get('/admin/login')
            .query({
                next,
            })
            .set('authorization', 'Bearer editor-token');
        expect(signedIn.headers['location']).toBe(next);
    });

    it('is where a signed-out editor opening draft mode goes', async () => {
        const response = await request(app).get('/draft').query({
            redirect: '/blog/welcome',
        });
        expect(response.status).toBe(307);
        expect(response.headers['location']).toBe(
            `/cms-api/admin/login?next=${encodeURIComponent('/cms-api/draft?redirect=%2Fblog%2Fwelcome')}`
        );
    });

    it("serves the form, with the route it signs in at, where it goes after and the site's name", async () => {
        const response = await request(app).get('/admin/login').query({
            next: '/cms-api/draft?redirect=%2Fblog',
        });
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/^text\/html/);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['content-security-policy']).toBe("frame-ancestors 'none'");
        expect(configIn<SignInConfig>(response.text)).toEqual({
            signInPath: '/cms-api/sign-in',
            next: '/cms-api/draft?redirect=%2Fblog',
            noAccess: false,
            siteName: 'Hagen',
        });
    });

    it('never sends anyone off the site after signing in', async () => {
        for (const next of ['//evil.example', '/\\evil.example', 'https://evil.example']) {
            const response = await request(app).get('/admin/login').query({
                next,
            });
            expect(configIn<SignInConfig>(response.text).next).toBe('/cms-api/admin');
        }
    });

    it('sends an editor signed in already on to next', async () => {
        const response = await request(app).get('/admin/login').query({
            next: '/cms-api/admin',
        });
        const signedIn = await request(app).get('/admin/login').set('authorization', 'Bearer editor-token');
        expect(response.status).toBe(200);
        expect(signedIn.status).toBe(307);
        expect(signedIn.headers['location']).toBe('/cms-api/admin');
    });

    it('tells someone signed in without an editing role that the account cannot edit', async () => {
        const response = await request(app).get('/admin/login').set('authorization', 'Bearer viewer-token');
        expect(response.status).toBe(200);
        expect(configIn<SignInConfig>(response.text).noAccess).toBe(true);
    });
});

describe('signing in', () => {
    it('hands the email, password and request headers to signIn, and forwards the cookies it sets', async () => {
        const response = await signingIn({
            email: 'ada@example.com',
            password: 'correct horse',
        });
        expect(response.status).toBe(204);
        expect(response.headers['set-cookie']).toEqual(['session=ada; Path=/; HttpOnly']);
        expect(attempts).toHaveLength(1);
        expect(attempts[0]!.email).toBe('ada@example.com');
        expect(attempts[0]!.headers.get('user-agent')).toBe('test-browser');
    });

    it('answers a wrong email or password with the same message, and none of what the auth said', async () => {
        const wrongPassword = await signingIn({
            email: 'ada@example.com',
            password: 'wrong',
        });
        const unknownEmail = await signingIn({
            email: 'nobody@example.com',
            password: 'correct horse',
        });
        expect(wrongPassword.status).toBe(401);
        expect(wrongPassword.headers['set-cookie']).toBeUndefined();
        expect(wrongPassword.body.detail).toBe('Wrong email or password.');
        expect(unknownEmail.body).toEqual(wrongPassword.body);
        expect(unknownEmail.text).not.toContain('No user');
    });

    it('refuses a request from another site, or one naming no origin, before calling signIn', async () => {
        const otherSite = await request(app).post('/sign-in').set('host', HOST).set('origin', 'https://evil.example').send({
            email: 'ada@example.com',
            password: 'correct horse',
        });
        const noOrigin = await request(app).post('/sign-in').set('host', HOST).send({
            email: 'ada@example.com',
            password: 'correct horse',
        });
        expect(otherSite.status).toBe(403);
        expect(noOrigin.status).toBe(403);
        expect(attempts).toHaveLength(0);
    });

    it('compares the origin with the host a proxy forwarded', async () => {
        const response = await request(app)
            .post('/sign-in')
            .set('host', 'internal:3000')
            .set('x-forwarded-host', HOST)
            .set('origin', ORIGIN)
            .send({
                email: 'ada@example.com',
                password: 'correct horse',
            });
        expect(response.status).toBe(204);
    });
});

describe('signing out', () => {
    it('ends the session through signOut, closes draft mode, and lands on the sign-in screen', async () => {
        draft.enabled = true;
        jar.set(PREVIEW_COOKIE, 'token');
        const response = await request(app).post('/sign-out').set('host', HOST).set('origin', ORIGIN).set('cookie', 'session=ada');
        expect(response.status).toBe(303);
        expect(response.headers['location']).toBe(`/cms-api/admin/login?next=${encodeURIComponent('/cms-api/admin')}`);
        expect(response.headers['set-cookie']).toEqual(['session=; Path=/; Max-Age=0']);
        expect(signOuts[0]!.headers.get('cookie')).toBe('session=ada');
        expect(draft.enabled).toBe(false);
        expect(jar.has(PREVIEW_COOKIE)).toBe(false);
    });

    it('refuses a request from another site', async () => {
        const response = await request(app).post('/sign-out').set('host', HOST).set('origin', 'https://evil.example');
        expect(response.status).toBe(403);
        expect(signOuts).toHaveLength(0);
    });

    it("points the admin's Sign out at the route, sent as a form", async () => {
        const response = await request(app).get('/admin').set('authorization', 'Bearer editor-token');
        const served = configIn<AdminConfig>(response.text);
        expect(served.signOutPath).toBe('/cms-api/sign-out');
        expect(served.signOutMethod).toBe('POST');
    });

    it("gives the admin the site's name, for its tab titles", async () => {
        const response = await request(app).get('/admin').set('authorization', 'Bearer editor-token');
        expect(configIn<AdminConfig>(response.text).siteName).toBe('Hagen');
    });
});

describe('the sign-in screen of a deployment with several sites', () => {
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
            name: 'Hagen',
            db: drizzle(pglite),
            sites: declareSites(SiteSchema, {
                uk: {
                    label: 'Hagen UK',
                    url: 'https://hagen.example.co.uk',
                    icon: '/icons/uk.svg',
                },
                norway: {
                    label: 'Hagen Norge',
                    url: 'https://hagen.example.no',
                    icon: '/icons/norway.svg',
                },
            }),
            site: () => 'uk',
            auth: {
                identity: 'editor',
                signIn,
                signOut,
            },
        }),
    });
    const sitesApp = express();
    withSites.api.mount(sitesApp);

    it("asks the editor to sign in to the site this deployment shows, under that site's icon", async () => {
        const response = await request(sitesApp).get('/admin/login');
        const served = configIn<SignInConfig>(response.text);
        expect(served.siteName).toBe('Hagen UK');
        expect(served.siteIcon).toBe('https://hagen.example.co.uk/icons/uk.svg');
    });
});

describe('the sign-in options', () => {
    const configWith = (options: { signInPath?: string; signOutPath?: string }) => () =>
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
                auth: {
                    identity: 'editor',
                    signIn,
                    signOut,
                },
                ...options,
            }),
        });

    it('take signIn or signInPath, not both', () => {
        expect(
            configWith({
                signInPath: '/login',
            })
        ).toThrow('takes `auth.signIn`');
    });

    it('take signOut or signOutPath, not both', () => {
        expect(
            configWith({
                signOutPath: '/logout',
            })
        ).toThrow('takes `auth.signOut`');
    });
});
