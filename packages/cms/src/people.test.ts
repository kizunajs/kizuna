import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { definePage } from './page.js';
import { cms } from './provider.js';
import { definePages, type Person } from './options.js';
import { declareSites, SiteSchema } from './site.js';
import { memoryMediaStorage } from './media/storage.js';
import { heldJobs } from './held-jobs.fixture.js';

const k = new Kizuna();
const roles = Kizuna.roles(['editor', 'admin']);

type SiteRoles = Record<string, string | readonly string[]>;

const TOKENS: Record<string, string> = {
    'grace-token': 'grace',
    'uma-token': 'uma',
    'sam-token': 'sam',
};

/**
 * The app's users, which `invite` and `setSites` write to.
 */
let people: Array<Person & { role: 'editor' | 'admin'; sites: SiteRoles }> = [];

const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
            sites: z.record(z.string(), z.enum(['editor', 'admin'])).optional(),
        }),
        roles,
    })
    .guard(({ bearer, deny }) => {
        const found = people.find((person) => person.id === TOKENS[bearer?.token ?? '']);
        if (found !== undefined) {
            return {
                userId: found.id,
                role: found.role,
                sites: found.sites as Record<string, 'editor' | 'admin'>,
            };
        }
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
    ],
});

const countryPages = definePages({
    frontPage: {
        path: '/',
        page: FrontPage,
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
const config = defineConfig({
    jobRunner: heldJobs,
    adapter: expressAdapter(),
    auth: {
        identities: {
            editor,
        },
    },
    content: cms({
        db: drizzle(pglite),
        sites,
        site: () => 'uk',
        auth: {
            identity: 'editor',
            roles: ['editor', 'admin'],
            sites: (signedIn) => signedIn.sites,
            people: {
                list: () =>
                    people.map((person) => ({
                        id: person.id,
                        name: person.name,
                        email: `${person.id}@hagen.example.com`,
                        roles: [person.role],
                        sites: person.sites,
                    })),
                invite: ({ email, sites: given }) => {
                    const id = email.split('@')[0]!;
                    people.push({
                        id,
                        name: id,
                        role: 'editor',
                        sites: given,
                    });
                    return {
                        id,
                        link: `https://hagen.example.com/sign-in?for=${id}`,
                    };
                },
                setSites: ({ id, sites: given }) => {
                    const found = people.find((person) => person.id === id)!;
                    found.sites = given;
                },
            },
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
const uma = as('uma-token');
const sam = as('sam-token');

const sitesOf = (id: string) => people.find((person) => person.id === id)?.sites;

beforeEach(() => {
    people = [
        {
            id: 'grace',
            name: 'Grace',
            role: 'admin',
            sites: {},
        },
        {
            id: 'uma',
            name: 'Uma',
            role: 'editor',
            sites: {
                uk: 'admin',
            },
        },
        {
            id: 'sam',
            name: 'Sam',
            role: 'editor',
            sites: {
                uk: 'editor',
            },
        },
        {
            id: 'nils',
            name: 'Nils',
            role: 'editor',
            sites: {
                uk: 'editor',
                norway: 'admin',
            },
        },
    ];
});

afterAll(async () => {
    await pglite.close();
});

describe('the people list', () => {
    it("names each person's roles on the sites the caller may open", async () => {
        const listed = await sam.get('/editing/people');
        expect(listed.status).toBe(200);
        const nils = listed.body.people.find((person: { id: string }) => person.id === 'nils');
        expect(nils.sites).toEqual({
            uk: ['editor'],
        });
        const everywhere = (await grace.get('/editing/people')).body.people.find((person: { id: string }) => person.id === 'nils');
        expect(everywhere.sites).toEqual({
            uk: ['editor'],
            norway: ['admin'],
        });
    });

    it('says what the caller may change', async () => {
        expect((await grace.get('/editing/people')).body.manage).toEqual({
            sites: ['uk', 'norway'],
            roles: ['editor', 'admin'],
            invite: true,
            change: true,
        });
        expect((await uma.get('/editing/people')).body.manage.sites).toEqual(['uk']);
        expect((await sam.get('/editing/people')).body.manage.sites).toEqual([]);
    });
});

describe('inviting', () => {
    it('adds someone with a role on each site, and hands back their sign-in link', async () => {
        const invited = await grace.post('/editing/people').send({
            email: 'kari@hagen.example.com',
            sites: {
                norway: 'editor',
            },
        });
        expect(invited.status).toBe(201);
        expect(invited.body).toEqual({
            id: 'kari',
            link: 'https://hagen.example.com/sign-in?for=kari',
        });
        expect(sitesOf('kari')).toEqual({
            norway: 'editor',
        });
    });

    it('lets an admin of a site invite to that site alone', async () => {
        const own = await uma.post('/editing/people').send({
            email: 'ola@hagen.example.com',
            sites: {
                uk: 'editor',
            },
        });
        expect(own.status).toBe(201);
        const other = await uma.post('/editing/people').send({
            email: 'per@hagen.example.com',
            sites: {
                norway: 'editor',
            },
        });
        expect(other.status).toBe(404);
        expect(sitesOf('per')).toBeUndefined();
    });

    it('refuses an editor who is no admin', async () => {
        const refused = await sam.post('/editing/people').send({
            email: 'ola@hagen.example.com',
            sites: {
                uk: 'editor',
            },
        });
        expect(refused.status).toBe(403);
        expect(sitesOf('ola')).toBeUndefined();
    });

    it('refuses someone who already edits, a role nobody holds, and no sites', async () => {
        expect(
            (
                await grace.post('/editing/people').send({
                    email: 'sam@hagen.example.com',
                    sites: {
                        uk: 'editor',
                    },
                })
            ).status
        ).toBe(409);
        expect(
            (
                await grace.post('/editing/people').send({
                    email: 'ola@hagen.example.com',
                    sites: {
                        uk: 'owner',
                    },
                })
            ).status
        ).toBe(422);
        expect(
            (
                await grace.post('/editing/people').send({
                    email: 'ola@hagen.example.com',
                    sites: {},
                })
            ).status
        ).toBe(422);
    });
});

describe('changing roles', () => {
    it('changes the sites named and keeps the rest', async () => {
        const changed = await grace.patch('/editing/people/nils').send({
            sites: {
                uk: 'admin',
            },
        });
        expect(changed.status).toBe(204);
        expect(sitesOf('nils')).toEqual({
            uk: 'admin',
            norway: 'admin',
        });
    });

    it('takes a site away with null', async () => {
        expect(
            (
                await uma.patch('/editing/people/nils').send({
                    sites: {
                        uk: null,
                    },
                })
            ).status
        ).toBe(204);
        expect(sitesOf('nils')).toEqual({
            norway: 'admin',
        });
    });

    it("refuses an admin of one site on another site's roles", async () => {
        const refused = await uma.patch('/editing/people/nils').send({
            sites: {
                norway: null,
            },
        });
        expect(refused.status).toBe(404);
        expect(sitesOf('nils')).toEqual({
            uk: 'editor',
            norway: 'admin',
        });
    });

    it('refuses an editor who is no admin', async () => {
        const refused = await sam.patch('/editing/people/sam').send({
            sites: {
                uk: 'admin',
            },
        });
        expect(refused.status).toBe(403);
        expect(sitesOf('sam')).toEqual({
            uk: 'editor',
        });
    });
});
