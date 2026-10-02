import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { pluginExportsOf } from 'kizunajs/adapter';
import { definePage } from './page.js';
import { defineCollection, defineGlobal } from './definitions.js';
import { definePages } from './options.js';
import { cmsPlugin, type CmsExports } from './plugin.js';
import { DocumentStore } from './storage/store.js';
import { decodePath, stripPaths } from './source-path.js';
import type { DocumentRef } from './refs.js';
import type { RichTextContent } from './next.js';

const draftState = {
    enabled: false,
};

/**
 * What the Next cache was asked to keep, so a test can tell what reached it.
 */
const cached: Array<{ keys: string[] | undefined; tags: string[] | undefined; value: unknown }> = [];
const revalidatedTags: string[] = [];

vi.mock('next/headers', () => ({
    draftMode: async () => ({
        isEnabled: draftState.enabled,
    }),
}));

class NotFound extends Error {}

vi.mock('next/navigation', () => ({
    notFound: () => {
        throw new NotFound('NEXT_NOT_FOUND');
    },
}));

vi.mock('next/cache', () => ({
    unstable_cache:
        (callback: (...args: unknown[]) => Promise<unknown>, keys?: string[], options?: { tags?: string[] }) =>
        async (...args: unknown[]) => {
            const value = await callback(...args);
            cached.push({
                keys,
                tags: options?.tags,
                value,
            });
            return value;
        },
    revalidateTag: (tag: string, profile: unknown) => {
        expect(profile).toEqual({
            expire: 0,
        });
        revalidatedTags.push(tag);
    },
}));

vi.mock('@kizunajs/cms/next/preview', () => ({
    PreviewOverlay: () => null,
}));

const { createCms, KizunaPreview, nextRevalidate, RichText } = await import('./next.js');
const { renderToStaticMarkup } = await import('react-dom/server');
const { createElement } = await import('react');

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

const aboutPage = definePage({
    name: 'aboutPage',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
    ],
});

const site = defineGlobal({
    name: 'site',
    fields: [
        {
            name: 'footer',
            schema: z.string(),
        },
    ],
});

const EmployeeId = Kizuna.brand('EmployeeId', z.string());

const employees = defineCollection({
    name: 'employees',
    id: EmployeeId,
    fields: [
        {
            name: 'name',
            schema: z.string().min(1),
        },
        {
            name: 'order',
            schema: z.int(),
        },
    ],
    indexes: ['order'],
});

const ArticleId = Kizuna.brand('ArticleId', z.string());

const stories = defineCollection({
    name: 'stories',
    id: ArticleId,
    fields: [
        {
            name: 'title',
            schema: z.string().min(1),
        },
        {
            name: 'slug',
            schema: z.string().min(1),
        },
    ],
});

const storyPage = definePage({
    name: 'storyPage',
    collection: stories,
});

const pglite = new PGlite();
const db = drizzle(pglite);

const plugin = cmsPlugin({
    db,
    pages: definePages({
        aboutPage: {
            path: '/about',
            page: aboutPage,
        },
        storyPage: {
            path: '/news/[slug]',
            page: storyPage,
        },
    }),
    globals: [site],
    collections: [employees, stories],
    auth: {
        identity: 'editor',
    },
    revalidate: nextRevalidate,
    appDir: 'src/__fixtures__/app',
});

const config = defineConfig({
    auth: {
        identities: {
            editor,
        },
    },
    routes: {},
    plugins: [plugin],
});

const api = config.api;
const cms = pluginExportsOf(config.api)['cms'] as CmsExports;

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec('delete from cms_refs; delete from cms_versions; delete from cms_documents;');
    cached.length = 0;
    revalidatedTags.length = 0;
    draftState.enabled = false;
});

afterAll(async () => {
    await pglite.close();
});

const saveDraft = (heading: string) =>
    cms.service.update({
        ref: {
            type: 'page',
            name: 'aboutPage',
        },
        changes: {
            heading,
        },
        caller: {},
        author: 'ada',
    });

describe('createCms', () => {
    it('types pages off the api and reads published content through the tagged cache', async () => {
        const reader = createCms(api);
        await saveDraft('About us');
        await cms.service.publish(
            {
                type: 'page',
                name: 'aboutPage',
            },
            'ada'
        );
        const content = await reader.pages.aboutPage.get();
        expectTypeOf(content.heading).toEqualTypeOf<string>();
        expect(content.heading).toBe('About us');
        expect(cached).toMatchObject([
            {
                tags: ['kizuna-cms:page:aboutPage'],
                value: {
                    heading: 'About us',
                },
            },
        ]);
        expect(revalidatedTags).toEqual(['kizuna-cms:page:aboutPage']);
    });

    it('calls notFound() for an unpublished page outside draft mode', async () => {
        const reader = createCms(api);
        await saveDraft('Only a draft');
        await expect(reader.pages.aboutPage.get()).rejects.toBeInstanceOf(NotFound);
    });

    it('returns the draft in draft mode, marked with source paths, and caches nothing', async () => {
        const reader = createCms(api);
        await saveDraft('Published');
        await cms.service.publish(
            {
                type: 'page',
                name: 'aboutPage',
            },
            'ada'
        );
        await saveDraft('Draft wording');
        draftState.enabled = true;
        const content = await reader.pages.aboutPage.get();
        expect(stripPaths(content.heading)).toBe('Draft wording');
        expect(decodePath(content.heading)).toBe('heading');
        expect(cached).toEqual([]);
    });

    it('never lets a draft value reach a cached response', async () => {
        const reader = createCms(api);
        await saveDraft('Published');
        await cms.service.publish(
            {
                type: 'page',
                name: 'aboutPage',
            },
            'ada'
        );
        await saveDraft('Draft only');
        draftState.enabled = true;
        await reader.pages.aboutPage.get();
        draftState.enabled = false;
        const published = await reader.pages.aboutPage.get();
        expect(published.heading).toBe('Published');
        expect(decodePath(published.heading)).toBeUndefined();
        for (const entry of cached) {
            expect(JSON.stringify(entry.value)).not.toContain('Draft only');
            expect(JSON.stringify(entry.value)).not.toMatch(/[⁢⁣]/);
        }
    });

    it('calls notFound() in draft mode for an incomplete draft', async () => {
        const reader = createCms(api);
        draftState.enabled = true;
        await expect(reader.pages.aboutPage.get()).rejects.toBeInstanceOf(NotFound);
    });

    it('refuses an api without the plugin', () => {
        expect(() => createCms({})).toThrow('found no CMS plugin');
    });
});

const siteRef = {
    type: 'global',
    name: 'site',
} satisfies DocumentRef;

const createEmployee = async (name: string, order: number, publish = true): Promise<string> => {
    const created = await cms.service.createItem(
        'employees',
        {
            name,
            order,
        },
        {},
        'ada'
    );
    if (publish) await cms.service.publish(created.target.ref, 'ada');
    return created.target.ref.type === 'item' ? created.target.ref.id : '';
};

describe('createCms globals', () => {
    it('reads the published global through its tagged cache', async () => {
        const reader = createCms(api);
        await cms.service.update({
            ref: siteRef,
            changes: {
                footer: 'Made in Oslo',
            },
            caller: {},
            author: 'ada',
        });
        await cms.service.publish(siteRef, 'ada');
        const content = await reader.globals.site.get();
        expectTypeOf(content.footer).toEqualTypeOf<string>();
        expect(content.footer).toBe('Made in Oslo');
        expect(cached).toMatchObject([
            {
                tags: ['kizuna-cms:global:site'],
            },
        ]);
    });

    it('falls back to the published global in draft mode when no draft passes', async () => {
        const reader = createCms(api);
        await cms.service.update({
            ref: siteRef,
            changes: {
                footer: 'Made in Oslo',
            },
            caller: {},
            author: 'ada',
        });
        await cms.service.publish(siteRef, 'ada');
        await cms.service.store.saveDraft({
            kind: 'global',
            key: 'site',
            draft: {},
            author: 'ada',
        });
        draftState.enabled = true;
        const content = await reader.globals.site.get();
        expect(stripPaths(content.footer)).toBe('Made in Oslo');
        expect(decodePath(content.footer)).toBe('footer');
    });

    it('calls notFound() for a global nobody published', async () => {
        await expect(createCms(api).globals.site.get()).rejects.toBeInstanceOf(NotFound);
    });
});

describe('createCms collections', () => {
    it('reads one item by id with its id beside its fields', async () => {
        const id = await createEmployee('Ada', 1);
        const item = await createCms(api).collections.employees.get({
            id,
        });
        expectTypeOf(item.name).toEqualTypeOf<string>();
        expect(item).toEqual({
            id,
            name: 'Ada',
            order: 1,
        });
        expect(cached.at(-1)?.tags).toEqual([`kizuna-cms:item:employees:${id}`]);
    });

    it('reads many items in the order of the ids, skipping unpublished and missing ones', async () => {
        const ada = await createEmployee('Ada', 1);
        const grace = await createEmployee('Grace', 2);
        const draft = await createEmployee('Linus', 3, false);
        const items = await createCms(api).collections.employees.getMany({
            ids: [grace, draft, 'missing', ada],
        });
        expect(items.map((item) => item.name)).toEqual(['Grace', 'Ada']);
    });

    it('lists published items through the collection cache tag', async () => {
        await createEmployee('Grace', 2);
        await createEmployee('Ada', 1);
        await createEmployee('Linus', 3, false);
        const listed = await createCms(api).collections.employees.list({
            orderBy: 'order',
            direction: 'asc',
        });
        expect(listed.items.map((item) => item.name)).toEqual(['Ada', 'Grace']);
        expect(cached.at(-1)?.tags).toEqual(['kizuna-cms:collection:employees']);
    });

    it('lists drafts too in draft mode, marked with source paths, and caches nothing', async () => {
        await createEmployee('Ada', 1);
        await createEmployee('Linus', 3, false);
        cached.length = 0;
        draftState.enabled = true;
        const listed = await createCms(api).collections.employees.list({
            orderBy: 'order',
            direction: 'asc',
        });
        expect(listed.items.map((item) => stripPaths(item.name))).toEqual(['Ada', 'Linus']);
        expect(decodePath(listed.items[1]!.name)).toBe('name');
        expect(cached).toEqual([]);
    });
});

const createStory = async (title: string, slug: string, publish = true): Promise<string> => {
    const created = await cms.service.createItem(
        'stories',
        {
            title,
            slug,
        },
        {},
        'ada'
    );
    if (publish) await cms.service.publish(created.target.ref, 'ada');
    return created.target.ref.type === 'item' ? created.target.ref.id : '';
};

describe('createCms pages that show a collection', () => {
    it('reads the published item at an address, typed by the route params', async () => {
        const id = await createStory('Spring is here', 'spring');
        const reader = createCms(api);
        expectTypeOf(reader.pages.storyPage.get).parameter(0).toEqualTypeOf<{
            slug: string;
        }>();
        const story = await reader.pages.storyPage.get({
            slug: 'spring',
        });
        expectTypeOf(story.title).toEqualTypeOf<string>();
        expect(story).toEqual({
            id,
            title: 'Spring is here',
            slug: 'spring',
        });
        expect(cached.at(-1)?.tags).toEqual(['kizuna-cms:collection:stories']);
    });

    it('calls notFound() for an address no published item has', async () => {
        await createStory('Draft only', 'draft-only', false);
        const reader = createCms(api);
        await expect(
            reader.pages.storyPage.get({
                slug: 'draft-only',
            })
        ).rejects.toBeInstanceOf(NotFound);
        await expect(
            reader.pages.storyPage.get({
                slug: 'missing',
            })
        ).rejects.toBeInstanceOf(NotFound);
    });

    it('reads the draft at its new address in draft mode, and the published one at the old', async () => {
        const id = await createStory('Spring is here', 'spring');
        await cms.service.update({
            ref: {
                type: 'item',
                collection: 'stories',
                id,
            },
            changes: {
                slug: 'spring-2026',
                title: 'Spring 2026',
            },
            caller: {},
            author: 'ada',
        });
        draftState.enabled = true;
        const reader = createCms(api);
        const draft = await reader.pages.storyPage.get({
            slug: 'spring-2026',
        });
        expect(stripPaths(draft.title)).toBe('Spring 2026');
        expect(decodePath(draft.title)).toBe('title');
        const published = await reader.pages.storyPage.get({
            slug: 'spring',
        });
        expect(stripPaths(published.title)).toBe('Spring is here');
        expect(cached).toEqual([]);
    });

    it('lists the collection by the field the address reads, which is indexed', async () => {
        await createStory('One', 'one');
        await createStory('Two', 'two');
        await createStory('Draft', 'draft', false);
        const listed = await createCms(api).collections.stories.list({
            orderBy: 'slug',
            direction: 'asc',
        });
        expect(listed.items.map((story) => story.title)).toEqual(['One', 'Two']);
    });
});

describe('KizunaPreview', () => {
    it('renders nothing outside draft mode', async () => {
        expect(await KizunaPreview({})).toBeNull();
    });

    it('renders the overlay in draft mode', async () => {
        draftState.enabled = true;
        expect(await KizunaPreview({})).not.toBeNull();
    });
});

describe('RichText', () => {
    const body: RichTextContent = [
        {
            _type: 'block',
            _key: 'b1',
            style: 'h2',
            markDefs: [],
            children: [
                {
                    _type: 'span',
                    _key: 's1',
                    text: 'Ferns',
                    marks: [],
                },
            ],
        },
        {
            _type: 'block',
            _key: 'b2',
            style: 'normal',
            markDefs: [
                {
                    _type: 'link',
                    _key: 'l1',
                    href: '/blog',
                },
            ],
            children: [
                {
                    _type: 'span',
                    _key: 's2',
                    text: 'Read more',
                    marks: ['strong', 'l1'],
                },
            ],
        },
        {
            _type: 'image',
            _key: 'i1',
            image: {
                id: 'med_ferns',
                url: '/api/cms/media/med_ferns/image',
                alt: 'Ferns',
                width: 800,
                height: 600,
            },
        },
    ];

    it('renders headings, marks, links and images as plain HTML', () => {
        const html = renderToStaticMarkup(
            createElement(RichText, {
                value: body,
            })
        );
        expect(html).toContain('<h2>Ferns</h2>');
        expect(html).toContain('<a href="/blog"><strong>Read more</strong></a>');
        expect(html).toContain('<img src="/api/cms/media/med_ferns/image" alt="Ferns" width="800" height="600"');
    });

    it('lets any element be replaced', () => {
        const html = renderToStaticMarkup(
            createElement(RichText, {
                value: body,
                components: {
                    block: {
                        h2: ({ children }) =>
                            createElement(
                                'h2',
                                {
                                    className: 'title',
                                },
                                children
                            ),
                    },
                    types: {
                        image: () => createElement('span', null, 'picture'),
                    },
                },
            })
        );
        expect(html).toContain('<h2 class="title">Ferns</h2>');
        expect(html).toContain('<span>picture</span>');
    });
});
