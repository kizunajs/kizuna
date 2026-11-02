import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { pluginExportsOf } from 'kizunajs/adapter';
import { expressAdapter } from '@kizunajs/express';
import { definePage } from './page.js';
import { defineCollection } from './definitions.js';
import { cms } from './provider.js';
import { definePages } from './options.js';
import { declareSites, SiteSchema } from './site.js';
import { DocumentStore } from './storage/store.js';
import type { DocumentRef } from './refs.js';
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

const ShopId = Kizuna.brand('ShopId', z.string());

const Shops = defineCollection({
    name: 'shops',
    id: ShopId,
    chooseSites: true,
    fields: [
        {
            name: 'name',
            schema: z.string(),
        },
        {
            name: 'slug',
            schema: z.string(),
        },
    ],
});

const ShopPage = definePage({
    name: 'shopPage',
    collection: Shops,
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
        sites: declareSites(SiteSchema, {
            uk: {
                label: 'Hagen UK',
                url: 'https://hagen.example.co.uk',
                icon: '/icons/uk.svg',
                locales: ['en'],
                pages: definePages({
                    frontPage: {
                        path: '/',
                        page: FrontPage,
                    },
                    shopPage: {
                        path: '/shops/[slug]',
                        page: ShopPage,
                    },
                }),
            },
            norway: {
                label: 'Hagen Norge',
                url: 'https://hagen.example.no',
                icon: '/icons/norway.svg',
                locales: ['nb', 'en'],
                pages: definePages({
                    frontPage: {
                        path: '/',
                        page: FrontPage,
                    },
                    shopPage: {
                        path: '/butikker/[slug]',
                        page: ShopPage,
                    },
                }),
            },
        }),
        collections: [Shops],
        auth: {
            identity: 'editor',
        },
    }),
});
const service = (pluginExportsOf(config.api)['cms'] as CmsExports).service;

const shop = (id: string, locale?: string): DocumentRef => ({
    type: 'item',
    collection: 'shops',
    id,
    ...(locale === undefined
        ? {}
        : {
              locale,
          }),
});

const save = async (ref: DocumentRef, changes: Record<string, unknown>): Promise<void> => {
    await service.update({
        ref,
        changes,
        caller: {},
        author: 'ada',
    });
};

const publish = async (ref: DocumentRef, changes: Record<string, unknown>): Promise<void> => {
    await save(ref, changes);
    await service.publish(ref, 'ada');
};

/**
 * The Oslo shop on both sites, at /shops/oslo, /butikker/oslo and
 * /en/butikker/oslo.
 */
const oslo = async (): Promise<void> => {
    await publish(shop('oslo'), {
        name: 'Oslo',
        slug: 'oslo',
        showsOn: ['uk', 'norway'],
    });
    await publish(shop('oslo', 'nb'), {
        name: 'Oslo',
        slug: 'oslo',
    });
};

const redirects = async (site: string) =>
    (await service.redirects.list(site)).map((redirect) => ({
        locale: redirect.locale,
        from: redirect.from,
        to: redirect.to,
        status: redirect.status,
        origin: redirect.origin,
    }));

const fromOslo = (from: string, locale: string) => ({
    locale,
    from,
    to: {
        type: 'document',
        ref: 'item:shops:oslo',
    },
    status: 308,
    origin: 'rename',
});

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec(
        'delete from cms_redirects; delete from cms_redirect_versions; delete from cms_refs; delete from cms_versions; delete from cms_translations; delete from cms_documents;'
    );
});

afterAll(async () => {
    await pglite.close();
});

describe('redirects on rename', () => {
    it('makes none for a draft', async () => {
        await oslo();
        const version = await service.redirects.version('uk');
        await save(shop('oslo'), {
            slug: 'oslo-sentrum',
        });
        expect(await redirects('uk')).toEqual([]);
        expect(await service.redirects.version('uk')).toBe(version);
    });

    it('redirects each address that changed, per site and language, to the item', async () => {
        await oslo();
        await publish(shop('oslo'), {
            slug: 'oslo-central',
        });
        expect(await redirects('uk')).toEqual([fromOslo('/shops/oslo', 'en')]);
        expect(await redirects('norway')).toEqual([fromOslo('/en/butikker/oslo', 'en')]);
        await publish(shop('oslo', 'nb'), {
            slug: 'oslo-sentrum',
        });
        expect(await redirects('norway')).toEqual([fromOslo('/butikker/oslo', 'nb'), fromOslo('/en/butikker/oslo', 'en')]);
    });

    it('moves each changed site’s version on, in the publish', async () => {
        await oslo();
        const before = {
            uk: await service.redirects.version('uk'),
            norway: await service.redirects.version('norway'),
        };
        await publish(shop('oslo', 'nb'), {
            slug: 'oslo-sentrum',
        });
        expect(await service.redirects.version('uk')).toBe(before.uk);
        expect(await service.redirects.version('norway')).toBe(before.norway + 1);
    });

    it('removes the redirect when the item is renamed back', async () => {
        await oslo();
        await publish(shop('oslo'), {
            slug: 'oslo-central',
        });
        await publish(shop('oslo'), {
            slug: 'oslo',
        });
        expect(await redirects('uk')).toEqual([fromOslo('/shops/oslo-central', 'en')]);
        expect(await redirects('norway')).toEqual([fromOslo('/en/butikker/oslo-central', 'en')]);
    });

    it('keeps every earlier redirect pointing at the item, so none leads to another', async () => {
        await oslo();
        await publish(shop('oslo'), {
            slug: 'oslo-central',
        });
        await publish(shop('oslo'), {
            slug: 'oslo-sentrum',
        });
        expect(await redirects('uk')).toEqual([fromOslo('/shops/oslo', 'en'), fromOslo('/shops/oslo-central', 'en')]);
    });

    it('removes the redirect from an address a new item takes', async () => {
        await oslo();
        await publish(shop('oslo'), {
            slug: 'oslo-central',
        });
        await publish(shop('popup'), {
            name: 'Oslo pop-up',
            slug: 'oslo',
            showsOn: ['uk'],
        });
        expect(await redirects('uk')).toEqual([]);
        expect(await redirects('norway')).toEqual([fromOslo('/en/butikker/oslo', 'en')]);
    });

    it('lets two items in one release swap addresses without a redirect over either', async () => {
        await oslo();
        await publish(shop('bergen'), {
            name: 'Bergen',
            slug: 'bergen',
            showsOn: ['uk'],
        });
        for (const [id, slug] of [
            ['oslo', 'bergen'],
            ['bergen', 'oslo'],
        ] as const) {
            const { row } = await service.document(shop(id));
            await service.store.saveDraft({
                kind: 'item',
                key: `shops/${id}`,
                draft: {
                    ...row!.published,
                    slug,
                },
                author: 'ada',
            });
        }
        await service.publishTogether([shop('oslo'), shop('bergen')], 'ada');
        expect(await redirects('uk')).toEqual([]);
        expect(await redirects('norway')).toEqual([fromOslo('/en/butikker/oslo', 'en')]);
    });

    it('records on each published version where it was served', async () => {
        await oslo();
        const { row } = await service.document(shop('oslo'));
        const versions = await pglite.query<{ published_paths: unknown }>(
            'select published_paths from cms_versions where document_id = $1 and published_at is not null',
            [row!.id]
        );
        expect(versions.rows.map((version) => version.published_paths)).toEqual([
            [
                {
                    site: 'uk',
                    locale: 'en',
                    path: '/shops/oslo',
                },
                {
                    site: 'norway',
                    locale: 'en',
                    path: '/en/butikker/oslo',
                },
            ],
        ]);
    });
});
