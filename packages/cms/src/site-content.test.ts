import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { contentOf, flattenRoutes, pluginExportsOf } from 'kizunajs/adapter';
import { readMetaBrand } from 'kizunajs/generator';
import express from 'express';
import request from 'supertest';
import { expressAdapter } from '@kizunajs/express';
import { definePage } from './page.js';
import { defineCollection, defineGlobal } from './definitions.js';
import { cms } from './provider.js';
import { definePages } from './options.js';
import { declareSites, SiteSchema } from './site.js';
import { DocumentStore } from './storage/store.js';
import { formatRef, parseRef, type DocumentRef } from './refs.js';
import { stripPaths } from './source-path.js';
import type { CmsExports } from './setup.js';
import { heldJobs } from './held-jobs.fixture.js';

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

const OfficeId = Kizuna.brand('OfficeId', z.string());
const EventId = Kizuna.brand('EventId', z.string());

const Offices = defineCollection({
    name: 'offices',
    id: OfficeId,
    fields: [
        {
            name: 'city',
            schema: z.string(),
        },
    ],
});

const Events = defineCollection({
    name: 'events',
    id: EventId,
    fields: [
        {
            name: 'title',
            schema: z.string(),
        },
        {
            name: 'slug',
            schema: z.string(),
        },
    ],
});

const Footer = defineGlobal({
    name: 'footer',
    fields: [
        {
            name: 'text',
            schema: z.string(),
        },
    ],
});

const Settings = defineGlobal({
    name: 'settings',
    fields: [
        {
            name: 'phone',
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
    ],
});

const EventPage = definePage({
    name: 'eventPage',
    collection: Events,
});

const ukPages = definePages({
    frontPage: {
        path: '/',
        page: FrontPage,
    },
    eventPage: {
        path: '/events/[slug]',
        page: EventPage,
    },
});

const norwayPages = definePages({
    frontPage: {
        path: '/',
        page: FrontPage,
    },
});

const showing = {
    site: 'uk',
};

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
        sites: declareSites(SiteSchema, {
            uk: {
                label: 'Hagen UK',
                url: 'https://hagen.example.co.uk',
                icon: '/icons/uk.svg',
                pages: ukPages,
                globals: [Settings],
                collections: [Events],
            },
            norway: {
                label: 'Hagen Norge',
                url: 'https://hagen.example.no',
                icon: '/icons/norway.svg',
                pages: norwayPages,
                globals: [Settings],
                collections: [Events],
            },
        }),
        globals: [Footer],
        collections: [Offices],
        site: () => showing.site,
        auth: {
            identity: 'editor',
        },
    }),
});
const service = (pluginExportsOf(config.api)['cms'] as CmsExports).service;
const app = express();
config.api.mount(app);

const published = {
    draft: false,
};

const event = (title: string, slug: string) => ({
    title,
    slug,
});

const write = async (ref: DocumentRef, changes: Record<string, unknown>): Promise<void> => {
    await service.update({
        ref,
        changes,
        caller: {},
        author: 'ada',
    });
    await service.publish(ref, 'ada');
};

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec('delete from cms_refs; delete from cms_versions; delete from cms_documents;');
    showing.site = 'uk';
});

afterAll(async () => {
    await pglite.close();
});

describe('refs that carry a site', () => {
    it('writes the site after the type, and reads it back', () => {
        const refs: DocumentRef[] = [
            {
                type: 'global',
                name: 'settings',
                site: 'uk',
            },
            {
                type: 'item',
                collection: 'events',
                id: 'k3j9x2',
                site: 'uk',
            },
            {
                type: 'page',
                name: 'frontPage',
                site: 'norway',
            },
        ];
        expect(refs.map(formatRef)).toEqual(['global:uk:settings', 'item:uk:events:k3j9x2', 'page:norway:frontPage']);
        expect(refs.map((ref) => parseRef(formatRef(ref)))).toEqual(refs);
        expect(parseRef('global:footer')).toEqual({
            type: 'global',
            name: 'footer',
        });
        expect(parseRef('item:offices:k3j9x2')).toEqual({
            type: 'item',
            collection: 'offices',
            id: 'k3j9x2',
        });
        expect(parseRef('item:uk:events:k3j9x2:extra')).toBeUndefined();
    });
});

describe("a site's own globals and items", () => {
    it('stores a global of its own under its site, apart from the same global on another site', async () => {
        await write(
            {
                type: 'global',
                name: 'settings',
                site: 'uk',
            },
            {
                phone: '+44 20 7946 0000',
            }
        );
        await write(
            {
                type: 'global',
                name: 'settings',
                site: 'norway',
            },
            {
                phone: '+47 22 00 00 00',
            }
        );
        const stored = await service.store.list('global');
        expect(stored.map((row) => [row.site, row.key]).sort()).toEqual([
            ['norway', 'settings'],
            ['uk', 'settings'],
        ]);
        expect(
            (
                await service.published({
                    type: 'global',
                    name: 'settings',
                    site: 'norway',
                })
            )?.content
        ).toEqual({
            phone: '+47 22 00 00 00',
        });
    });

    it('refuses a global the site neither has of its own nor sets values on', () => {
        expect(() =>
            service.target({
                type: 'global',
                name: 'footer',
                site: 'uk',
            })
        ).toThrow('The footer global has no field the uk site sets.');
        expect(() =>
            service.target({
                type: 'global',
                name: 'settings',
            })
        ).toThrow("There is no global named 'settings'.");
    });

    it('lists only the items of the site asked for, and keeps shared items apart', async () => {
        const uk = await service.createItem('events', event('Open day', 'open-day'), {}, 'ada', 'uk');
        await service.publish(uk.target.ref, 'ada');
        const norway = await service.createItem('events', event('Åpen dag', 'open-day'), {}, 'ada', 'norway');
        await service.publish(norway.target.ref, 'ada');
        const office = await service.createItem(
            'offices',
            {
                city: 'Oslo',
            },
            {},
            'ada'
        );
        await service.publish(office.target.ref, 'ada');
        expect(formatRef(uk.target.ref)).toMatch(/^item:uk:events:/);
        expect(formatRef(office.target.ref)).toMatch(/^item:offices:/);
        const titles = async (site: string) =>
            (await service.listItems('events', published, site)).items.map((item) => stripPaths(item['title']));
        expect(await titles('uk')).toEqual(['Open day']);
        expect(await titles('norway')).toEqual(['Åpen dag']);
        expect((await service.listItems('offices', published)).items.map((item) => item['city'])).toEqual(['Oslo']);
        expect((await service.collectionSummaries()).map((summary) => [summary.name, summary.count])).toEqual([['offices', 1]]);
    });

    it('takes the same address on two sites, since each keeps its own items', async () => {
        await service.createItem('events', event('Open day', 'open-day'), {}, 'ada', 'uk');
        await expect(service.createItem('events', event('Åpen dag', 'open-day'), {}, 'ada', 'norway')).resolves.toBeDefined();
        await expect(service.createItem('events', event('Second', 'open-day'), {}, 'ada', 'uk')).rejects.toThrow(
            'Another item of events is already at /events/open-day'
        );
    });

    it("finds the item a site's page shows at an address, on that site", async () => {
        const created = await service.createItem('events', event('Open day', 'open-day'), {}, 'ada', 'uk');
        expect(await service.pageAt('/events/open-day', 'uk')).toEqual(created.target.ref);
        await service.publish(created.target.ref, 'ada');
        const shown = await config.content.of(['uk']).pages.eventPage.get({
            slug: 'open-day',
        });
        expect(stripPaths(shown.title)).toBe('Open day');
    });

    it('deletes an item of a site without touching the same id elsewhere', async () => {
        const created = await service.createItem('events', event('Open day', 'open-day'), {}, 'ada', 'uk');
        const ref = created.target.ref;
        if (ref.type !== 'item') throw new Error('expected an item');
        await expect(service.deleteItem('events', ref.id)).rejects.toThrow("There is no collection named 'events'.");
        await service.deleteItem('events', ref.id, 'uk');
        expect(await service.store.list('item', 'uk')).toEqual([]);
    });

    it('records each site’s own globals and collections for the snapshot', () => {
        const refs = contentOf(config.api)!
            .provider.documents()
            .map((document) => document.ref);
        expect(refs).toEqual([
            'page:uk:frontPage',
            'page:norway:frontPage',
            'global:footer',
            'collection:offices',
            'global:uk:settings',
            'collection:uk:events',
            'global:norway:settings',
            'collection:norway:events',
        ]);
    });
});

describe("the current site's view in process", () => {
    it('reads the shared content and the site’s own beside it', async () => {
        await write(
            {
                type: 'global',
                name: 'footer',
            },
            {
                text: 'Hagen since 1952',
            }
        );
        for (const [site, phone] of [
            ['uk', '+44 20 7946 0000'],
            ['norway', '+47 22 00 00 00'],
        ]) {
            await write(
                {
                    type: 'global',
                    name: 'settings',
                    site,
                },
                {
                    phone,
                }
            );
        }
        const created = await service.createItem('events', event('Open day', 'open-day'), {}, 'ada', 'uk');
        await service.publish(created.target.ref, 'ada');

        expect(stripPaths((await config.content.globals.footer.get()).text)).toBe('Hagen since 1952');
        expect(stripPaths((await config.content.globals.settings.get()).phone)).toBe('+44 20 7946 0000');
        const uk = config.content.of(['uk']);
        expect(uk.site).toBe('uk');
        expect((await uk.collections.events.list()).items.map((item) => stripPaths(item.title))).toEqual(['Open day']);

        showing.site = 'norway';
        expect(stripPaths((await config.content.globals.settings.get()).phone)).toBe('+47 22 00 00 00');
        expect((await config.content.of(['norway']).collections.events.list()).items).toEqual([]);
    });

    it('refuses a view of sites the deployment does not show', () => {
        expect(() => config.content.of(['norway'])).toThrow('This app shows norway, but `site` on cms() names uk.');
    });
});

describe('the content routes of each site', () => {
    it('serves each site under /content/sites/<site>, with the shared content beside its own', () => {
        const keys = flattenRoutes(config.api.routes as never)
            .map((entry) => entry.routeKey)
            .filter((key) => key.startsWith('content.'));
        expect(keys).toEqual(
            expect.arrayContaining([
                'content.sites.uk.pages.frontPage',
                'content.sites.uk.globals.footer',
                'content.sites.uk.globals.settings',
                'content.sites.uk.collections.offices.list',
                'content.sites.uk.collections.events.get',
                'content.sites.norway.globals.settings',
                'content.media.image',
            ])
        );
        expect(keys.filter((key) => !key.startsWith('content.sites.') && key !== 'content.media.image')).toEqual([]);
    });

    it("brands each item's id with its collection's id", () => {
        const routes = flattenRoutes(config.api.routes as never);
        const bodyOf = (routeKey: string) => {
            const response = routes.find((entry) => entry.routeKey === routeKey)!.route.responses[200] as { body: z.ZodObject };
            return response.body;
        };
        const listed = bodyOf('content.sites.uk.collections.offices.list').shape['items'] as z.ZodArray<z.ZodObject>;
        expect(readMetaBrand(listed.element.shape['id']!)).toBe('OfficeId');
        expect(readMetaBrand(bodyOf('content.sites.uk.collections.events.get').shape['id']!)).toBe('EventId');
    });

    it("reads a site's own items and globals, and the shared ones, over HTTP", async () => {
        const uk = await service.createItem('events', event('Open day', 'open-day'), {}, 'ada', 'uk');
        await service.publish(uk.target.ref, 'ada');
        const office = await service.createItem(
            'offices',
            {
                city: 'London',
            },
            {},
            'ada'
        );
        await service.publish(office.target.ref, 'ada');
        await write(
            {
                type: 'global',
                name: 'settings',
                site: 'norway',
            },
            {
                phone: '+47 22 00 00 00',
            }
        );
        const ukEvents = await request(app).get('/content/sites/uk/collections/events');
        expect(ukEvents.body.items.map((item: { title: string }) => item.title)).toEqual(['Open day']);
        expect((await request(app).get('/content/sites/norway/collections/events')).body.items).toEqual([]);
        const id = (uk.target.ref as { id: string }).id;
        expect((await request(app).get(`/content/sites/uk/collections/events/${id}`)).body.title).toBe('Open day');
        expect((await request(app).get(`/content/sites/norway/collections/events/${id}`)).status).toBe(404);
        for (const site of ['uk', 'norway']) {
            const offices = await request(app).get(`/content/sites/${site}/collections/offices`);
            expect(offices.body.items.map((item: { city: string }) => item.city)).toEqual(['London']);
        }
        expect((await request(app).get('/content/sites/norway/globals/settings')).body.content).toEqual({
            phone: '+47 22 00 00 00',
        });
        expect((await request(app).get('/content/sites/uk/globals/settings')).status).toBe(404);
        expect((await request(app).get('/content/globals/footer')).status).toBe(404);
    });
});

describe("editing a site's own globals and items", () => {
    it('drafts, publishes and versions a global of its own', async () => {
        const changed = await request(app)
            .patch('/editing/sites/uk/globals/settings/draft')
            .send({
                changes: {
                    phone: '+44 20 7946 0000',
                },
            });
        expect(changed.status).toBe(200);
        expect(changed.body.ref).toBe('global:uk:settings');
        expect((await request(app).post('/editing/sites/uk/globals/settings/publish').send({})).status).toBe(200);
        expect((await request(app).get('/editing/sites/uk/globals/settings/versions')).body.versions).toHaveLength(1);
        expect((await request(app).get('/editing/sites/uk/globals')).body.globals).toMatchObject([
            {
                name: 'settings',
                status: 'published',
            },
        ]);
        expect((await request(app).get('/editing/sites/norway/globals/settings/draft')).body.status).toBe('empty');
        expect((await request(app).get('/editing/globals')).body.globals.map((global: { name: string }) => global.name)).toEqual([
            'footer',
        ]);
    });

    it('adds, lists, publishes and deletes items of its own collection', async () => {
        const created = await request(app)
            .post('/editing/sites/uk/collections/events/items')
            .send({
                values: event('Open day', 'open-day'),
            });
        expect(created.status).toBe(201);
        const ref = parseRef(created.body.ref);
        if (ref?.type !== 'item') throw new Error('expected an item');
        expect(ref.site).toBe('uk');
        expect((await request(app).post(`/editing/sites/uk/collections/events/items/${ref.id}/publish`).send({})).status).toBe(200);
        const listed = await request(app).get('/editing/sites/uk/collections/events/items');
        expect(listed.body.items.map((item: { label: string; status: string }) => [item.label, item.status])).toEqual([
            ['Open day', 'published'],
        ]);
        expect((await request(app).get('/editing/sites/norway/collections/events/items')).body.items).toEqual([]);
        expect((await request(app).get('/editing/sites/uk/collections')).body.collections).toEqual([
            {
                name: 'events',
                label: 'Events',
                count: 1,
            },
        ]);
        const described = await request(app).get('/editing/describe').query({
            ref: created.body.ref,
        });
        expect(described.body.fields.map((field: { path: string }) => field.path)).toEqual(['title', 'slug']);
        expect((await request(app).delete(`/editing/sites/uk/collections/events/items/${ref.id}`)).status).toBe(204);
        expect((await request(app).get('/editing/sites/uk/collections/events/items')).body.items).toEqual([]);
    });

    it("publishes the site's editing routes as tools", () => {
        const tools = flattenRoutes(config.api.routes as never)
            .filter((entry) => (entry.route as { tool?: unknown }).tool !== undefined)
            .map((entry) => entry.routeKey);
        expect(tools).toEqual(
            expect.arrayContaining([
                'editing.sites.globals.updateDraft',
                'editing.sites.globals.publish',
                'editing.sites.collections.createItem',
                'editing.sites.collections.history',
            ])
        );
    });
});
