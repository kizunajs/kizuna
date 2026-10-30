import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { pluginExportsOf } from 'kizunajs/adapter';
import { expressAdapter } from '@kizunajs/express';
import { definePage } from './page.js';
import { defineCollection, defineGlobal } from './definitions.js';
import { cms } from './provider.js';
import { definePages } from './options.js';
import { declareSites, SiteSchema } from './site.js';
import { DocumentStore } from './storage/store.js';
import { ImageSchema } from './image.js';
import { holdsText, translationOf } from './locales.js';
import { dataFields } from './field.js';
import type { CmsExports } from './setup.js';
import type { DocumentRef } from './refs.js';
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

const Offices = defineCollection({
    name: 'offices',
    id: Kizuna.brand('OfficeId', z.string()),
    fields: [
        {
            name: 'name',
            schema: z.string(),
            localized: false,
        },
        {
            name: 'description',
            schema: z.string(),
        },
        {
            name: 'phone',
            schema: z.string(),
            perSite: true,
            localized: false,
        },
        {
            name: 'photo',
            schema: ImageSchema.optional(),
        },
        {
            name: 'order',
            schema: z.int().default(0),
        },
    ],
    indexes: ['order'],
});

const PrivacyPolicy = defineGlobal({
    name: 'privacyPolicy',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
        {
            name: 'updatedOn',
            schema: z.iso.date(),
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
            name: 'intro',
            schema: z.string().optional(),
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
        locales: ['en'],
    },
    norway: {
        label: 'Hagen Norge',
        url: 'https://hagen.example.no',
        icon: '/icons/norway.svg',
        pages: countryPages,
        locales: ['nb', 'en'],
    },
});

const showing = {
    site: 'norway',
};
const revalidated: string[] = [];

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
        locales: ['en', 'nb'],
        sites,
        site: () => showing.site,
        globals: [PrivacyPolicy],
        collections: [Offices],
        auth: {
            identity: 'editor',
        },
        revalidate: (tags) => {
            revalidated.push(...tags);
        },
    }),
});
const service = (pluginExportsOf(config.api)['cms'] as CmsExports).service;
const app = express();
config.api.mount(app);

const write = async (ref: DocumentRef, changes: Record<string, unknown>): Promise<void> => {
    await service.update({
        ref,
        changes,
        caller: {},
        author: 'ada',
    });
};

const publish = async (ref: DocumentRef, changes: Record<string, unknown>): Promise<void> => {
    await write(ref, changes);
    await service.publish(ref, 'ada');
};

const office = async (): Promise<string> => {
    const created = await service.createItem(
        'offices',
        {
            name: 'Hagen Oslo',
            description: 'Our biggest shop.',
            phone: '+47 22 00 00 00',
            order: 1,
        },
        {},
        'ada'
    );
    await service.publish(created.target.ref, 'ada');
    return (created.target.ref as { id: string }).id;
};

const officeRef = (id: string, locale?: string): DocumentRef => ({
    type: 'item',
    collection: 'offices',
    id,
    ...(locale === undefined
        ? {}
        : {
              locale,
          }),
});

const norwayFront = (locale?: string): DocumentRef => ({
    type: 'page',
    name: 'frontPage',
    site: 'norway',
    ...(locale === undefined
        ? {}
        : {
              locale,
          }),
});

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec(
        'delete from cms_translations; delete from cms_refreshes; delete from cms_refs; delete from cms_versions; delete from cms_documents;'
    );
    showing.site = 'norway';
    revalidated.length = 0;
});

afterAll(async () => {
    await pglite.close();
});

describe('what is translated', () => {
    it('translates text and an image, and shares numbers, dates, enums and ids', () => {
        expect(holdsText(z.string())).toBe(true);
        expect(holdsText(z.string().optional())).toBe(true);
        expect(holdsText(ImageSchema)).toBe(true);
        expect(holdsText(z.array(z.object({ heading: z.string() })))).toBe(true);
        expect(holdsText(z.int())).toBe(false);
        expect(holdsText(z.boolean())).toBe(false);
        expect(holdsText(z.iso.date())).toBe(false);
        expect(holdsText(z.enum(['small', 'large']))).toBe(false);
        expect(holdsText(Kizuna.brand('OfficeId', z.string()))).toBe(false);
    });

    it("holds an image's alt text, and leaves out the fields marked not localized", () => {
        const fields = dataFields(translationOf(Offices)!.fields);
        expect(fields.map((field) => field.name)).toEqual(['description', 'photo']);
        expect(fields[1]!.label).toBe('Photo alt text');
    });
});

describe('storage', () => {
    it('keeps a copy per language under the same id, with the shared fields on the source alone', async () => {
        const id = await office();
        await write(officeRef(id, 'nb'), {
            description: 'Vår største butikk.',
        });
        const rows = await pglite.query<{ locale: string; draft: Record<string, unknown> }>(
            'select locale, draft from cms_documents order by locale'
        );
        expect(rows.rows.map((row) => row.locale)).toEqual(['default', 'nb']);
        expect(rows.rows[1]!.draft).toEqual({
            description: 'Vår største butikk.',
        });
        const draft = await service.draftState(officeRef(id, 'nb'));
        expect(draft.complete).toBe(true);
        expect(draft.status).toBe('draft');
    });

    it('refuses a shared field on a translation, and a language the document is not written in', async () => {
        const id = await office();
        await expect(write(officeRef(id, 'nb'), { order: 3 })).rejects.toMatchObject({
            status: 422,
        });
        await expect(write(officeRef(id, 'de'), { description: 'Unser größtes Geschäft.' })).rejects.toMatchObject({
            status: 404,
        });
        await expect(write(norwayFront('fr'), { heading: 'Bonjour' })).rejects.toMatchObject({
            status: 404,
        });
    });

    it("refuses a translation of a site's values, and of a document with nothing written yet", async () => {
        const id = await office();
        await expect(write({ ...officeRef(id, 'nb'), site: 'norway' }, { phone: '+47 1' })).rejects.toMatchObject({
            status: 400,
        });
        await expect(write(norwayFront('en'), { heading: 'Welcome' })).rejects.toMatchObject({
            status: 404,
        });
    });

    it("reads a site's first language as its source, addressed without a language", async () => {
        await write(norwayFront(), {
            heading: 'Velkommen',
        });
        expect(service.canonical(norwayFront('nb'))).toEqual(norwayFront());
        expect(service.target(norwayFront('en')).locale).toBe('en');
        expect(service.target(officeRef('x', 'en'))).toMatchObject({
            locale: 'default',
        });
    });

    it('deletes the translations with the item', async () => {
        const id = await office();
        await write(officeRef(id, 'nb'), {
            description: 'Vår største butikk.',
        });
        await service.deleteItem('offices', id);
        expect((await pglite.query('select id from cms_documents')).rows).toEqual([]);
        expect((await pglite.query('select document_id from cms_translations')).rows).toEqual([]);
    });

    it('keeps translations out of the lists editors see', async () => {
        const id = await office();
        await write(officeRef(id, 'nb'), {
            description: 'Vår største butikk.',
        });
        expect((await service.editorItems('offices')).map((item) => item.id)).toEqual([id]);
    });
});

describe('the locales on cms()', () => {
    const configOf = (options: { locales?: string[]; norway?: string[]; fallback?: Record<string, string[]> }) =>
        defineConfig({
            jobRunner: heldJobs,
            auth: {
                identities: {
                    editor,
                },
            },
            content: cms({
                db,
                ...(options.locales === undefined ? {} : { locales: options.locales }),
                ...(options.fallback === undefined ? {} : { fallback: options.fallback }),
                sites: declareSites(SiteSchema, {
                    norway: {
                        label: 'Hagen Norge',
                        url: 'https://hagen.example.no',
                        icon: '/icons/norway.svg',
                        ...(options.norway === undefined ? {} : { locales: options.norway }),
                    },
                }),
                auth: {
                    identity: 'editor',
                },
            }),
        });

    it('lists every language a site serves', () => {
        expect(() => configOf({ norway: ['nb'] })).toThrow(/serves 'nb', but cms\(\) lists no locales/);
        expect(() => configOf({ locales: ['en'], norway: ['nb', 'en'] })).toThrow(/serves 'nb', which `locales` on cms\(\) does not list/);
        expect(() => configOf({ locales: ['en', 'en'] })).toThrow(/lists a language twice/);
    });

    it('falls back only to languages it lists', () => {
        expect(() => configOf({ locales: ['de', 'fr'], fallback: { fr: ['it'] } })).toThrow(/names 'it', which `locales` does not list/);
    });
});
