import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { pluginExportsOf } from 'kizunajs/adapter';
import { definePage } from './page.js';
import type { CmsExports } from './plugin.js';
import { cms } from './provider.js';
import { DocumentStore } from './storage/store.js';
import type { CmsService } from './cms.js';

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
    await pglite.exec('delete from cms_refs; delete from cms_versions; delete from cms_documents;');
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
        await renamed.renamePage('pricingPage', 'plansPage');
        expect(await renamed.orphanedPages()).toEqual([]);
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
