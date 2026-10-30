import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { pluginExportsOf } from 'kizunajs/adapter';
import type { ContentRuntime } from 'kizunajs/plugin';
import { definePage } from './page.js';
import { defineCollection, defineGlobal } from './definitions.js';
import { cms } from './provider.js';
import { definePages } from './options.js';
import { declareSites, SiteSchema } from './site.js';
import { DocumentStore } from './storage/store.js';
import type { CmsExports } from './setup.js';
import type { DocumentRef } from './refs.js';

const cachedTags: string[][] = [];
const revalidated: string[] = [];

const runtime: ContentRuntime = {
    cache:
        (read, _keys, tags) =>
        async (...args) => {
            cachedTags.push([...tags]);
            return read(...args);
        },
    revalidate: (tags) => {
        revalidated.push(...tags);
    },
    draftMode: async () => ({
        enabled: false,
        enable: () => undefined,
        disable: () => undefined,
    }),
    cookies: async () => ({
        get: () => undefined,
        set: () => undefined,
        delete: () => undefined,
    }),
    notFound: async () => {
        throw new Error('NEXT_NOT_FOUND');
    },
};

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

const Offices = defineCollection({
    name: 'offices',
    id: Kizuna.brand('OfficeId', z.string()),
    fields: [
        {
            name: 'city',
            schema: z.string(),
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

const PrivacyPolicy = defineGlobal({
    name: 'privacyPolicy',
    fields: [
        {
            name: 'text',
            schema: z.string(),
        },
    ],
});

const countryPages = definePages({
    frontPage: {
        path: '/',
        page: definePage({
            name: 'frontPage',
            fields: [
                {
                    name: 'heading',
                    schema: z.string(),
                },
            ],
        }),
    },
});

const showing = {
    site: 'uk',
};

const pglite = new PGlite();
const db = drizzle(pglite);
const config = defineConfig({
    adapter: {
        name: 'test',
        mount: () => undefined,
        content: runtime,
    },
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
                pages: countryPages,
                collections: [Events],
            },
            norway: {
                label: 'Hagen Norge',
                url: 'https://hagen.example.no',
                icon: '/icons/norway.svg',
                pages: countryPages,
            },
        }),
        site: () => showing.site,
        globals: [PrivacyPolicy],
        collections: [Offices],
        auth: {
            identity: 'editor',
        },
    }),
});
const service = (pluginExportsOf(config.api)['cms'] as CmsExports).service;

const publish = async (ref: DocumentRef, changes: Record<string, unknown>): Promise<void> => {
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
    cachedTags.length = 0;
    revalidated.length = 0;
    showing.site = 'uk';
});

afterAll(async () => {
    await pglite.close();
});

describe('cached reads tagged by site', () => {
    it('tags what each site reads with that site', async () => {
        await publish(
            {
                type: 'global',
                name: 'privacyPolicy',
            },
            {
                text: 'We keep what you send us for a year.',
            }
        );
        await config.content.globals.privacyPolicy.get();
        await config.content.collections.offices.list();
        await config.content.of(['uk']).collections.events.list();
        showing.site = 'norway';
        await config.content.globals.privacyPolicy.get();
        expect(cachedTags).toEqual([
            ['kizuna-cms:global:uk:privacyPolicy'],
            ['kizuna-cms:collection:uk:offices'],
            ['kizuna-cms:collection:uk:events'],
            ['kizuna-cms:global:norway:privacyPolicy'],
        ]);
    });

    it('refreshes every site when shared content publishes', async () => {
        await publish(
            {
                type: 'global',
                name: 'privacyPolicy',
            },
            {
                text: 'We keep what you send us for a year.',
            }
        );
        expect(revalidated).toEqual(['kizuna-cms:global:uk:privacyPolicy', 'kizuna-cms:global:norway:privacyPolicy']);
        revalidated.length = 0;
        const office = await service.createItem(
            'offices',
            {
                city: 'London',
            },
            {},
            'ada'
        );
        await service.publish(office.target.ref, 'ada');
        expect(revalidated).toEqual(expect.arrayContaining(['kizuna-cms:collection:uk:offices', 'kizuna-cms:collection:norway:offices']));
    });

    it('refreshes only the site whose own content publishes', async () => {
        const created = await service.createItem(
            'events',
            {
                title: 'Open day',
            },
            {},
            'ada',
            'uk'
        );
        revalidated.length = 0;
        await service.publish(created.target.ref, 'ada');
        expect(revalidated.some((tag) => tag.includes('norway'))).toBe(false);
        expect(revalidated).toContain('kizuna-cms:collection:uk:events');
        revalidated.length = 0;
        await publish(
            {
                type: 'page',
                name: 'frontPage',
                site: 'norway',
            },
            {
                heading: 'Planter til hvert rom',
            }
        );
        expect(revalidated).toEqual(['kizuna-cms:page:norway:frontPage']);
    });
});
