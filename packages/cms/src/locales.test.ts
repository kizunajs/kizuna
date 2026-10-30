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

describe('reading a language', () => {
    it("reads a site's first language by default, and a translation with `locale`", async () => {
        await publish(norwayFront(), {
            heading: 'Velkommen',
            intro: 'Hagen i Norge.',
        });
        expect((await config.content.pages.frontPage.get()).heading).toBe('Velkommen');
        await expect(
            config.content.pages.frontPage.get({
                locale: 'en',
            })
        ).rejects.toMatchObject({
            status: 404,
        });
        await write(norwayFront('en'), {
            heading: 'Welcome',
        });
        await expect(
            config.content.pages.frontPage.get({
                locale: 'en',
            })
        ).rejects.toMatchObject({
            status: 404,
        });
        await service.publish(norwayFront('en'), 'ada');
        const english = await config.content.pages.frontPage.get({
            locale: 'en',
        });
        expect(english.heading).toBe('Welcome');
        expect(english.intro).toBeUndefined();
    });

    it('refuses a language the site does not serve', async () => {
        showing.site = 'uk';
        await expect(
            config.content.pages.frontPage.get({
                locale: 'nb',
            })
        ).rejects.toMatchObject({
            status: 404,
        });
        expect((await request(app).get('/content/sites/uk/pages/frontPage?locale=nb')).status).toBe(400);
    });

    it('shows shared content in the language a site reads, with the shared fields from the source', async () => {
        const id = await office();
        await publish(officeRef(id), {
            photo: {
                id: 'missing',
                alt: 'The shop front',
            },
        });
        expect((await config.content.collections.offices.list()).items).toEqual([]);
        await publish(officeRef(id, 'nb'), {
            description: 'Vår største butikk.',
            photo: 'Butikkfronten',
        });
        const [norwegian] = (await config.content.collections.offices.list()).items;
        expect(norwegian).toMatchObject({
            id,
            name: 'Hagen Oslo',
            description: 'Vår største butikk.',
            phone: '+47 22 00 00 00',
            order: 1,
        });
        expect(
            (
                await config.content.collections.offices.get({
                    id,
                })
            ).photo?.alt
        ).toBe('Butikkfronten');
        showing.site = 'uk';
        expect(
            (
                await config.content.collections.offices.get({
                    id,
                })
            ).description
        ).toBe('Our biggest shop.');
    });

    it('takes `locale` over HTTP', async () => {
        const id = await office();
        await publish(officeRef(id, 'nb'), {
            description: 'Vår største butikk.',
        });
        await publish(norwayFront(), {
            heading: 'Velkommen',
        });
        await publish(norwayFront('en'), {
            heading: 'Welcome',
        });
        expect((await request(app).get('/content/sites/norway/pages/frontPage?locale=en')).body.content.heading).toBe('Welcome');
        expect((await request(app).get('/content/sites/norway/pages/frontPage')).body.content.heading).toBe('Velkommen');
        expect((await request(app).get(`/content/sites/norway/collections/offices/${id}`)).body.description).toBe('Vår største butikk.');
        expect((await request(app).get(`/content/sites/norway/collections/offices?locale=en`)).body.items[0].description).toBe(
            'Our biggest shop.'
        );
    });
});

const Products = defineCollection({
    name: 'products',
    id: Kizuna.brand('ProductId', z.string()),
    fields: [
        {
            name: 'name',
            schema: z.string(),
        },
        {
            name: 'code',
            schema: z.string(),
            localized: false,
        },
    ],
});

describe('fallback', () => {
    const shop = defineConfig({
        jobRunner: heldJobs,
        auth: {
            identities: {
                editor,
            },
        },
        content: cms({
            db,
            locales: ['de', 'fr', 'it'],
            fallback: {
                fr: ['de'],
                it: ['fr'],
            },
            collections: [Products],
            auth: {
                identity: 'editor',
            },
        }),
    });
    const shopService = (pluginExportsOf(shop.api)['cms'] as CmsExports).service;
    const productRef = (id: string, locale?: string): DocumentRef => ({
        type: 'item',
        collection: 'products',
        id,
        ...(locale === undefined ? {} : { locale }),
    });

    it('shows the languages `fallback` names, a published translation only, and nothing without one', async () => {
        const created = await shopService.createItem(
            'products',
            {
                name: 'Warmwasserspeicher',
                code: 'HWT-300',
            },
            {},
            'ada'
        );
        const id = (created.target.ref as { id: string }).id;
        await shopService.publish(productRef(id), 'ada');
        const read = (locale: string) =>
            shop.content.collections.products.get({
                id,
                locale,
            });
        expect((await read('fr')).name).toBe('Warmwasserspeicher');
        await expect(read('it')).rejects.toMatchObject({
            status: 404,
        });
        await shopService.update({
            ref: productRef(id, 'fr'),
            changes: {
                name: 'Chauffe-eau',
            },
            caller: {},
            author: 'ada',
        });
        await expect(read('it')).rejects.toMatchObject({
            status: 404,
        });
        await shopService.publish(productRef(id, 'fr'), 'ada');
        expect(await read('it')).toMatchObject({
            name: 'Chauffe-eau',
            code: 'HWT-300',
        });
    });
});

describe('sites', () => {
    it('drops every language when the source publishes, and one language when its translation does', async () => {
        await publish(norwayFront(), {
            heading: 'Velkommen',
        });
        expect(revalidated).toContain('kizuna-cms:page:norway:frontPage');
        revalidated.length = 0;
        await publish(norwayFront('en'), {
            heading: 'Welcome',
        });
        expect(revalidated).toEqual(['kizuna-cms:page:norway:frontPage@en']);
        const id = await office();
        revalidated.length = 0;
        await publish(officeRef(id, 'nb'), {
            description: 'Vår største butikk.',
        });
        expect(revalidated).toEqual(
            expect.arrayContaining([
                `kizuna-cms:item:norway:offices:${id}@nb`,
                'kizuna-cms:collection:norway:offices@nb',
                'kizuna-cms:collection:uk:offices@nb',
            ])
        );
        expect(revalidated.every((tag) => tag.endsWith('@nb'))).toBe(true);
    });

    it("reads a site's other languages under their code, and its first at the root", async () => {
        await publish(norwayFront(), {
            heading: 'Velkommen',
        });
        expect(await service.pageAt('/', 'norway')).toEqual(norwayFront());
        expect(await service.pageAt('/en', 'norway')).toEqual(norwayFront('en'));
        expect(await service.pageAt('/en', 'uk')).toBeUndefined();
        expect(service.localizedPath(service.target(norwayFront('en')), '/')).toBe('/en');
        expect(service.localizedPath(service.target(norwayFront()), '/')).toBe('/');
    });
});
