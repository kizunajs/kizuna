import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { pluginExportsOf } from 'kizunajs/adapter';
import { expressAdapter } from '@kizunajs/express';
import { createMcpServer } from '@kizunajs/mcp';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { definePage } from './page.js';
import { defineCollection, defineGlobal } from './definitions.js';
import { cms } from './provider.js';
import { definePages } from './options.js';
import { declareSites, SiteSchema } from './site.js';
import { DocumentStore } from './storage/store.js';
import { memoryMediaStorage } from './media/storage.js';
import type { CmsExports } from './setup.js';
import type { AdminConfig } from './admin/config.js';

const k = new Kizuna();
const roles = Kizuna.roles(['editor', 'admin']);

const EDITORS: Record<string, { userId: string; role: 'editor' | 'admin'; sites?: Record<string, 'editor' | 'admin'> }> = {
    'nils-token': {
        userId: 'nils',
        role: 'editor',
        sites: {
            norway: 'editor',
        },
    },
    'grace-token': {
        userId: 'grace',
        role: 'admin',
    },
    'ada-token': {
        userId: 'ada',
        role: 'editor',
    },
    'sam-token': {
        userId: 'sam',
        role: 'editor',
        sites: {
            uk: 'editor',
        },
    },
    'uma-token': {
        userId: 'uma',
        role: 'editor',
        sites: {
            uk: 'admin',
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

const Offices = defineCollection({
    name: 'offices',
    id: Kizuna.brand('OfficeId', z.string()),
    fields: [
        {
            name: 'city',
            schema: z.string(),
        },
        {
            name: 'phone',
            schema: z.string(),
            perSite: true,
        },
    ],
});

const Events = defineCollection({
    name: 'events',
    id: Kizuna.brand('EventId', z.string()),
    fields: [
        {
            name: 'title',
            schema: z.string(),
        },
    ],
});

const Shops = defineCollection({
    name: 'shops',
    id: Kizuna.brand('ShopId', z.string()),
    fields: [
        {
            name: 'name',
            schema: z.string(),
        },
    ],
});

const PrivacyPolicy = defineGlobal({
    name: 'privacyPolicy',
    fields: [
        {
            name: 'text',
            schema: z.string(),
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
        {
            name: 'banner',
            schema: z.string().optional(),
            auth: {
                roles: 'admin',
            },
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
        collections: [Events],
    },
    norway: {
        label: 'Hagen Norge',
        url: 'https://hagen.example.no',
        icon: '/icons/norway.svg',
        pages: countryPages,
        collections: [Shops],
    },
});

const pglite = new PGlite();
const db = drizzle(pglite);
const config = defineConfig({
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
        globals: [PrivacyPolicy],
        collections: [Offices],
        auth: {
            identity: 'editor',
            roles: ['editor', 'admin'],
            sites: (signedIn) => signedIn.sites,
            people: {
                list: () =>
                    Object.values(EDITORS).map((person) => ({
                        id: person.userId,
                        name: person.userId,
                        roles: [person.role],
                        ...(person.sites === undefined
                            ? {}
                            : {
                                  sites: person.sites,
                              }),
                    })),
            },
        },
        media: {
            storage: memoryMediaStorage(),
        },
        revalidate: () => undefined,
    }),
});
const service = (pluginExportsOf(config.api)['cms'] as CmsExports).service;
const app = express();
config.api.mount(app);

type Editor = ReturnType<typeof as>;

const as = (token: string) => ({
    get: (path: string) => request(app).get(path).set('authorization', `Bearer ${token}`),
    post: (path: string) => request(app).post(path).set('authorization', `Bearer ${token}`),
    patch: (path: string) => request(app).patch(path).set('authorization', `Bearer ${token}`),
    delete: (path: string) => request(app).delete(path).set('authorization', `Bearer ${token}`),
});
const grace = as('grace-token');
const ada = as('ada-token');
const sam = as('sam-token');
const uma = as('uma-token');

/**
 * Saves changes to the draft of the document an editing path names.
 */
const save = (who: Editor, path: string, changes: Record<string, unknown>) =>
    who.patch(`/editing${path}/draft`).send({
        changes,
    });

const publish = (who: Editor, path: string) => who.post(`/editing${path}/publish`).send({});

const askReview = (who: Editor, ref: string, reviewer: string) =>
    who.post('/editing/reviews').send({
        refs: [ref],
        reviewers: [reviewer],
    });

const describeRef = (who: Editor, ref: string) =>
    who.get('/editing/describe').query({
        ref,
    });

const png = async (shade: number): Promise<Uint8Array> =>
    new Uint8Array(
        await sharp({
            create: {
                width: 2,
                height: 2,
                channels: 3,
                background: {
                    r: shade,
                    g: shade,
                    b: shade,
                },
            },
        })
            .png()
            .toBuffer()
    );

/**
 * A published shared office, by its id.
 */
const office = async (): Promise<string> => {
    const created = await grace.post('/editing/collections/offices/items').send({
        values: {
            city: 'London',
            phone: '+44 20 7946 0000',
        },
    });
    const id = created.body.ref.split(':').pop() as string;
    expect((await publish(grace, `/collections/offices/items/${id}`)).status).toBe(200);
    return id;
};

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec(
        'delete from cms_review_comments; delete from cms_reviews; delete from cms_refs; delete from cms_versions; delete from cms_documents;'
    );
});

afterAll(async () => {
    await pglite.close();
});

describe('an admin over every site', () => {
    it('opens every site, and publishes shared content', async () => {
        expect(
            (
                await save(grace, '/sites/norway/pages/frontPage', {
                    heading: 'Velkommen',
                })
            ).status
        ).toBe(200);
        expect((await publish(grace, '/sites/norway/pages/frontPage')).status).toBe(200);
        expect(
            (
                await save(grace, '/globals/privacyPolicy', {
                    text: 'We keep little.',
                })
            ).status
        ).toBe(200);
        expect((await publish(grace, '/globals/privacyPolicy')).status).toBe(200);
    });
});

describe('an editor with no site', () => {
    it('drafts shared content, and asks an admin over every site to publish it', async () => {
        expect(
            (
                await save(ada, '/globals/privacyPolicy', {
                    text: 'We keep little.',
                })
            ).status
        ).toBe(200);
        const refused = await publish(ada, '/globals/privacyPolicy');
        expect(refused.status).toBe(403);
        expect(refused.body.detail).toContain('an admin over every site publishes it');
        expect((await askReview(ada, 'global:privacyPolicy', 'grace')).status).toBe(201);
    });

    it('never unpublishes or deletes shared content', async () => {
        const id = await office();
        expect((await ada.post(`/editing/collections/offices/items/${id}/unpublish`).send({})).status).toBe(403);
        expect((await ada.delete(`/editing/collections/offices/items/${id}`)).status).toBe(403);
    });

    it('sees no site', async () => {
        const opened = await ada.get('/editing/sites/uk/pages/frontPage/draft');
        expect(opened.status).toBe(404);
        expect(opened.body.detail).toBe("There is no site named 'uk'.");
        expect((await ada.get('/editing/sites/uk/collections')).status).toBe(404);
        expect((await describeRef(ada, 'page:uk:frontPage')).status).toBe(404);
        expect((await ada.get('/editing/pages')).body.pages).toEqual([]);
    });
});

describe("a site's editor", () => {
    it('edits and publishes their own site by the one-site rules', async () => {
        expect(
            (
                await save(sam, '/sites/uk/pages/frontPage', {
                    heading: 'Welcome',
                })
            ).status
        ).toBe(200);
        expect((await publish(sam, '/sites/uk/pages/frontPage')).status).toBe(200);
        const banner = await save(sam, '/sites/uk/pages/frontPage', {
            banner: 'Spring sale',
        });
        expect(banner.status).toBe(403);
        expect(banner.body.detail).toBe("The field 'banner' takes the role 'admin'.");
        const created = await sam.post('/editing/sites/uk/collections/events/items').send({
            values: {
                title: 'Pruning roses',
            },
        });
        expect(created.status).toBe(201);
    });

    it("writes every field of their site as the site's admin, and drafts shared content", async () => {
        expect(
            (
                await save(uma, '/sites/uk/pages/frontPage', {
                    banner: 'Spring sale',
                })
            ).status
        ).toBe(200);
        expect(
            (
                await save(uma, '/sites/norway/pages/frontPage', {
                    heading: 'Hei',
                })
            ).status
        ).toBe(404);
        expect(
            (
                await save(uma, '/globals/privacyPolicy', {
                    text: 'We keep little.',
                })
            ).status
        ).toBe(200);
        expect((await publish(uma, '/globals/privacyPolicy')).status).toBe(403);
    });

    it('never sees another site', async () => {
        await save(grace, '/sites/norway/pages/frontPage', {
            heading: 'Velkommen',
        });
        await save(grace, '/sites/uk/pages/frontPage', {
            heading: 'Welcome',
        });
        await grace.post('/editing/sites/norway/collections/shops/items').send({
            values: {
                name: 'Bergen',
            },
        });
        expect((await sam.get('/editing/sites/norway/pages/frontPage/draft')).status).toBe(404);
        expect((await sam.get('/editing/sites/norway/collections/shops/items')).status).toBe(404);
        expect((await sam.get('/editing/sites/norway/globals')).status).toBe(404);
        expect((await describeRef(sam, 'page:norway:frontPage')).status).toBe(404);
        expect(
            (
                await sam.get('/editing/describe').query({
                    url: '/',
                    site: 'norway',
                })
            ).status
        ).toBe(404);
        expect((await sam.get('/editing/items/ShopId')).status).toBe(404);
        expect((await sam.get('/editing/pages')).body.pages.map((page: { site: string }) => page.site)).toEqual(['uk']);
        expect((await grace.get('/editing/pages')).body.pages.map((page: { site: string }) => page.site).sort()).toEqual(['norway', 'uk']);
    });

    it('names only the people who hold their site, and the admins over every site', async () => {
        const ids = async (who: Editor) => (await who.get('/editing/people')).body.people.map((person: { id: string }) => person.id).sort();
        expect(await ids(sam)).toEqual(['grace', 'sam', 'uma']);
        expect(await ids(grace)).toEqual(['ada', 'grace', 'nils', 'sam', 'uma']);
        await save(sam, '/sites/uk/pages/frontPage', {
            heading: 'Welcome',
        });
        const outside = await askReview(sam, 'page:uk:frontPage', 'nils');
        expect(outside.status).toBe(422);
        expect((await askReview(sam, 'page:uk:frontPage', 'uma')).status).toBe(201);
    });

    it('is offered a review in place of Publish on shared content', async () => {
        const id = await office();
        expect((await describeRef(sam, `item:offices:${id}`)).body.canPublish).toBe(false);
        expect((await describeRef(sam, `item:uk:offices:${id}`)).body.canPublish).toBe(true);
        expect((await describeRef(grace, `item:offices:${id}`)).body.canPublish).toBe(true);
        const changes = await sam.get(`/editing/collections/offices/items/${id}/changes`);
        expect(changes.body.canPublish).toBe(false);
        expect(changes.body.canPublishPastReview).toBe(false);
    });

    it("never sees another site's reviews", async () => {
        await save(grace, '/sites/norway/pages/frontPage', {
            heading: 'Velkommen',
        });
        const asked = await askReview(grace, 'page:norway:frontPage', 'nils');
        expect(asked.status).toBe(201);
        const waiting = await sam.get('/editing/reviews').query({
            for: 'anyone',
        });
        expect(waiting.body.reviews).toEqual([]);
        const decided = await sam.post('/editing/reviews/decide').send({
            ids: [asked.body.reviews[0].id],
            decision: 'approve',
        });
        expect(decided.status).toBe(404);
        expect((await askReview(sam, 'page:norway:frontPage', 'grace')).status).toBe(404);
    });

    it("shows a shared change and the site's values as two pending changes, and publishes only the site's", async () => {
        const id = await office();
        expect(
            (
                await save(sam, `/sites/uk/collections/offices/items/${id}`, {
                    phone: '+44 20 7946 0999',
                })
            ).status
        ).toBe(200);
        expect(
            (
                await save(sam, `/collections/offices/items/${id}`, {
                    city: 'Greater London',
                })
            ).status
        ).toBe(200);
        const siteChanges = await sam.get(`/editing/sites/uk/collections/offices/items/${id}/changes`);
        const sharedChanges = await sam.get(`/editing/collections/offices/items/${id}/changes`);
        expect(siteChanges.body.changes.map((change: { path: string }) => change.path)).toEqual(['phone']);
        expect(sharedChanges.body.changes.map((change: { path: string }) => change.path)).toEqual(['city']);
        expect((await publish(sam, `/sites/uk/collections/offices/items/${id}`)).status).toBe(200);
        expect((await publish(sam, `/collections/offices/items/${id}`)).status).toBe(403);
        expect((await askReview(sam, `item:offices:${id}`, 'grace')).status).toBe(201);
        expect((await publish(grace, `/collections/offices/items/${id}`)).status).toBe(200);
    });
});

describe("a site's editor in a chat", () => {
    const connect = async (token: string) => {
        const server = createMcpServer(config.api as never, {
            credentialHeaders: {
                authorization: `Bearer ${token}`,
            },
        });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({
            name: 'test-client',
            version: '1.0.0',
        });
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        return client;
    };

    it('reads their own site through the tools, and never another', async () => {
        await save(grace, '/sites/norway/pages/frontPage', {
            heading: 'Velkommen',
        });
        await save(grace, '/sites/uk/pages/frontPage', {
            heading: 'Welcome',
        });
        const client = await connect('sam-token');
        const own = await client.callTool({
            name: 'editing_describe',
            arguments: {
                query: {
                    ref: 'page:uk:frontPage',
                },
            },
        });
        expect(own.structuredContent).toMatchObject({
            status: 200,
        });
        const other = await client.callTool({
            name: 'editing_describe',
            arguments: {
                query: {
                    ref: 'page:norway:frontPage',
                },
            },
        });
        expect(other.isError).toBe(true);
        expect(JSON.parse((other.content as Array<{ text: string }>)[0]!.text)).toMatchObject({
            status: 404,
            body: {
                detail: "There is no site named 'norway'.",
            },
        });
    });
});

describe("a site's media", () => {
    it("keeps another site's images out of reach, and shared images to admins over every site", async () => {
        const shared = await service.media.storeBytes(await png(10), 'shared.png', 'grace');
        const norway = await service.media.storeBytes(await png(20), 'fjord.png', 'grace', undefined, 'norway');
        const uk = await service.media.storeBytes(await png(30), 'thames.png', 'grace', undefined, 'uk');
        const onUk = {
            site: 'uk',
        };

        expect(
            (
                await sam.get('/editing/media').query({
                    site: 'norway',
                })
            ).status
        ).toBe(404);
        const listed = await sam.get('/editing/media').query(onUk);
        expect(listed.body.media.map((record: { id: string }) => record.id).sort()).toEqual([shared.id, uk.id].sort());
        expect((await sam.get(`/editing/media/${norway.id}`)).status).toBe(404);
        expect((await sam.get(`/editing/media/${norway.id}/uses`)).status).toBe(404);
        expect((await sam.get(`/editing/media/${norway.id}/file`)).status).toBe(404);
        expect((await sam.delete(`/editing/media/${norway.id}`).query(onUk)).status).toBe(404);

        const alt = {
            alt: 'The Thames',
        };
        expect((await sam.patch(`/editing/media/${uk.id}`).query(onUk).send(alt)).status).toBe(200);
        expect((await sam.patch(`/editing/media/${shared.id}`).send(alt)).status).toBe(403);
        expect((await sam.delete(`/editing/media/${shared.id}`)).status).toBe(403);
        expect((await grace.patch(`/editing/media/${shared.id}`).send(alt)).status).toBe(200);
        expect((await sam.delete(`/editing/media/${uk.id}`).query(onUk)).status).toBe(204);
    });
});

describe('the admin', () => {
    const configOf = (html: string): AdminConfig =>
        JSON.parse(/<script id="kizuna-cms-config" type="application\/json">(.*?)<\/script>/s.exec(html)![1]!) as AdminConfig;

    it('lists only the sites the editor opens', async () => {
        expect(configOf((await grace.get('/admin')).text).sites?.map((site) => site.key)).toEqual(['uk', 'norway']);
        expect(configOf((await sam.get('/admin')).text).sites?.map((site) => site.key)).toEqual(['uk']);
        expect(configOf((await ada.get('/admin')).text).sites).toEqual([]);
    });

    it("answers 404 for another site's screens at every depth", async () => {
        for (const path of [
            '/admin/norway',
            '/admin/norway/pages',
            '/admin/norway/pages/frontPage',
            '/admin/norway/collections/shops',
            '/admin/norway/collections/shops/bergen',
        ]) {
            expect((await sam.get(path)).status, path).toBe(404);
            expect((await grace.get(path)).status, path).toBe(200);
        }
        expect((await sam.get('/admin/uk/collections/events')).status).toBe(200);
        expect((await sam.get('/admin/collections/offices')).status).toBe(200);
    });
});

describe('declareSites()', () => {
    it("refuses a site named like one of the admin's screens", () => {
        for (const name of ['pages', 'media', 'collections', 'globals', 'views', 'login']) {
            expect(() =>
                declareSites(SiteSchema, {
                    [name]: {
                        label: 'Hagen',
                        url: 'https://hagen.example.com',
                        icon: '/icons/group.svg',
                    },
                })
            ).toThrow(`declareSites() has a site named '${name}', which the admin's addresses use`);
        }
    });
});

describe('auth.sites', () => {
    it("needs the editor identity to declare 'admin'", () => {
        const editorsOnly = k.identity
            .bearer({
                context: z.object({
                    userId: z.string(),
                }),
                roles: Kizuna.roles(['editor']),
            })
            .guard(() => ({
                userId: 'ada',
                role: 'editor',
            }));
        expect(() =>
            defineConfig({
                auth: {
                    identities: {
                        editor: editorsOnly,
                    },
                },
                content: cms({
                    db,
                    sites,
                    auth: {
                        identity: 'editor',
                        sites: () => ({
                            uk: 'editor',
                        }),
                    },
                }),
            })
        ).toThrow("an admin over every site holds the role 'admin'");
    });
});
