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
import { RichTextSchema } from './rich-text.js';
import { link, LINK_BRAND } from './links.js';
import { resolvedSchema } from './content-schema.js';
import { pageCacheTag } from './cms.js';
import { heldJobs } from './held-jobs.fixture.js';
import type { CmsExports } from './setup.js';
import type { DocumentRef } from './refs.js';

const k = new Kizuna();
const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
    })
    .guard(({ bearer, deny }) =>
        bearer?.token === 'token'
            ? {
                  userId: 'ada',
              }
            : deny({
                  status: 401,
                  body: {
                      detail: 'Unauthorized',
                  },
              })
    );

const Shops = defineCollection({
    name: 'shops',
    id: Kizuna.brand('ShopId', z.string()),
    fields: [
        {
            name: 'name',
            schema: z.string(),
            localized: false,
        },
        {
            name: 'slug',
            schema: z.string(),
            localized: false,
        },
    ],
});

const Footer = defineGlobal({
    name: 'footer',
    fields: [
        {
            name: 'links',
            schema: z.array(link()).optional(),
        },
    ],
});

const textPage = <const Name extends string, const Sites extends readonly string[]>(page: { name: Name; sites: Sites }) =>
    definePage({
        ...page,
        fields: [
            {
                name: 'heading',
                schema: z.string(),
            },
        ],
    });

const countryFront = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
        {
            name: 'body',
            schema: RichTextSchema.optional(),
        },
        {
            name: 'cta',
            schema: link().optional(),
        },
    ],
});

const countryPages = definePages({
    frontPage: {
        path: '/',
        page: countryFront,
    },
    plantCarePage: {
        path: '/plant-care',
        page: textPage({
            name: 'plantCarePage',
            sites: ['uk'],
        }),
    },
    shopsPage: {
        path: '/butikker',
        page: textPage({
            name: 'shopsPage',
            sites: ['norway'],
        }),
    },
    shopPage: {
        path: '/shops/[slug]',
        page: definePage({
            name: 'shopPage',
            collection: Shops,
        }),
    },
});

const groupPages = definePages({
    frontPage: {
        path: '/',
        page: countryFront,
    },
});

const sites = declareSites(SiteSchema, {
    group: {
        label: 'Hagen Group',
        url: 'https://hagen.example.com',
        icon: '/icons/group.svg',
        locales: ['en'],
        pages: groupPages,
    },
    uk: {
        label: 'Hagen UK',
        url: 'https://hagen.example.co.uk/',
        icon: '/icons/uk.svg',
        locales: ['en'],
        pages: countryPages,
    },
    norway: {
        label: 'Hagen Norge',
        url: 'https://hagen.example.no',
        icon: '/icons/norway.svg',
        locales: ['nb', 'en'],
        pages: countryPages,
    },
});

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
        site: () => 'norway',
        globals: [Footer],
        collections: [Shops],
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

const page = (site: string, name: string, locale?: string): DocumentRef => ({
    type: 'page',
    name,
    site,
    ...(locale === undefined
        ? {}
        : {
              locale,
          }),
});

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

const shop = async (slug: string): Promise<string> => {
    const created = await service.createItem(
        'shops',
        {
            name: 'Hagen Oslo',
            slug,
        },
        {},
        'ada'
    );
    await service.publish(created.target.ref, 'ada');
    return (created.target.ref as { id: string }).id;
};

/**
 * Rich text of one paragraph whose words link to the ref given.
 */
const linkedText = (ref: string) => [
    {
        _type: 'block',
        _key: 'paragraph',
        style: 'normal',
        markDefs: [
            {
                _type: 'link',
                _key: 'shops',
                ref,
            },
        ],
        children: [
            {
                _type: 'span',
                _key: 'before',
                text: 'Visit ',
                marks: [],
            },
            {
                _type: 'span',
                _key: 'linked',
                text: 'our shops',
                marks: ['shops', 'strong'],
            },
        ],
    },
];

/**
 * The norway front page, published with a link to the ref given in its body
 * and its call to action.
 */
const linkFromNorway = async (ref: string): Promise<void> => {
    await publish(page('norway', 'frontPage'), {
        heading: 'Velkommen',
        body: linkedText(ref),
        cta: {
            ref,
            label: 'Se butikkene',
        },
    });
};

/**
 * The norway front page's body link and call to action as a reader in the
 * language given sees them.
 */
const readNorway = async (locale?: string) => {
    const content = (await service.publishedOn(page('norway', 'frontPage'), 'norway', locale))!.content;
    const [block] = content['body'] as Array<{ markDefs: Array<{ href: string }>; children: Array<{ marks: string[] }> }>;
    return {
        body: block!.markDefs[0]?.href,
        marks: block!.children[1]!.marks,
        cta: content['cta'] as { href: string | null; label?: string },
    };
};

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    revalidated.length = 0;
    await pglite.exec('delete from cms_reviews; delete from cms_refs; delete from cms_versions; delete from cms_documents;');
});

afterAll(async () => {
    await pglite.close();
});

describe('link()', () => {
    it('holds a ref to a page or an item, or a URL, never both', () => {
        const schema = link();
        expect(
            schema.safeParse({
                ref: 'page:uk:plantCarePage',
            }).success
        ).toBe(true);
        expect(
            schema.safeParse({
                href: 'https://example.com',
                label: 'Example',
            }).success
        ).toBe(true);
        expect(
            schema.safeParse({
                ref: 'page:uk:plantCarePage',
                href: 'https://example.com',
            }).success
        ).toBe(false);
        expect(schema.safeParse({}).success).toBe(false);
        expect(
            schema.safeParse({
                ref: 'global:footer',
            }).success
        ).toBe(false);
        expect(
            schema.safeParse({
                href: 'javascript:alert(1)',
            }).success
        ).toBe(false);
    });

    it('reads as its href and label in the output schema the clients are generated from', () => {
        expect(
            resolvedSchema(link()).safeParse({
                href: null,
                label: 'Shops',
            }).success
        ).toBe(true);
        const [block] = (resolvedSchema(RichTextSchema) as z.ZodArray).parse([
            {
                ...linkedText('page:uk:plantCarePage')[0],
                markDefs: [
                    {
                        _type: 'link',
                        _key: 'shops',
                        href: '/plant-care',
                    },
                ],
            },
        ]) as Array<{ markDefs: Array<{ href: string }> }>;
        expect(block!.markDefs[0]!.href).toBe('/plant-care');
    });
});

describe('reading a content link', () => {
    it("goes to a page on the site being read as a path in the reader's language", async () => {
        await publish(page('norway', 'shopsPage'), {
            heading: 'Butikker',
        });
        await linkFromNorway('page:norway:shopsPage');
        expect(await readNorway()).toEqual({
            body: '/butikker',
            marks: ['shops', 'strong'],
            cta: {
                href: '/butikker',
                label: 'Se butikkene',
            },
        });
        // The English reader sees the Norwegian page until it is written in English.
        await publish(page('norway', 'frontPage', 'en'), {
            heading: 'Welcome',
            body: linkedText('page:norway:shopsPage'),
        });
        expect((await readNorway('en')).body).toBe('/butikker');
        await publish(page('norway', 'shopsPage', 'en'), {
            heading: 'Shops',
        });
        expect((await readNorway('en')).body).toBe('/en/butikker');
    });

    it("goes to a page on another site at that site's address, in a language it serves", async () => {
        await publish(page('uk', 'plantCarePage'), {
            heading: 'Plant care',
        });
        await linkFromNorway('page:uk:plantCarePage');
        expect((await readNorway()).body).toBe('https://hagen.example.co.uk/plant-care');
        await publish(page('norway', 'shopsPage'), {
            heading: 'Butikker',
        });
        await publish(page('norway', 'shopsPage', 'en'), {
            heading: 'Shops',
        });
        await publish(page('group', 'frontPage'), {
            heading: 'Hagen Group',
            body: linkedText('page:norway:shopsPage'),
        });
        const group = (await service.publishedOn(page('group', 'frontPage'), 'group'))!.content;
        expect((group['body'] as Array<{ markDefs: Array<{ href: string }> }>)[0]!.markDefs[0]!.href).toBe(
            'https://hagen.example.no/en/butikker'
        );
    });

    it('goes to the page that shows an item, on the site being read when it shows it', async () => {
        const id = await shop('oslo');
        await linkFromNorway(`item:shops:${id}`);
        expect((await readNorway()).body).toBe('/shops/oslo');
        await publish(page('group', 'frontPage'), {
            heading: 'Hagen Group',
            body: linkedText(`item:shops:${id}`),
        });
        const group = (await service.publishedOn(page('group', 'frontPage'), 'group'))!.content;
        expect((group['body'] as Array<{ markDefs: Array<{ href: string }> }>)[0]!.markDefs[0]!.href).toBe(
            'https://hagen.example.co.uk/shops/oslo'
        );
    });

    it("goes from shared content to a site's own page on that site, whichever site reads it", async () => {
        await publish(page('norway', 'shopsPage'), {
            heading: 'Butikker',
        });
        await publish(
            {
                type: 'global',
                name: 'footer',
            },
            {
                links: [
                    {
                        ref: 'page:norway:shopsPage',
                        label: 'Butikker',
                    },
                    {
                        href: 'https://example.com/careers',
                        label: 'Careers',
                    },
                ],
            }
        );
        const footer = (await service.publishedOn(
            {
                type: 'global',
                name: 'footer',
            },
            'uk'
        ))!.content;
        expect(footer['links']).toEqual([
            {
                href: 'https://hagen.example.no/butikker',
                label: 'Butikker',
            },
            {
                href: 'https://example.com/careers',
                label: 'Careers',
            },
        ]);
    });

    it('follows an item to its new address, since the link holds its id', async () => {
        const id = await shop('oslo');
        await linkFromNorway(`item:shops:${id}`);
        await publish(
            {
                type: 'item',
                collection: 'shops',
                id,
            },
            {
                slug: 'oslo-sentrum',
            }
        );
        expect((await readNorway()).body).toBe('/shops/oslo-sentrum');
        expect(revalidated).toContain(pageCacheTag('frontPage', 'norway'));
    });

    it('reads as plain text while its page is unpublished, and the publish dialog hears of it', async () => {
        await publish(page('uk', 'plantCarePage'), {
            heading: 'Plant care',
        });
        await linkFromNorway('page:uk:plantCarePage');
        revalidated.length = 0;
        await service.unpublish(page('uk', 'plantCarePage'), 'ada');
        expect(revalidated).toContain(pageCacheTag('frontPage', 'norway'));
        expect(await readNorway()).toEqual({
            body: undefined,
            marks: ['strong'],
            cta: {
                href: null,
                label: 'Se butikkene',
            },
        });
        expect(await service.brokenLinksOf(page('norway', 'frontPage'))).toEqual([
            {
                path: 'body.0.markDefs.0',
                target: 'page:uk:plantCarePage',
                reason: 'unpublished',
            },
            {
                path: 'cta',
                target: 'page:uk:plantCarePage',
                reason: 'unpublished',
            },
        ]);
        const changes = await request(app).get('/editing/sites/norway/pages/frontPage/changes').set('authorization', 'Bearer token');
        expect(changes.body.brokenLinks).toHaveLength(2);
    });

    it('reads as plain text once its item is in the trash, and says so', async () => {
        const id = await shop('oslo');
        await linkFromNorway(`item:shops:${id}`);
        await service.deleteItem('shops', id);
        expect((await readNorway()).body).toBeUndefined();
        expect((await service.brokenLinksOf(page('norway', 'frontPage'))).map((broken) => broken.reason)).toEqual(['trashed', 'trashed']);
    });

    it('shows a draft target in draft mode', async () => {
        await write(page('uk', 'plantCarePage'), {
            heading: 'Plant care',
        });
        await linkFromNorway('page:uk:plantCarePage');
        expect((await readNorway()).body).toBeUndefined();
        const draft = (await service.draftOn(page('norway', 'frontPage'), 'norway', true))!;
        expect((draft['body'] as Array<{ markDefs: Array<{ href: string }> }>)[0]!.markDefs[0]!.href).toBe(
            'https://hagen.example.co.uk/plant-care'
        );
    });
});

describe('the links index', () => {
    it('records each content link in cms_refs, for where-used and Linked from', async () => {
        await publish(page('uk', 'plantCarePage'), {
            heading: 'Plant care',
        });
        await linkFromNorway('page:uk:plantCarePage');
        const rows = await pglite.query<{ ref_id: string; field_path: string; published: boolean }>(
            `select ref_id, field_path, published from cms_refs where brand = '${LINK_BRAND}' order by field_path, published`
        );
        expect(rows.rows).toEqual([
            {
                ref_id: 'page:uk:plantCarePage',
                field_path: 'body.0.markDefs.0',
                published: false,
            },
            {
                ref_id: 'page:uk:plantCarePage',
                field_path: 'body.0.markDefs.0',
                published: true,
            },
            {
                ref_id: 'page:uk:plantCarePage',
                field_path: 'cta',
                published: false,
            },
            {
                ref_id: 'page:uk:plantCarePage',
                field_path: 'cta',
                published: true,
            },
        ]);
        expect(await service.contentLinks()).toEqual([
            {
                from: 'page:norway:frontPage',
                fromSite: 'norway',
                to: 'page:uk:plantCarePage',
                fieldPaths: ['body.0.markDefs.0', 'cta'],
                published: true,
            },
        ]);
        const linked = await request(app)
            .get('/editing/linked-from')
            .query({
                ref: 'page:uk:plantCarePage',
            })
            .set('authorization', 'Bearer token');
        expect(linked.body.documents).toEqual([
            {
                ref: 'page:norway:frontPage',
                label: 'Front',
                site: 'norway',
                siteLabel: 'Hagen Norge',
                siteIcon: 'https://hagen.example.no/icons/norway.svg',
                path: '/',
                fieldPaths: ['body.0.markDefs.0', 'cta'],
            },
        ]);
    });

    it('finds pages and items to link to across the sites, and names the ones given', async () => {
        await publish(page('uk', 'plantCarePage'), {
            heading: 'Plant care',
        });
        const id = await shop('oslo');
        const found = await request(app)
            .get('/editing/link-targets')
            .query({
                q: 'plant',
            })
            .set('authorization', 'Bearer token');
        expect(found.body.targets).toEqual([
            {
                ref: 'page:uk:plantCarePage',
                label: 'Plant care',
                site: 'uk',
                siteLabel: 'Hagen UK',
                siteIcon: 'https://hagen.example.co.uk/icons/uk.svg',
                path: '/plant-care',
                status: 'published',
            },
        ]);
        const named = await request(app)
            .get('/editing/link-targets')
            .query({
                refs: [`item:shops:${id}`, 'page:norway:shopsPage', 'page:uk:gonePage'],
            })
            .set('authorization', 'Bearer token');
        expect(named.body.targets.map((target: { label: string; site: string; path: string | null; status: string }) => target)).toEqual([
            {
                ref: `item:shops:${id}`,
                label: 'Hagen Oslo',
                site: 'default',
                siteLabel: 'Shared',
                siteIcon: null,
                path: '/shops/oslo',
                status: 'published',
            },
            {
                ref: 'page:norway:shopsPage',
                label: 'Shops',
                site: 'norway',
                siteLabel: 'Hagen Norge',
                siteIcon: 'https://hagen.example.no/icons/norway.svg',
                path: '/butikker',
                status: 'missing',
            },
            {
                ref: 'page:uk:gonePage',
                label: 'page:uk:gonePage',
                site: 'uk',
                siteLabel: 'Hagen UK',
                siteIcon: 'https://hagen.example.co.uk/icons/uk.svg',
                path: null,
                status: 'missing',
            },
        ]);
    });
});

describe('resolving a URL to a link target', () => {
    const resolve = (url: string) =>
        request(app)
            .get('/editing/link-targets/resolve')
            .query({
                url,
            })
            .set('authorization', 'Bearer token');

    it("finds a page by its site's url and its path", async () => {
        await publish(page('uk', 'plantCarePage'), {
            heading: 'Plant care',
        });
        const found = await resolve('https://hagen.example.co.uk/plant-care');
        expect(found.status).toBe(200);
        expect(found.body.target).toEqual({
            ref: 'page:uk:plantCarePage',
            label: 'Plant care',
            site: 'uk',
            siteLabel: 'Hagen UK',
            siteIcon: 'https://hagen.example.co.uk/icons/uk.svg',
            path: '/plant-care',
            status: 'published',
        });
    });

    it('finds a page in any language its site serves, the first at the root and each other under its code', async () => {
        expect((await resolve('https://hagen.example.no/butikker')).body.target.ref).toBe('page:norway:shopsPage');
        expect((await resolve('https://hagen.example.no/en/butikker')).body.target.ref).toBe('page:norway:shopsPage');
        expect((await resolve('https://hagen.example.no')).body.target.ref).toBe('page:norway:frontPage');
        expect((await resolve('https://hagen.example.no/en')).body.target.ref).toBe('page:norway:frontPage');
        expect((await resolve('https://hagen.example.no/nb/butikker')).status).toBe(404);
    });

    it('finds the item a collection page shows at the address', async () => {
        const id = await shop('oslo');
        const found = await resolve('https://hagen.example.no/en/shops/oslo?utm_source=newsletter#hours');
        expect(found.body.target).toMatchObject({
            ref: `item:shops:${id}`,
            label: 'Hagen Oslo',
            path: '/shops/oslo',
        });
        expect((await resolve('https://hagen.example.no/shops/bergen')).status).toBe(404);
    });

    it('matches paths exactly, so a trailing slash is another address', async () => {
        expect((await resolve('https://hagen.example.co.uk/plant-care/')).status).toBe(404);
        expect((await resolve('https://hagen.example.no/en/')).status).toBe(404);
        const id = await shop('oslo');
        expect((await resolve('https://hagen.example.no/shops/oslo/')).status).toBe(404);
        expect((await resolve(`https://hagen.example.no/shops/oslo`)).body.target.ref).toBe(`item:shops:${id}`);
    });

    it('finds nothing on a host no site is on, or in a URL that is not one', async () => {
        expect((await resolve('https://www.instagram.com/hagen')).status).toBe(404);
        expect((await resolve('/plant-care')).status).toBe(404);
        expect((await resolve('mailto:hello@hagen.example.no')).status).toBe(404);
    });
});
