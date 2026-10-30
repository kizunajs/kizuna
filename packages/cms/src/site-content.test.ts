import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { contentOf, pluginExportsOf } from 'kizunajs/adapter';
import { definePage } from './page.js';
import { defineCollection, defineGlobal } from './definitions.js';
import { cms } from './provider.js';
import { definePages } from './options.js';
import { declareSites, SiteSchema } from './site.js';
import { DocumentStore } from './storage/store.js';
import { formatRef, parseRef, type DocumentRef } from './refs.js';
import { stripPaths } from './source-path.js';
import type { CmsExports } from './setup.js';

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

    it('refuses a global the site does not have of its own', () => {
        expect(() =>
            service.target({
                type: 'global',
                name: 'footer',
                site: 'uk',
            })
        ).toThrow("The uk site has no global of its own named 'footer'.");
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
            (await service.listItems('events', { draft: false }, site)).items.map((item) => stripPaths(item['title']));
        expect(await titles('uk')).toEqual(['Open day']);
        expect(await titles('norway')).toEqual(['Åpen dag']);
        expect((await service.listItems('offices', { draft: false })).items.map((item) => item['city'])).toEqual(['Oslo']);
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
