import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { pluginExportsOf } from 'kizunajs/adapter';
import { definePage } from './page.js';
import type { CmsExports } from './setup.js';
import { cms } from './provider.js';
import { DocumentStore } from './storage/store.js';
import { localeCacheTag, pageCacheTag, type CmsService } from './cms.js';
import { RichTextSchema } from './rich-text.js';
import { link, LINK_BRAND } from './links.js';
import { declareSites, SiteSchema } from './site.js';
import type { DocumentRef } from './refs.js';

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

const pglite = new PGlite();
const db = drizzle(pglite);

const pageNamed = (name: string) =>
    definePage({
        name,
        fields: [
            {
                name: 'heading',
                schema: z.string(),
            },
        ],
    });

/**
 * The CMS as one build of the app sees it: the pages at the paths its folders
 * give them, over the same database as every other build.
 */
const serviceWith = (pages: Record<string, string>): CmsService => {
    const content = cms({
        db,
        pages: Object.fromEntries(
            Object.entries(pages).map(([name, path]) => [
                name,
                {
                    path,
                    page: pageNamed(name),
                },
            ])
        ),
        auth: {
            identity: 'editor',
        },
        appDir: 'src/__fixtures__/app',
    });
    const config = defineConfig({
        jobRunner: {
            mode: 'in-process',
        },
        auth: {
            identities: {
                editor,
            },
        },
        content,
    });
    return (pluginExportsOf(config.api)['cms'] as CmsExports).service;
};

const write = async (service: CmsService, name: string, heading: string): Promise<void> => {
    await service.update({
        ref: {
            type: 'page',
            name,
        },
        changes: {
            heading,
        },
        caller: {},
        author: 'ada',
    });
};

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec(
        'delete from cms_comments; delete from cms_reviews; delete from cms_refs; delete from cms_versions; delete from cms_documents;'
    );
});

afterAll(async () => {
    await pglite.close();
});

describe('pages stored by name', () => {
    it('keep their content when their folder moves', async () => {
        await write(
            serviceWith({
                pricingPage: '/pricing',
            }),
            'pricingPage',
            'Plans for every team'
        );
        const moved = serviceWith({
            pricingPage: '/plans',
        });
        const state = await moved.draftState({
            type: 'page',
            name: 'pricingPage',
        });
        expect(state.row?.draft).toEqual({
            heading: 'Plans for every team',
        });
        expect(await moved.orphanedPages()).toEqual([]);
    });

    it('list the content a renamed page left behind, and move it to the new name', async () => {
        await write(
            serviceWith({
                pricingPage: '/pricing',
            }),
            'pricingPage',
            'Plans for every team'
        );
        const renamed = serviceWith({
            plansPage: '/pricing',
        });
        expect((await renamed.orphanedPages()).map((orphan) => orphan.name)).toEqual(['pricingPage']);
        const stored = await renamed.store.get('page', 'pricingPage');
        await renamed.store.addReviews([
            {
                requestId: 'request-1',
                ref: 'page:pricingPage',
                documentId: stored!.id,
                version: 1,
                reviewers: ['grace'],
                requestedBy: 'ada',
                note: null,
                createdAt: new Date(),
            },
        ]);
        await renamed.renamePage('pricingPage', 'plansPage');
        expect(await renamed.orphanedPages()).toEqual([]);
        expect((await renamed.store.reviewsOf(stored!.id)).map((review) => review.ref)).toEqual(['page:plansPage']);
        const state = await renamed.draftState({
            type: 'page',
            name: 'plansPage',
        });
        expect(state.row?.draft).toEqual({
            heading: 'Plans for every team',
        });
        expect(state.version).toBe(1);
    });

    it('refuse a rename onto a page with content, onto no page, or away from a page that still exists', async () => {
        const before = serviceWith({
            pricingPage: '/pricing',
            plansPage: '/plans',
        });
        await write(before, 'pricingPage', 'Old');
        await write(before, 'plansPage', 'New');
        const after = serviceWith({
            plansPage: '/plans',
        });
        await expect(after.renamePage('pricingPage', 'plansPage')).rejects.toThrow('has content of its own');
        await expect(after.renamePage('pricingPage', 'missingPage')).rejects.toThrow("No page named 'missingPage'");
        await expect(before.renamePage('pricingPage', 'plansPage')).rejects.toThrow('is still a page');
    });
});

const revalidated: string[] = [];

const frontPage = definePage({
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

const serviceOf = (content: ReturnType<typeof cms>): CmsService =>
    (
        pluginExportsOf(
            defineConfig({
                jobRunner: {
                    mode: 'in-process',
                },
                auth: {
                    identities: {
                        editor,
                    },
                },
                content,
            }).api
        )['cms'] as CmsExports
    ).service;

/**
 * One app's CMS with a front page that links, and a page by the name given.
 */
const linkingService = (name: string): CmsService =>
    serviceOf(
        cms({
            db,
            pages: {
                frontPage: {
                    path: '/',
                    page: frontPage,
                },
                [name]: {
                    path: '/pricing',
                    page: pageNamed(name),
                },
            },
            auth: {
                identity: 'editor',
            },
            appDir: 'src/__fixtures__/app',
            revalidate: (tags) => {
                revalidated.push(...tags);
            },
        })
    );

/**
 * Two sites over one database: the uk site's guide under the name given,
 * and a norway site in two languages whose front page links to it.
 */
const sitesService = (name: string): CmsService =>
    serviceOf(
        cms({
            db,
            locales: ['nb', 'en'],
            sites: declareSites(SiteSchema, {
                uk: {
                    label: 'United Kingdom',
                    url: 'https://uk.example.com',
                    icon: '/icons/uk.svg',
                    locales: ['en'],
                    pages: {
                        [name]: {
                            path: '/plant-care',
                            page: pageNamed(name),
                        },
                    },
                },
                norway: {
                    label: 'Norge',
                    url: 'https://example.no',
                    icon: '/icons/norway.svg',
                    locales: ['nb', 'en'],
                    pages: {
                        frontPage: {
                            path: '/',
                            page: frontPage,
                        },
                    },
                },
            }),
            auth: {
                identity: 'editor',
            },
            appDir: 'src/__fixtures__/app',
            revalidate: (tags) => {
                revalidated.push(...tags);
            },
        })
    );

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
                _key: 'pricing',
                ref,
            },
        ],
        children: [
            {
                _type: 'span',
                _key: 'linked',
                text: 'See our plans',
                marks: ['pricing'],
            },
        ],
    },
];

const save = async (service: CmsService, ref: DocumentRef, changes: Record<string, unknown>): Promise<void> => {
    await service.update({
        ref,
        changes,
        caller: {},
        author: 'ada',
    });
};

/**
 * The refs a document's links hold, draft and published.
 */
const linkRefsOf = async (id: string): Promise<string[]> => {
    const { rows } = await pglite.query<{ ref_id: string; published: boolean }>(
        'select ref_id, published from cms_refs where document_id = $1 and brand = $2 order by published, field_path',
        [id, LINK_BRAND]
    );
    return rows.map((row) => `${row.published ? 'published' : 'draft'} ${row.ref_id}`);
};

describe('renaming a page', () => {
    beforeEach(() => {
        revalidated.length = 0;
    });

    it('moves the links other documents hold to it, in the draft and the published copy', async () => {
        const before = linkingService('pricingPage');
        const front: DocumentRef = {
            type: 'page',
            name: 'frontPage',
        };
        await write(before, 'pricingPage', 'Plans for every team');
        await before.publish(
            {
                type: 'page',
                name: 'pricingPage',
            },
            'ada'
        );
        await save(before, front, {
            heading: 'Welcome',
            body: linkedText('page:pricingPage'),
            cta: {
                ref: 'page:pricingPage',
                label: 'See plans',
            },
        });
        await before.publish(front, 'ada');
        await save(before, front, {
            heading: 'Welcome back',
        });
        const after = linkingService('plansPage');
        expect(await after.renamePage('pricingPage', 'plansPage')).toBe(2);
        const stored = await after.store.get('page', 'frontPage');
        for (const copy of [stored!.draft!, stored!.published!]) {
            expect(copy['body']).toEqual(linkedText('page:plansPage'));
            expect(copy['cta']).toEqual({
                ref: 'page:plansPage',
                label: 'See plans',
            });
        }
        expect(stored!.draft!['heading']).toBe('Welcome back');
        expect(await linkRefsOf(stored!.id)).toEqual([
            'draft page:plansPage',
            'draft page:plansPage',
            'published page:plansPage',
            'published page:plansPage',
        ]);
        expect(revalidated).toContain(pageCacheTag('frontPage'));
        expect((await after.publishedOn(front, 'default'))!.content['cta']).toEqual({
            href: '/pricing',
            label: 'See plans',
        });
    });

    it("moves a site's page links from another site and from a translation, and leaves other links alone", async () => {
        const before = sitesService('plantCarePage');
        const front: DocumentRef = {
            type: 'page',
            name: 'frontPage',
            site: 'norway',
        };
        await save(
            before,
            {
                type: 'page',
                name: 'plantCarePage',
                site: 'uk',
            },
            {
                heading: 'Plant care',
            }
        );
        await save(before, front, {
            heading: 'Velkommen',
            body: linkedText('page:uk:plantCarePage'),
            cta: {
                href: 'https://example.com/plants',
                label: 'Planter',
            },
        });
        await before.publish(front, 'ada');
        await save(
            before,
            {
                ...front,
                locale: 'en',
            },
            {
                body: linkedText('page:uk:plantCarePage'),
            }
        );
        const after = sitesService('plantGuidePage');
        expect(await after.renamePage('plantCarePage', 'plantGuidePage', 'uk')).toBe(2);
        const source = await after.store.get('page', 'frontPage', 'norway');
        expect(source!.published!['body']).toEqual(linkedText('page:uk:plantGuidePage'));
        expect(source!.draft!['body']).toEqual(linkedText('page:uk:plantGuidePage'));
        expect(source!.published!['cta']).toEqual({
            href: 'https://example.com/plants',
            label: 'Planter',
        });
        expect(await linkRefsOf(source!.id)).toEqual(['draft page:uk:plantGuidePage', 'published page:uk:plantGuidePage']);
        const translation = await after.store.get('page', 'frontPage', 'norway', 'en');
        expect(translation!.draft!['body']).toEqual(linkedText('page:uk:plantGuidePage'));
        expect(await linkRefsOf(translation!.id)).toEqual(['draft page:uk:plantGuidePage']);
        expect(revalidated).toContain(pageCacheTag('frontPage', 'norway'));
        expect(revalidated).toContain(localeCacheTag(pageCacheTag('frontPage', 'norway'), 'en'));
    });
});
