import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { pluginExportsOf } from 'kizunajs/adapter';
import { page } from './page.js';
import { cmsPlugin, type CmsExports } from './plugin.js';
import { DocumentStore } from './storage/store.js';
import { decodePath, stripPaths } from './source-path.js';

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
    unstable_cache: (callback: () => Promise<unknown>, keys?: string[], options?: { tags?: string[] }) => async () => {
        const value = await callback();
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

const { createCms, KizunaPreview, nextRevalidate } = await import('./next.js');

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

const aboutPage = page({
    name: 'aboutPage',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
    ],
});

const pglite = new PGlite();
const db = drizzle(pglite);

const plugin = cmsPlugin({
    db,
    pages: {
        aboutPage: {
            path: '/about',
            page: aboutPage,
        },
    },
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
        name: 'aboutPage',
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
        await cms.service.publish('aboutPage', 'ada');
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
        await cms.service.publish('aboutPage', 'ada');
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
        await cms.service.publish('aboutPage', 'ada');
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

describe('KizunaPreview', () => {
    it('renders nothing outside draft mode', async () => {
        expect(await KizunaPreview({})).toBeNull();
    });

    it('renders the overlay in draft mode', async () => {
        draftState.enabled = true;
        expect(await KizunaPreview({})).not.toBeNull();
    });
});
