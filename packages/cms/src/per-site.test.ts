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
import { stripPaths } from './source-path.js';
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
            name: 'city',
            schema: z.string(),
        },
        {
            name: 'slug',
            schema: z.string(),
        },
        {
            name: 'phone',
            schema: z.string(),
            perSite: true,
        },
        {
            name: 'openingHours',
            schema: z.string().optional(),
            sites: ['uk'],
        },
    ],
});

const PrivacyPolicy = defineGlobal({
    name: 'privacyPolicy',
    fields: [
        {
            name: 'text',
            schema: z.string(),
            perSite: true,
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
            name: 'eventsHeading',
            schema: z.string().optional(),
            sites: ['uk'],
        },
    ],
});

const OfficesPage = definePage({
    name: 'officesPage',
    sites: ['uk'],
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
    ],
});

const OfficePage = definePage({
    name: 'officePage',
    collection: Offices,
});

const countryPages = definePages({
    frontPage: {
        path: '/',
        page: FrontPage,
    },
    officesPage: {
        path: '/offices',
        page: OfficesPage,
    },
    officePage: {
        path: '/offices/[slug]',
        page: OfficePage,
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

const showing = {
    site: 'uk',
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

const publish = async (ref: DocumentRef, changes: Record<string, unknown>): Promise<void> => {
    await service.update({
        ref,
        changes,
        caller: {},
        author: 'ada',
    });
    await service.publish(ref, 'ada');
};

const office = async (): Promise<string> => {
    const created = await service.createItem(
        'offices',
        {
            city: 'London',
            slug: 'london',
            phone: '+44 20 7946 0000',
        },
        {},
        'ada'
    );
    await service.publish(created.target.ref, 'ada');
    return (created.target.ref as { id: string }).id;
};

const bareSites = declareSites(SiteSchema, {
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
});

const configWith = (fields: ReturnType<typeof defineCollection>) =>
    defineConfig({
        jobRunner: heldJobs,
        auth: {
            identities: {
                editor,
            },
        },
        content: cms({
            db,
            sites: bareSites,
            collections: [fields],
            auth: {
                identity: 'editor',
            },
        }),
    });

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec('delete from cms_refs; delete from cms_versions; delete from cms_documents;');
    showing.site = 'uk';
    revalidated.length = 0;
});

afterAll(async () => {
    await pglite.close();
});

describe('a perSite field', () => {
    it("shows the site's value, and the shared value where the site sets none", async () => {
        const id = await office();
        await publish(
            {
                type: 'item',
                collection: 'offices',
                id,
                site: 'uk',
            },
            {
                phone: '+44 20 7000 1111',
            }
        );
        const uk = await config.content.collections.offices.get({
            id,
        });
        expect(stripPaths(uk.phone)).toBe('+44 20 7000 1111');
        expect(stripPaths(uk.city)).toBe('London');
        showing.site = 'norway';
        const norway = await config.content.collections.offices.get({
            id,
        });
        expect(stripPaths(norway.phone)).toBe('+44 20 7946 0000');
        const listed = await request(app).get('/content/sites/uk/collections/offices');
        expect(listed.body.items.map((item: { phone: string }) => item.phone)).toEqual(['+44 20 7000 1111']);
        expect((await request(app).get(`/content/sites/norway/collections/offices/${id}`)).body.phone).toBe('+44 20 7946 0000');
    });

    it("keeps the site's values a draft until its editors publish them", async () => {
        const id = await office();
        const ref: DocumentRef = {
            type: 'item',
            collection: 'offices',
            id,
            site: 'uk',
        };
        await service.update({
            ref,
            changes: {
                phone: '+44 20 7000 1111',
            },
            caller: {},
            author: 'ada',
        });
        expect((await request(app).get(`/content/sites/uk/collections/offices/${id}`)).body.phone).toBe('+44 20 7946 0000');
        revalidated.length = 0;
        await service.publish(ref, 'ada');
        expect((await request(app).get(`/content/sites/uk/collections/offices/${id}`)).body.phone).toBe('+44 20 7000 1111');
        expect(revalidated.length).toBeGreaterThan(0);
        expect(revalidated.some((tag) => tag.includes('norway'))).toBe(false);
        expect(revalidated).toContain(`kizuna-cms:item:uk:offices:${id}`);
    });

    it('works on a shared global too', async () => {
        await publish(
            {
                type: 'global',
                name: 'privacyPolicy',
            },
            {
                text: 'We keep what you send us for a year.',
            }
        );
        await publish(
            {
                type: 'global',
                name: 'privacyPolicy',
                site: 'norway',
            },
            {
                text: 'Vi tar vare på det du sender oss i ett år.',
            }
        );
        expect(stripPaths((await config.content.globals.privacyPolicy.get()).text)).toBe('We keep what you send us for a year.');
        showing.site = 'norway';
        expect(stripPaths((await config.content.globals.privacyPolicy.get()).text)).toBe('Vi tar vare på det du sender oss i ett år.');
    });

    it('marks each field Shared or with the site’s label, with the shared value as the placeholder', async () => {
        const id = await office();
        const shared = await request(app)
            .get('/editing/describe')
            .query({
                ref: `item:offices:${id}`,
            });
        expect(shared.body.fields.map((field: { path: string; belongsTo?: string }) => [field.path, field.belongsTo])).toEqual([
            ['city', 'Shared'],
            ['slug', 'Shared'],
            ['phone', 'Shared'],
        ]);
        const uk = await request(app)
            .get('/editing/describe')
            .query({
                ref: `item:uk:offices:${id}`,
            });
        expect(
            uk.body.fields.map((field: { path: string; belongsTo?: string; sharedValue?: unknown }) => [
                field.path,
                field.belongsTo,
                field.sharedValue,
            ])
        ).toEqual([
            ['phone', 'Hagen UK', '+44 20 7946 0000'],
            ['openingHours', 'Hagen UK', undefined],
        ]);
        const norway = await request(app)
            .get('/editing/describe')
            .query({
                ref: `item:norway:offices:${id}`,
            });
        expect(norway.body.fields.map((field: { path: string }) => field.path)).toEqual(['phone']);
    });

    it('needs the shared item before a site sets its values', async () => {
        await expect(
            service.update({
                ref: {
                    type: 'item',
                    collection: 'offices',
                    id: 'missing',
                    site: 'uk',
                },
                changes: {
                    phone: '+44 20 7000 1111',
                },
                caller: {},
                author: 'ada',
            })
        ).rejects.toThrow('Save the shared item first');
    });
});

describe('a field with sites', () => {
    it('shows and stores it only on the sites named', async () => {
        const id = await office();
        await publish(
            {
                type: 'item',
                collection: 'offices',
                id,
                site: 'uk',
            },
            {
                openingHours: 'Monday to Friday, 9 to 5',
            }
        );
        expect(
            stripPaths(
                (
                    await config.content.collections.offices.get({
                        id,
                    })
                ).openingHours
            )
        ).toBe('Monday to Friday, 9 to 5');
        showing.site = 'norway';
        expect(
            await config.content.collections.offices.get({
                id,
            })
        ).not.toHaveProperty('openingHours');
        await expect(
            service.update({
                ref: {
                    type: 'item',
                    collection: 'offices',
                    id,
                    site: 'norway',
                },
                changes: {
                    openingHours: 'Mandag til fredag',
                },
                caller: {},
                author: 'ada',
            })
        ).rejects.toThrow("has no field at 'openingHours'");
        await expect(
            service.update({
                ref: {
                    type: 'item',
                    collection: 'offices',
                    id,
                },
                changes: {
                    openingHours: 'Always',
                },
                caller: {},
                author: 'ada',
            })
        ).rejects.toThrow('only the uk site');
    });

    it('keeps a page with sites off the other sites, and a page field with sites off their page', async () => {
        expect(Object.keys(service.sites['uk']!)).toEqual(['frontPage', 'officesPage', 'officePage']);
        expect(Object.keys(service.sites['norway']!)).toEqual(['frontPage', 'officePage']);
        const norway = await request(app).get('/editing/describe').query({
            ref: 'page:norway:frontPage',
        });
        expect(norway.body.fields.map((field: { path: string }) => field.path)).toEqual(['heading']);
        expect((await request(app).get('/content/sites/norway/pages/officesPage')).status).toBe(404);
    });
});

describe('the rules', () => {
    it('refuses perSite on an address or indexed field', () => {
        const Indexed = defineCollection({
            name: 'offices',
            id: Kizuna.brand('OfficeId', z.string()),
            fields: [
                {
                    name: 'region',
                    schema: z.string(),
                    perSite: true,
                },
            ],
            indexes: ['region'],
        });
        expect(() => configWith(Indexed)).toThrow(
            "Collection 'offices' field 'region' is indexed, so every site shares it. Take off `perSite`."
        );
    });

    it('refuses a field with sites that a site may leave empty only if its schema allows', () => {
        const Required = defineCollection({
            name: 'offices',
            id: Kizuna.brand('OfficeId', z.string()),
            fields: [
                {
                    name: 'openingHours',
                    schema: z.string(),
                    sites: ['uk'],
                },
            ],
        });
        expect(() => configWith(Required)).toThrow('is missing on every other site, so its schema needs `.optional()`');
    });

    it('refuses a site no declareSites() names', () => {
        const Unknown = defineCollection({
            name: 'offices',
            id: Kizuna.brand('OfficeId', z.string()),
            fields: [
                {
                    name: 'openingHours',
                    schema: z.string().optional(),
                    sites: ['denmark'],
                },
            ],
        });
        expect(() => configWith(Unknown)).toThrow("names the site 'denmark', which declareSites() does not declare");
    });
});
