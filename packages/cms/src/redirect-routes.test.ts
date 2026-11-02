import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { pluginExportsOf } from 'kizunajs/adapter';
import { expressAdapter } from '@kizunajs/express';
import { defineCollection } from './definitions.js';
import { definePage } from './page.js';
import { definePages, DEFAULT_SITE } from './options.js';
import { cms } from './provider.js';
import { DocumentStore } from './storage/store.js';
import type { CmsExports } from './setup.js';

const k = new Kizuna();
const ArticleId = Kizuna.brand('ArticleId', z.string());

const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
    })
    .guard(({ bearer, deny }) => {
        if (bearer?.token === 'editor-token') {
            return {
                userId: 'ada',
            };
        }
        return deny({
            status: 401,
            body: {
                detail: 'Unauthorized',
            },
        });
    });

const Articles = defineCollection({
    name: 'articles',
    id: ArticleId,
    fields: [
        {
            name: 'title',
            schema: z.string().max(80),
        },
        {
            name: 'slug',
            schema: z.string().regex(/^[a-z0-9-]+$/),
        },
    ],
});

const pages = definePages({
    articlePage: {
        path: '/blog/[slug]',
        page: definePage({
            name: 'articlePage',
            collection: Articles,
        }),
    },
});

const pglite = new PGlite();
const db = drizzle(pglite);

const config = defineConfig({
    jobRunner: {
        mode: 'in-process',
    },
    adapter: expressAdapter(),
    auth: {
        identities: {
            editor,
        },
    },
    content: cms({
        db,
        pages,
        collections: [Articles],
        auth: {
            identity: 'editor',
            author: (context) => String(context['userId']),
        },
        appDir: 'src/__fixtures__/app',
    }),
});

const app = express();
config.api.mount(app);
const service = (pluginExportsOf(config.api)['cms'] as CmsExports).service;

const asEditor = (call: request.Test) => call.set('authorization', 'Bearer editor-token');

const createArticle = async (title: string, slug: string): Promise<string> => {
    const created = await asEditor(request(app).post('/editing/collections/articles/items')).send({
        values: {
            title,
            slug,
        },
    });
    expect(created.status).toBe(201);
    const id = created.body.name as string;
    expect((await asEditor(request(app).post(`/editing/collections/articles/items/${id}/publish`)).send({})).status).toBe(200);
    return id;
};

const createRedirect = (body: Record<string, unknown>) => asEditor(request(app).post('/editing/redirects')).send(body);

const listRedirects = async (query: Record<string, string> = {}) => {
    const answer = await asEditor(request(app).get('/editing/redirects').query(query));
    expect(answer.status).toBe(200);
    return answer.body.redirects as Array<{
        id: string;
        from: string;
        to: Record<string, unknown>;
        status: number;
        origin: string;
        by: {
            id: string;
        } | null;
    }>;
};

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec(
        'delete from cms_redirects; delete from cms_redirect_versions; delete from cms_refs; delete from cms_versions; delete from cms_documents;'
    );
});

afterAll(async () => {
    await pglite.close();
});

describe('making a redirect', () => {
    it('stores it as a 308 by the editor, and moves the redirects version on', async () => {
        const before = await service.redirects.version(DEFAULT_SITE);
        const created = await createRedirect({
            from: '/sommer',
            to: {
                type: 'path',
                path: '/kampanjer/sommer',
            },
        });
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({
            from: '/sommer',
            to: {
                type: 'path',
                path: '/kampanjer/sommer',
            },
            status: 308,
            origin: 'manual',
            by: {
                id: 'ada',
            },
        });
        expect(await service.redirects.version(DEFAULT_SITE)).toBe(before + 1);
        expect((await listRedirects()).map((redirect) => redirect.from)).toEqual(['/sommer']);
    });

    it('takes 307 for a temporary address, and nothing else', async () => {
        expect(
            (
                await createRedirect({
                    from: '/jul',
                    to: {
                        type: 'url',
                        url: 'https://example.com/jul',
                    },
                    status: 307,
                })
            ).body.status
        ).toBe(307);
        expect(
            (
                await createRedirect({
                    from: '/paske',
                    to: {
                        type: 'path',
                        path: '/',
                    },
                    status: 301,
                })
            ).status
        ).toBe(400);
    });

    it('refuses a from ending in /', async () => {
        const answer = await createRedirect({
            from: '/sommer/',
            to: {
                type: 'path',
                path: '/',
            },
        });
        expect(answer.status).toBe(422);
        expect(answer.body.detail).toContain('ends in /');
    });

    it('refuses an address where a page is published, naming it', async () => {
        await createArticle('Spring sale', 'spring-sale');
        const answer = await createRedirect({
            from: '/blog/spring-sale',
            to: {
                type: 'path',
                path: '/',
            },
        });
        expect(answer.status).toBe(409);
        expect(answer.body.detail).toContain('Spring sale is published at /blog/spring-sale');
    });

    it('goes to a page or an item wherever it is served, with its name', async () => {
        const id = await createArticle('Spring sale', 'spring-sale');
        const created = await createRedirect({
            from: '/var',
            to: {
                type: 'document',
                ref: `item:articles:${id}`,
            },
        });
        expect(created.status).toBe(201);
        expect(created.body.to).toEqual({
            type: 'document',
            ref: `item:articles:${id}`,
            label: 'Spring sale',
            path: '/blog/spring-sale',
        });
        expect(
            (
                await listRedirects({
                    to: `item:articles:${id}`,
                })
            ).map((redirect) => redirect.from)
        ).toEqual(['/var']);
        expect(
            await listRedirects({
                to: 'item:articles:other',
            })
        ).toEqual([]);
    });

    it('refuses a ref that names nothing', async () => {
        const answer = await createRedirect({
            from: '/var',
            to: {
                type: 'document',
                ref: 'item:events:k3j9x2',
            },
        });
        expect(answer.status).toBe(422);
    });

    it("stores a path that redirects already as that redirect's target", async () => {
        const id = await createArticle('Spring sale', 'spring-sale');
        await createRedirect({
            from: '/var',
            to: {
                type: 'document',
                ref: `item:articles:${id}`,
            },
        });
        const created = await createRedirect({
            from: '/vaar',
            to: {
                type: 'path',
                path: '/var',
            },
        });
        expect(created.status).toBe(201);
        expect(created.body.to).toMatchObject({
            type: 'document',
            ref: `item:articles:${id}`,
        });
    });

    it('points the redirects that led to its from where it goes', async () => {
        await createRedirect({
            from: '/tilbud',
            to: {
                type: 'path',
                path: '/kampanjer/sommer',
            },
        });
        await createRedirect({
            from: '/kampanjer/sommer',
            to: {
                type: 'path',
                path: '/kampanjer/host',
            },
        });
        expect((await listRedirects()).find((redirect) => redirect.from === '/tilbud')?.to).toEqual({
            type: 'path',
            path: '/kampanjer/host',
        });
    });

    it('refuses a redirect that leads back to its own from', async () => {
        await createRedirect({
            from: '/sommer',
            to: {
                type: 'path',
                path: '/kampanjer/sommer',
            },
        });
        const answer = await createRedirect({
            from: '/kampanjer/sommer',
            to: {
                type: 'path',
                path: '/sommer',
            },
        });
        expect(answer.status).toBe(409);
        expect(answer.body.detail).toContain('round in a circle');
    });

    it('refuses a from that redirects already', async () => {
        await createRedirect({
            from: '/sommer',
            to: {
                type: 'path',
                path: '/',
            },
        });
        const answer = await createRedirect({
            from: '/sommer',
            to: {
                type: 'path',
                path: '/blog',
            },
        });
        expect(answer.status).toBe(409);
    });
});

describe('changing and deleting a redirect', () => {
    it('changes where it goes and its status, and moves the version on', async () => {
        const created = await createRedirect({
            from: '/sommer',
            to: {
                type: 'path',
                path: '/',
            },
        });
        const before = await service.redirects.version(DEFAULT_SITE);
        const changed = await asEditor(request(app).patch(`/editing/redirects/${created.body.id}`)).send({
            to: {
                type: 'path',
                path: '/kampanjer/sommer',
            },
            status: 307,
        });
        expect(changed.status).toBe(200);
        expect(changed.body).toMatchObject({
            from: '/sommer',
            to: {
                type: 'path',
                path: '/kampanjer/sommer',
            },
            status: 307,
        });
        expect(await service.redirects.version(DEFAULT_SITE)).toBe(before + 1);
    });

    it('refuses a new from where a page is published', async () => {
        await createArticle('Spring sale', 'spring-sale');
        const created = await createRedirect({
            from: '/sommer',
            to: {
                type: 'path',
                path: '/',
            },
        });
        const changed = await asEditor(request(app).patch(`/editing/redirects/${created.body.id}`)).send({
            from: '/blog/spring-sale',
        });
        expect(changed.status).toBe(409);
    });

    it('deletes one, and moves the version on', async () => {
        const created = await createRedirect({
            from: '/sommer',
            to: {
                type: 'path',
                path: '/',
            },
        });
        const before = await service.redirects.version(DEFAULT_SITE);
        expect((await asEditor(request(app).delete(`/editing/redirects/${created.body.id}`))).status).toBe(204);
        expect(await listRedirects()).toEqual([]);
        expect(await service.redirects.version(DEFAULT_SITE)).toBe(before + 1);
        expect((await asEditor(request(app).delete(`/editing/redirects/${created.body.id}`))).status).toBe(404);
    });

    it('deletes a redirect a rename made, but never changes it', async () => {
        await service.redirects.apply({
            add: [
                {
                    site: DEFAULT_SITE,
                    locale: null,
                    from: '/blog/old-sale',
                    to: {
                        type: 'path',
                        path: '/blog/spring-sale',
                    },
                    status: 308,
                    origin: 'rename',
                    createdBy: 'ada',
                },
            ],
            live: [],
            touch: [],
        });
        const [renamed] = await listRedirects();
        expect(renamed?.origin).toBe('rename');
        const changed = await asEditor(request(app).patch(`/editing/redirects/${renamed!.id}`)).send({
            status: 307,
        });
        expect(changed.status).toBe(409);
        expect(changed.body.detail).toContain('cannot be changed');
        expect((await asEditor(request(app).delete(`/editing/redirects/${renamed!.id}`))).status).toBe(204);
    });
});
