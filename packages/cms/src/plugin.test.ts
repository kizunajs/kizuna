import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import sharp from 'sharp';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { pluginExportsOf } from 'kizunajs/adapter';
import { expressAdapter } from '@kizunajs/express';
import { defineBlock } from './block.js';
import { definePage } from './page.js';
import { ImageSchema } from './image.js';
import type { CmsExports } from './plugin.js';
import { cms as cmsContent } from './provider.js';
import { defineRelationship } from './relationships.js';
import { memoryMediaStorage } from './media/storage.js';
import { DocumentStore } from './storage/store.js';
import { run } from './cli.js';

const k = new Kizuna();
const roles = Kizuna.roles(['editor', 'admin']);
const ProductId = Kizuna.brand('ProductId', z.string());

const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
        roles,
    })
    .guard(({ bearer, deny }) => {
        if (bearer?.token === 'editor-token') {
            return {
                userId: 'ada',
                role: 'editor',
            };
        }
        if (bearer?.token === 'admin-token') {
            return {
                userId: 'grace',
                role: 'admin',
            };
        }
        return deny({
            status: 401,
            body: {
                detail: 'Unauthorized',
            },
        });
    });

const HeroBlockSchema = defineBlock({
    name: 'hero',
    fields: [
        {
            name: 'heading',
            schema: z.string().max(20).describe('Under 4 words.'),
        },
        {
            name: 'image',
            schema: ImageSchema.optional(),
        },
        {
            name: 'badge',
            schema: z.string().optional(),
            auth: {
                roles: 'admin',
            },
        },
    ],
});

const FrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'hero',
            schema: HeroBlockSchema,
        },
        {
            name: 'featured',
            schema: z.array(ProductId).max(2),
            description: 'Products in the grid.',
        },
        {
            name: 'seo',
            schema: z.object({
                title: z.string(),
            }),
            auth: {
                roles: 'admin',
            },
        },
        {
            name: 'slug',
            schema: z.string().default('spring'),
            readOnly: true,
        },
        {
            name: 'tagline',
            schema: z.string().default('Welcome'),
        },
    ],
    migrate: {
        1: (document) => ({
            ...document,
            tagline: 'Migrated',
        }),
    },
});

const products = k.routes({
    listProducts: k
        .route({
            method: 'GET',
            path: '/products',
            auth: false,
            summary: 'List products',
            tool: true,
            responses: {
                200: z.object({
                    products: z.array(
                        z.object({
                            id: ProductId,
                            name: z.string(),
                        })
                    ),
                }),
            },
        })
        .handler(() => ({
            status: 200,
            body: {
                products: [],
            },
        })),
});

const ProductOptions = defineRelationship({
    name: 'products',
    id: ProductId,
    options: async ({ query, ids }) =>
        [
            {
                id: 'prod_1',
                label: 'Tulip bulbs',
            },
            {
                id: 'prod_2',
                label: 'Watering can',
            },
        ].filter((option) =>
            ids === undefined ? query === undefined || option.label.toLowerCase().includes(query) : ids.some((id) => id === option.id)
        ),
});

let pglite: PGlite;
let app: express.Express;
let cms: CmsExports;
let api: unknown;
const revalidated: string[][] = [];
const storage = memoryMediaStorage();

beforeAll(async () => {
    pglite = new PGlite();
    const db = drizzle(pglite);
    await new DocumentStore(db).createTables();
    const content = cmsContent({
        db,
        pages: {
            frontPage: {
                path: '/',
                page: FrontPage,
            },
        },
        auth: {
            identity: 'editor',
            roles: ['editor', 'admin'],
        },
        relationships: [ProductOptions],
        media: {
            storage,
            maxBytes: 4096,
            publicPath: '/api/cms/media',
        },
        revalidate: (tags) => {
            revalidated.push([...tags]);
        },
        appDir: 'src/__fixtures__/app',
    });
    const config = defineConfig({
        adapter: expressAdapter(),
        auth: {
            identities: {
                editor,
            },
        },
        routes: {
            products,
        },
        content,
    });
    app = express();
    config.api.mount(app);
    cms = pluginExportsOf(config.api)['cms'] as CmsExports;
    api = config.api;
});

beforeEach(async () => {
    await pglite.exec('delete from cms_refs; delete from cms_versions; delete from cms_documents;');
    revalidated.length = 0;
    storage.files.clear();
});

afterAll(async () => {
    await pglite.close();
});

const asEditor = (call: request.Test) => call.set('authorization', 'Bearer editor-token');
const asAdmin = (call: request.Test) => call.set('authorization', 'Bearer admin-token');

const validDraft = {
    'hero.heading': 'Spring is here',
    featured: ['prod_1', 'prod_2'],
    'seo.title': 'Spring',
};

describe('drafts', () => {
    it('starts empty and unpublished', async () => {
        expect((await request(app).get('/content/pages/frontPage')).status).toBe(404);
        const draft = await asEditor(request(app).get('/editing/pages/frontPage/draft'));
        expect(draft.status).toBe(200);
        expect(draft.body).toMatchObject({
            status: 'empty',
            complete: false,
            missing: ['hero', 'featured', 'seo'],
        });
        expect(draft.headers['etag']).toBe('"0"');
    });

    it('keeps an incomplete draft and lists what is missing', async () => {
        const response = await asEditor(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                'hero.heading': 'Spring',
            },
        });
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            complete: false,
            missing: ['featured', 'seo'],
            content: {
                hero: {
                    heading: 'Spring',
                },
            },
        });
        const next = await asEditor(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                featured: ['prod_1'],
            },
        });
        expect(next.body.missing).toEqual(['seo']);
        expect(next.body.content.hero.heading).toBe('Spring');
    });

    it('refuses a value that is there and wrong, even in an incomplete draft', async () => {
        const response = await asEditor(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                'hero.heading': 'A heading far longer than twenty characters',
            },
        });
        expect(response.status).toBe(422);
        expect(response.body.errors).toEqual([
            {
                code: 'too_big',
                path: ['hero', 'heading'],
                message: expect.any(String),
            },
        ]);
    });

    it('saves a version with the author and a summary, and applies defaults', async () => {
        const response = await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: validDraft,
            summary: 'First copy',
        });
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            status: 'draft',
            version: 1,
            complete: true,
            missing: [],
            updatedBy: 'grace',
            content: {
                slug: 'spring',
                tagline: 'Welcome',
            },
        });
        const history = await asEditor(request(app).get('/editing/pages/frontPage/versions'));
        expect(history.body.versions).toMatchObject([
            {
                version: 1,
                summary: 'First copy',
                createdBy: 'grace',
                published: false,
            },
        ]);
    });

    it('refuses a write whose If-Match is behind, with a 409', async () => {
        await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: validDraft,
        });
        const second = await asAdmin(request(app).patch('/editing/pages/frontPage/draft'))
            .set('if-match', '"1"')
            .send({
                changes: {
                    'hero.heading': 'Second',
                },
            });
        expect(second.status).toBe(200);
        expect(second.headers['etag']).toMatch(/^"2-\d+"$/);
        const stale = await asAdmin(request(app).patch('/editing/pages/frontPage/draft'))
            .set('if-match', '"1"')
            .send({
                changes: {
                    'hero.heading': 'Stale',
                },
            });
        expect(stale.status).toBe(409);
        expect(stale.body).toMatchObject({
            status: 409,
            expected: 1,
            latest: 2,
        });
        const draft = await asEditor(request(app).get('/editing/pages/frontPage/draft'));
        expect(draft.body.content.hero.heading).toBe('Second');
    });

    it('folds autosaves into one version and still refuses a stale tab', async () => {
        const first = await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: validDraft,
            autosave: true,
        });
        const firstTag = String(first.headers['etag']);
        const second = await asAdmin(request(app).patch('/editing/pages/frontPage/draft'))
            .set('if-match', firstTag)
            .send({
                changes: {
                    'hero.heading': 'Typing',
                },
                autosave: true,
            });
        expect(second.status).toBe(200);
        expect(second.body.version).toBe(1);
        expect(second.headers['etag']).not.toBe(firstTag);
        const stale = await asAdmin(request(app).patch('/editing/pages/frontPage/draft'))
            .set('if-match', firstTag)
            .send({
                changes: {
                    'hero.heading': 'Old tab',
                },
                autosave: true,
            });
        expect(stale.status).toBe(409);
    });

    it('rejects a value over its limit in the API', async () => {
        const response = await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                ...validDraft,
                'hero.heading': 'A heading far longer than twenty characters',
            },
        });
        expect(response.status).toBe(422);
        expect(response.body.errors[0]).toMatchObject({
            code: 'too_big',
            path: ['hero', 'heading'],
        });
        const over = await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                ...validDraft,
                featured: ['a', 'b', 'c'],
            },
        });
        expect(over.status).toBe(422);
        expect(over.body.errors[0].path).toEqual(['featured']);
    });

    it('rejects an unknown field path', async () => {
        const response = await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                nothing: 1,
            },
        });
        expect(response.status).toBe(422);
        expect(response.body.detail).toContain("no field at 'nothing'");
    });
});

describe('field rules', () => {
    it('refuses an admin-only field for an editor with a 403, in the route', async () => {
        const response = await asEditor(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: validDraft,
        });
        expect(response.status).toBe(403);
        expect(response.body.detail).toBe("The field 'seo' takes the role 'admin'.");
    });

    it('applies a block field rule inside the block', async () => {
        await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: validDraft,
        });
        const response = await asEditor(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                'hero.badge': 'New',
            },
        });
        expect(response.status).toBe(403);
        expect(response.body.detail).toBe("The field 'badge' takes the role 'admin'.");
    });

    it('never writes a read-only field, for anyone', async () => {
        const response = await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                ...validDraft,
                slug: 'other',
            },
        });
        expect(response.status).toBe(403);
        expect(response.body.detail).toBe("The field 'slug' is read only.");
    });

    it('lets an editor change what they may once the admin fields are filled', async () => {
        await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: validDraft,
        });
        const response = await asEditor(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                'hero.heading': 'Hello spring',
            },
        });
        expect(response.status).toBe(200);
        expect(response.body.updatedBy).toBe('ada');
    });

    it('requires an editor for every editing route', async () => {
        expect((await request(app).get('/editing/pages')).status).toBe(401);
        expect((await request(app).patch('/editing/pages/frontPage/draft').send({ changes: {} })).status).toBe(401);
        expect((await request(app).post('/editing/pages/frontPage/publish')).status).toBe(401);
    });
});

describe('describe', () => {
    it('finds the page from a URL and says what the caller may write', async () => {
        const response = await asEditor(request(app).get('/editing/describe').query({ url: 'https://example.com/?utm=1' }));
        expect(response.status).toBe(200);
        expect(response.body.name).toBe('frontPage');
        const byPath = Object.fromEntries(response.body.fields.map((field: { path: string }) => [field.path, field]));
        expect(byPath['hero.heading']).toMatchObject({
            parent: 'hero',
            writable: true,
            description: 'Under 4 words.',
            schema: {
                type: 'string',
                maxLength: 20,
            },
        });
        expect(byPath['seo']).toMatchObject({
            writable: false,
            roles: ['admin'],
        });
        expect(byPath['slug']).toMatchObject({
            readOnly: true,
            writable: false,
        });
        expect(byPath['featured']).toMatchObject({
            brand: 'ProductId',
            searchTool: 'editing_search_items',
            description: 'Products in the grid. An array of ProductId; ids of products, found with editing_search_items, brand ProductId.',
        });
        expect(byPath['hero']).toMatchObject({
            block: 'hero',
        });
    });

    it('answers 404 for a URL no page serves', async () => {
        expect((await asEditor(request(app).get('/editing/describe').query({ url: '/nowhere' }))).status).toBe(404);
    });
});

describe('publishing', () => {
    it('publishes only on request, revalidates the page, and serves published content publicly', async () => {
        await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: validDraft,
        });
        expect((await request(app).get('/content/pages/frontPage')).status).toBe(404);
        const published = await asEditor(request(app).post('/editing/pages/frontPage/publish'));
        expect(published.status).toBe(200);
        expect(published.body.status).toBe('published');
        expect(revalidated).toEqual([['kizuna-cms:page:frontPage']]);
        const read = await request(app).get('/content/pages/frontPage');
        expect(read.status).toBe(200);
        expect(read.body.content.hero.heading).toBe('Spring is here');
        expect(read.headers['cache-control']).toContain('public');
        expect(read.headers['etag']).toBeDefined();
    });

    it('keeps draft changes out of the published content', async () => {
        await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: validDraft,
        });
        await asEditor(request(app).post('/editing/pages/frontPage/publish'));
        await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                'hero.heading': 'Draft only',
            },
        });
        const read = await request(app).get('/content/pages/frontPage');
        expect(read.body.content.hero.heading).toBe('Spring is here');
        const list = await asEditor(request(app).get('/editing/pages'));
        expect(list.body.pages[0]).toMatchObject({
            name: 'frontPage',
            status: 'changed',
            version: 2,
            publishedVersion: 1,
        });
    });

    it('lists what the draft changes from what is published, and reverts one change or all', async () => {
        await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: validDraft,
        });
        await asEditor(request(app).post('/editing/pages/frontPage/publish'));
        await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                'hero.heading': 'Summer is here',
                'hero.badge': 'New',
            },
        });

        const changes = await asEditor(request(app).get('/editing/pages/frontPage/changes'));
        expect(changes.status).toBe(200);
        expect(changes.body.published).toBe(true);
        expect(changes.body.changes.map((change: { path: string }) => change.path)).toEqual(['hero.heading', 'hero.badge']);
        expect(changes.body.changes[0]).toMatchObject({
            label: 'Hero › Heading',
            before: 'Spring is here',
            after: 'Summer is here',
        });

        const reverted = await asEditor(request(app).post('/editing/pages/frontPage/revert')).send({
            paths: ['hero.heading'],
        });
        expect(reverted.status).toBe(200);
        expect(reverted.body.content.hero.heading).toBe('Spring is here');
        const left = await asEditor(request(app).get('/editing/pages/frontPage/changes'));
        expect(left.body.changes.map((change: { path: string }) => change.path)).toEqual(['hero.badge']);

        // `badge` takes the admin role, so only an admin may revert it.
        expect(left.body.changes[0].writable).toBe(false);
        const cleared = await asAdmin(request(app).post('/editing/pages/frontPage/revert')).send({
            paths: ['hero.badge'],
        });
        expect(cleared.status).toBe(200);
        const none = await asEditor(request(app).get('/editing/pages/frontPage/changes'));
        expect(none.body.changes).toEqual([]);
    });

    it('refuses to publish an incomplete draft', async () => {
        const response = await asEditor(request(app).post('/editing/pages/frontPage/publish'));
        expect(response.status).toBe(409);
    });

    it('restores an earlier version as a new draft', async () => {
        await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: validDraft,
        });
        await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                'hero.heading': 'Second',
            },
        });
        const earlier = await asEditor(request(app).get('/editing/pages/frontPage/versions/1'));
        expect(earlier.status).toBe(200);
        expect(earlier.body.content.hero.heading).toBe('Spring is here');
        expect((await asEditor(request(app).get('/editing/pages/frontPage/versions/9'))).status).toBe(404);

        const response = await asEditor(request(app).post('/editing/pages/frontPage/rollback')).send({
            version: 1,
        });
        expect(response.status).toBe(200);
        expect(response.body.version).toBe(3);
        expect(response.body.content.hero.heading).toBe('Spring is here');
        const history = await asEditor(request(app).get('/editing/pages/frontPage/versions'));
        expect(history.body.versions[0].summary).toBe('Restored version 1');
    });

    it('marks publish, deleting and writes to globals as needing approval, and lets a model restore a version as a draft', () => {
        const { editing } = cmsContent({
            db: {
                select: () => undefined,
            } as never,
            pages: {},
            auth: {
                identity: 'editor',
            },
        }).routes;
        expect(editing.pages.publish.tool).toMatchObject({
            needsApproval: true,
        });
        expect(editing.pages.rollback.tool).not.toMatchObject({
            needsApproval: true,
        });
        expect(editing.globals.rollback.tool).toMatchObject({
            needsApproval: true,
        });
        expect(editing.collections.deleteItem.tool).toMatchObject({
            needsApproval: true,
        });
        expect(editing.globals.updateDraft.tool).toMatchObject({
            needsApproval: true,
        });
        expect(editing.pages.updateDraft.tool).toBe(true);
        expect(editing.collections.updateDraft.tool).toBe(true);
    });
});

describe('references', () => {
    it('indexes branded ids and answers where-used', async () => {
        await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: validDraft,
        });
        const response = await asEditor(request(app).get('/editing/refs/ProductId/prod_2'));
        expect(response.body).toEqual({
            brand: 'ProductId',
            id: 'prod_2',
            pages: [
                {
                    name: 'frontPage',
                    site: 'default',
                    path: '/',
                    fieldPaths: ['featured.1'],
                },
            ],
        });
        expect((await asEditor(request(app).get('/editing/refs/ProductId/prod_9'))).body.pages).toEqual([]);
    });

    it('invalidates exactly the pages holding an id', async () => {
        await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: validDraft,
        });
        revalidated.length = 0;
        expect(await cms.invalidate(ProductId, 'prod_1')).toEqual(['frontPage']);
        expect(revalidated).toEqual([['kizuna-cms:page:frontPage']]);
        expect(await cms.invalidate('ProductId', 'prod_9')).toEqual([]);
        expect(revalidated).toHaveLength(1);
    });
});

const storedRow = async () => {
    const result = await pglite.query<{
        migration_version: number;
        published_version: number | null;
        published: Record<string, unknown> | null;
    }>('select migration_version, published_version, published from cms_documents');
    return result.rows[0]!;
};

const publishDraft = async (changes: Record<string, unknown>) => {
    await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
        changes,
    });
    expect((await asEditor(request(app).post('/editing/pages/frontPage/publish')).send({})).status).toBe(200);
};

const cliRun = async (argv: string[]): Promise<{ code: number; output: string }> => {
    const lines: string[] = [];
    const code = await run(argv, {
        cwd: process.cwd(),
        configPath: 'kizuna.config.ts',
        loadApi: async () => api,
        stdout: (line) => lines.push(line),
        stderr: (line) => lines.push(line),
    });
    return {
        code,
        output: lines.join('\n'),
    };
};

describe('migrations', () => {
    /**
     * A published page stored before its definition gained migration step 1.
     */
    const storedBehind = async () => {
        await publishDraft(validDraft);
        await pglite.exec(
            "update cms_documents set migration_version = 0, draft = draft - 'tagline', published = published - 'tagline'; update cms_versions set data = data - 'tagline'"
        );
    };

    it('runs newer steps in memory on read, and writes nothing', async () => {
        await storedBehind();
        const draft = await asEditor(request(app).get('/editing/pages/frontPage/draft'));
        expect(draft.body.content.tagline).toBe('Migrated');
        expect(draft.body.version).toBe(1);
        expect(draft.body.status).toBe('published');
        expect((await request(app).get('/content/pages/frontPage')).body.content.tagline).toBe('Migrated');
        expect(await storedRow()).toMatchObject({
            migration_version: 0,
            published_version: 1,
        });
        expect((await asEditor(request(app).get('/editing/pages/frontPage/versions'))).body.versions).toHaveLength(1);
    });

    it('stores the published copy at the new step with the next save, without publishing it', async () => {
        await storedBehind();
        await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                'hero.heading': 'Summer',
            },
        });
        const row = await storedRow();
        expect(row.migration_version).toBe(1);
        expect(row.published_version).toBe(1);
        expect(row.published).toMatchObject({
            tagline: 'Migrated',
            hero: {
                heading: 'Spring is here',
            },
        });
    });

    it('restores a version from the step it was saved at', async () => {
        await storedBehind();
        await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                tagline: 'Hello',
            },
        });
        await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                tagline: 'Later',
            },
        });
        const restored = await asEditor(request(app).post('/editing/pages/frontPage/rollback')).send({
            version: 2,
        });
        expect(restored.body.content.tagline).toBe('Hello');
    });

    it('stores every document at its latest step with kizuna cms migrate-content', async () => {
        await storedBehind();
        expect(await cliRun(['migrate-content'])).toEqual({
            code: 0,
            output: 'Migrated 1 document.',
        });
        expect(await storedRow()).toMatchObject({
            migration_version: 1,
            published_version: 1,
            published: {
                tagline: 'Migrated',
            },
        });
        expect((await asEditor(request(app).get('/editing/pages/frontPage/versions'))).body.versions).toHaveLength(1);
        expect((await cliRun(['migrate-content'])).output).toBe('Every document is at its latest migration step.');
    });
});

describe('published content that fails its schema', () => {
    const breakLiveCopy = () => pglite.exec(`update cms_documents set published = jsonb_set(published, '{featured}', '"prod_1"')`);

    it('serves the newest earlier version that went live and still passes, and says so', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        await publishDraft(validDraft);
        await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                'hero.heading': 'Never published',
            },
        });
        await publishDraft({
            'hero.heading': 'Summer',
        });
        await breakLiveCopy();
        const read = await request(app).get('/content/pages/frontPage');
        expect(read.status).toBe(200);
        expect(read.body.content.hero.heading).toBe('Spring is here');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Visitors see version 1'));
        warn.mockRestore();
        expect(await cms.service.contentProblems()).toEqual([
            {
                ref: 'page:frontPage',
                issues: expect.arrayContaining([expect.stringContaining('featured')]),
                serving: 1,
            },
        ]);
        const checked = await cliRun(['check']);
        expect(checked.code).toBe(1);
        expect(checked.output).toContain('page:frontPage, visitors see version 1');
    });

    it('reads as unpublished when no earlier version passes', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        await publishDraft(validDraft);
        await breakLiveCopy();
        expect((await request(app).get('/content/pages/frontPage')).status).toBe(404);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('no earlier version does'));
        warn.mockRestore();
        expect(await cms.service.contentProblems()).toEqual([
            {
                ref: 'page:frontPage',
                issues: expect.arrayContaining([expect.stringContaining('featured')]),
            },
        ]);
    });

    it('passes the check when every published copy fits', async () => {
        await publishDraft(validDraft);
        expect(await cliRun(['check'])).toEqual({
            code: 0,
            output: 'All published content passes its schema.',
        });
    });
});

const png = new Uint8Array(
    await sharp({
        create: {
            width: 2,
            height: 3,
            channels: 3,
            background: {
                r: 0,
                g: 0,
                b: 0,
            },
        },
    })
        .png()
        .toBuffer()
);

describe('media', () => {
    const upload = async (bytes: Uint8Array, filename = 'photo.png') => {
        const created = await asEditor(request(app).post('/editing/media/uploads')).send({
            filename,
            contentType: 'image/png',
            size: bytes.byteLength,
        });
        expect(created.status).toBe(201);
        await storage.put(`uploads/${created.body.uploadId}`, bytes, 'image/png');
        return asEditor(request(app).post(`/editing/media/uploads/${created.body.uploadId}`));
    };

    it('presigns, checks the bytes and creates a media item named by content', async () => {
        const completed = await upload(png);
        expect(completed.status).toBe(201);
        expect(completed.body).toMatchObject({
            contentType: 'image/png',
            width: 2,
            height: 3,
            filename: 'photo.png',
            uploadedBy: 'ada',
        });
        expect(completed.body.id).toMatch(/^med_[0-9a-f]{24}$/);
        expect(completed.body.url).toBe(`/api/cms/media/${completed.body.id}/image`);
        expect([...storage.files.keys()]).toEqual([`media/${completed.body.id.slice(4)}.png`]);
        const again = await upload(png, 'same.png');
        expect(again.body.id).toBe(completed.body.id);
    });

    it('refuses SVG and files that are not images, whatever they are called', async () => {
        const svg = await upload(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'logo.png');
        expect(svg.status).toBe(422);
        expect(svg.body.detail).toContain('SVG');
        const text = await upload(new TextEncoder().encode('plain text'), 'notes.png');
        expect(text.status).toBe(422);
        expect(storage.files.size).toBe(0);
    });

    it('refuses an upload over the size limit before it starts', async () => {
        const created = await asEditor(request(app).post('/editing/media/uploads')).send({
            filename: 'big.png',
            contentType: 'image/png',
            size: 8192,
        });
        expect(created.status).toBe(422);
    });

    it('sets alt text and a focal point, and resolves images in published content', async () => {
        const completed = await upload(png);
        const updated = await asEditor(request(app).patch(`/editing/media/${completed.body.id}`)).send({
            alt: 'A tiny square',
            focalPoint: {
                x: 0.5,
                y: 0.25,
            },
        });
        expect(updated.status).toBe(200);
        expect(updated.body.alt).toBe('A tiny square');
        await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: {
                ...validDraft,
                'hero.image': {
                    id: completed.body.id,
                    alt: '',
                    crop: {
                        x: 0,
                        y: 0,
                        width: 0.5,
                        height: 1,
                    },
                },
            },
        });
        await asEditor(request(app).post('/editing/pages/frontPage/publish'));
        const read = await request(app).get('/content/pages/frontPage');
        expect(read.body.content.hero.image).toEqual({
            id: completed.body.id,
            url: `/api/cms/media/${completed.body.id}/image?crop=0,0,0.5,1&focal=0.5,0.25`,
            alt: 'A tiny square',
            width: 1,
            height: 3,
        });
        const list = await asEditor(request(app).get('/editing/media'));
        expect(list.body.media).toHaveLength(1);
    });

    it('serves the rendered image publicly with the crop applied, and the stored file to editors', async () => {
        const completed = await upload(png);
        const rendered = await request(app)
            .get(`/content/media/${completed.body.id}/image`)
            .query({ crop: '0,0,0.5,1', w: 1 })
            .buffer(true);
        expect(rendered.status).toBe(200);
        expect(rendered.headers['content-type']).toContain('image/webp');
        expect(rendered.headers['cache-control']).toContain('immutable');
        const inspected = await sharp(rendered.body as Buffer).metadata();
        expect(inspected.format).toBe('webp');
        expect(inspected.height).toBe(3);
        expect((await request(app).get(`/editing/media/${completed.body.id}/file`)).status).toBe(401);
        const file = await asEditor(request(app).get(`/editing/media/${completed.body.id}/file`)).buffer(true);
        expect(file.status).toBe(200);
        expect(new Uint8Array(file.body as Buffer)).toEqual(png);
    });
});

describe('draft mode', () => {
    it('answers 501 on an adapter that supplies no draft mode', async () => {
        expect((await asEditor(request(app).get('/draft'))).status).toBe(501);
    });
});

describe('relationships', () => {
    it("lists a relationship's options for the picker, and names held ids", async () => {
        const searched = await asEditor(request(app).get('/editing/items/ProductId').query({ q: 'tulip' }));
        expect(searched.body.items).toEqual([
            {
                id: 'prod_1',
                label: 'Tulip bulbs',
            },
        ]);
        const named = await asEditor(request(app).get('/editing/items/ProductId?ids=prod_2&ids=prod_9'));
        expect(named.body.items).toEqual([
            {
                id: 'prod_2',
                label: 'Watering can',
            },
        ]);
    });

    it('refreshes the pages that hold an item when the app calls invalidate', async () => {
        await asAdmin(request(app).patch('/editing/pages/frontPage/draft')).send({
            changes: validDraft,
        });
        revalidated.length = 0;
        const response = await asEditor(request(app).post('/invalidate')).send({
            relationship: 'products',
            id: 'prod_1',
        });
        expect(response.body).toEqual({
            pages: ['frontPage'],
        });
        expect(revalidated).toEqual([['kizuna-cms:page:frontPage']]);
        expect((await asEditor(request(app).post('/invalidate')).send({ relationship: 'orders', id: 'order_1' })).status).toBe(404);
    });
});
