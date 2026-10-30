import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { defineJobTransport, pluginExportsOf, type JobMessage } from 'kizunajs/adapter';
import { expressAdapter } from '@kizunajs/express';
import { definePage } from './page.js';
import { defineCollection, defineGlobal } from './definitions.js';
import { cms } from './provider.js';
import { definePages } from './options.js';
import { declareSites, SiteSchema } from './site.js';
import { DocumentStore } from './storage/store.js';
import { REFRESH_SIGNATURE_HEADER, signRefresh, verifyRefresh } from './preview-token.js';
import { heldJobs } from './held-jobs.fixture.js';
import type { CmsExports } from './setup.js';

const k = new Kizuna();
const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
    })
    .guard(({ bearer, deny }) =>
        bearer?.token === 'editor-token'
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

const Offices = defineCollection({
    name: 'offices',
    id: Kizuna.brand('OfficeId', z.string()),
    fields: [
        {
            name: 'city',
            schema: z.string(),
        },
    ],
});

const Events = defineCollection({
    name: 'events',
    id: Kizuna.brand('EventId', z.string()),
    fields: [
        {
            name: 'title',
            schema: z.string(),
        },
    ],
});

const PrivacyPolicy = defineGlobal({
    name: 'privacyPolicy',
    fields: [
        {
            name: 'text',
            schema: z.string(),
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
        collections: [Events],
    },
    norway: {
        label: 'Hagen Norge',
        url: 'https://hagen.example.no',
        icon: '/icons/norway.svg',
        pages: countryPages,
    },
});

const SECRET = 'refresh-test-secret';
const queued: JobMessage[] = [];
const revalidated: string[] = [];

const pglite = new PGlite();
const db = drizzle(pglite);
const config = defineConfig({
    adapter: expressAdapter(),
    jobRunner: {
        mode: 'in-process',
        transport: defineJobTransport({
            name: 'captured',
            supports: {
                retry: true,
                dedupe: true,
            },
            dispatch: (message) => {
                queued.push(message);
            },
        }),
    },
    auth: {
        identities: {
            editor,
        },
    },
    content: cms({
        db,
        sites,
        site: () => 'uk',
        globals: [PrivacyPolicy],
        collections: [Offices],
        partners: {
            travelAgency: {
                label: 'Travel agency',
                reads: ['uk'],
                invalidate: {
                    url: 'https://travel.example.com/api/invalidate',
                    headers: () => ({
                        authorization: 'Bearer travel-agency-token',
                    }),
                },
            },
        },
        auth: {
            identity: 'editor',
        },
        previewSecret: SECRET,
        revalidate: (tags) => {
            revalidated.push(...tags);
        },
    }),
});
const service = (pluginExportsOf(config.api)['cms'] as CmsExports).service;
const app = express();
config.api.mount(app);
const asEditor = (call: request.Test) => call.set('authorization', 'Bearer editor-token');

/**
 * Publishes a document through the editing routes, by its editing path.
 */
const publish = async (path: string, changes: Record<string, unknown>): Promise<void> => {
    expect(
        (
            await asEditor(request(app).patch(`/editing${path}/draft`)).send({
                changes,
            })
        ).status
    ).toBe(200);
    expect((await asEditor(request(app).post(`/editing${path}/publish`)).send({})).status).toBe(200);
};

const office = async (): Promise<string> => {
    const created = await asEditor(request(app).post('/editing/collections/offices/items')).send({
        values: {
            city: 'London',
        },
    });
    const id = created.body.ref.split(':').pop() as string;
    expect((await asEditor(request(app).post(`/editing/collections/offices/items/${id}/publish`)).send({})).status).toBe(200);
    return id;
};

/**
 * Runs a queued refresh as the transport would deliver it.
 */
const run = (message: JobMessage) => service.refreshJob()!.run(message.input);

const refreshesOf = async (ref: string) =>
    (
        await asEditor(request(app).get('/editing/refreshes')).query({
            ref,
        })
    ).body.refreshes as Array<{ target: string; kind: string; label: string; status: string; attempts: number }>;

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    queued.length = 0;
    revalidated.length = 0;
    await pglite.exec(
        'delete from cms_refreshes; delete from cms_review_comments; delete from cms_reviews; delete from cms_refs; delete from cms_versions; delete from cms_documents;'
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
});

afterAll(async () => {
    await pglite.close();
});

describe('publishing on a CMS with sites', () => {
    it('queues one refresh per site and partner that shows shared content, keyed by target, brand and id', async () => {
        const id = await office();
        expect(queued.map((message) => message.job)).toEqual(['content.refreshSite', 'content.refreshSite', 'content.refreshSite']);
        expect(queued.map((message) => message.input)).toEqual(
            ['uk', 'norway', 'travelAgency'].map((target) => ({
                target,
                body: {
                    brand: 'OfficeId',
                    id,
                },
            }))
        );
        expect(queued.map((message) => message.dedupeKey)).toEqual([
            `uk:OfficeId:${id}`,
            `norway:OfficeId:${id}`,
            `travelAgency:OfficeId:${id}`,
        ]);
        expect((await refreshesOf(`item:offices:${id}`)).map((refresh) => [refresh.label, refresh.kind, refresh.status])).toEqual([
            ['Hagen Norge', 'site', 'queued'],
            ['Travel agency', 'partner', 'queued'],
            ['Hagen UK', 'site', 'queued'],
        ]);
    });

    it("refreshes a site's own content on that site and the partners that read it", async () => {
        await asEditor(request(app).post('/editing/sites/uk/collections/events/items')).send({
            values: {
                title: 'Pruning roses',
            },
        });
        const [event] = (await asEditor(request(app).get('/editing/sites/uk/collections/events/items'))).body.items;
        await asEditor(request(app).post(`/editing/sites/uk/collections/events/items/${event.id}/publish`)).send({});
        expect(queued.map((message) => (message.input as { target: string }).target)).toEqual(['uk', 'travelAgency']);
        expect((queued[0]!.input as { body: unknown }).body).toEqual({
            brand: 'EventId',
            id: event.id,
        });
    });

    it('sends a page to its own site alone, and a global to every site and partner', async () => {
        await publish('/sites/norway/pages/frontPage', {
            heading: 'Velkommen',
        });
        expect(queued.map((message) => message.input)).toEqual([
            {
                target: 'norway',
                body: {
                    page: 'frontPage',
                },
            },
        ]);
        queued.length = 0;
        await publish('/globals/privacyPolicy', {
            text: 'We keep little.',
        });
        expect(queued.map((message) => message.dedupeKey)).toEqual([
            'uk:global:privacyPolicy',
            'norway:global:privacyPolicy',
            'travelAgency:global:privacyPolicy',
        ]);
    });

    it('queues the same refreshes when a document is unpublished or deleted', async () => {
        const id = await office();
        queued.length = 0;
        await asEditor(request(app).post(`/editing/collections/offices/items/${id}/unpublish`)).send({});
        expect(queued).toHaveLength(3);
        queued.length = 0;
        await asEditor(request(app).delete(`/editing/collections/offices/items/${id}`));
        expect(queued).toHaveLength(3);
    });
});

describe('the refresh job', () => {
    it("calls a site's invalidate with a signed body, and a partner's with its own headers", async () => {
        const fetched = vi.fn(
            async () =>
                new Response(null, {
                    status: 200,
                })
        );
        vi.stubGlobal('fetch', fetched);
        const id = await office();
        for (const message of queued) await run(message);
        const calls = fetched.mock.calls as unknown as Array<[string, { headers: Record<string, string>; body: string }]>;
        expect(calls.map(([url]) => url)).toEqual([
            'https://hagen.example.co.uk/api/invalidate',
            'https://hagen.example.no/api/invalidate',
            'https://travel.example.com/api/invalidate',
        ]);
        const [, uk] = calls[0]!;
        expect(JSON.parse(uk.body)).toEqual({
            brand: 'OfficeId',
            id,
        });
        expect(verifyRefresh(SECRET, uk.headers[REFRESH_SIGNATURE_HEADER]!, JSON.parse(uk.body))).toBe(true);
        expect(calls[2]![1].headers['authorization']).toBe('Bearer travel-agency-token');
        expect(calls[2]![1].headers[REFRESH_SIGNATURE_HEADER]).toBeUndefined();
        expect((await refreshesOf(`item:offices:${id}`)).map((refresh) => [refresh.target, refresh.status, refresh.attempts])).toEqual([
            ['norway', 'answered', 1],
            ['travelAgency', 'answered', 1],
            ['uk', 'answered', 1],
        ]);
    });

    it('answers 503 so the transport retries a site that is down, and records it as retrying', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                if (url.startsWith('https://hagen.example.no')) throw new TypeError('fetch failed');
                if (url.startsWith('https://travel.example.com')) return new Response(null, { status: 502 });
                return new Response(null, { status: 200 });
            })
        );
        const id = await office();
        const outcomes = await Promise.allSettled(queued.map((message) => run(message)));
        expect(outcomes.map((outcome) => (outcome.status === 'rejected' ? (outcome.reason as { status: number }).status : 'ok'))).toEqual([
            'ok',
            503,
            503,
        ]);
        expect((await refreshesOf(`item:offices:${id}`)).map((refresh) => [refresh.target, refresh.status])).toEqual([
            ['norway', 'retrying'],
            ['travelAgency', 'retrying'],
            ['uk', 'answered'],
        ]);
    });

    it('gives up on a site that refuses the call, and on the last attempt', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => new Response(null, { status: url.startsWith('https://hagen.example.no') ? 404 : 500 }))
        );
        const id = await office();
        const norway = queued.find((message) => (message.input as { target: string }).target === 'norway')!;
        await expect(run(norway)).rejects.toMatchObject({
            status: 422,
        });
        const uk = queued.find((message) => (message.input as { target: string }).target === 'uk')!;
        for (let attempt = 0; attempt < 5; attempt += 1) await run(uk).catch(() => undefined);
        expect((await refreshesOf(`item:offices:${id}`)).map((refresh) => [refresh.target, refresh.status, refresh.attempts])).toEqual([
            ['norway', 'failed', 1],
            ['travelAgency', 'queued', 0],
            ['uk', 'failed', 5],
        ]);
    });

    it('hands the dashboard every refresh that ran since a time', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(null, {
                        status: 200,
                    })
            )
        );
        const before = new Date(Date.now() - 1000);
        await office();
        expect(await service.store.refreshesSince(before)).toEqual([]);
        await run(queued[0]!);
        expect(await service.store.refreshesSince(before)).toEqual([
            {
                target: 'uk',
                status: 'answered',
                attempts: 1,
                at: expect.any(Date),
            },
        ]);
    });
});

describe('the invalidate route on a CMS with sites', () => {
    const signed = (body: Record<string, unknown>) =>
        request(app).post('/invalidate').set(REFRESH_SIGNATURE_HEADER, signRefresh(SECRET, body)).send(body);

    it("takes another deployment's signed call, and refreshes the item's reads and the pages holding it", async () => {
        const id = await office();
        revalidated.length = 0;
        const body = {
            brand: 'OfficeId',
            id,
        };
        expect((await signed(body)).status).toBe(200);
        expect(revalidated).toContain(`kizuna-cms:item:uk:offices:${id}`);
        expect(revalidated).toContain('kizuna-cms:collection:norway:offices');
    });

    it('refreshes a page on every site that has it, and a global', async () => {
        const page = await signed({
            page: 'frontPage',
        });
        expect(page.body.pages).toEqual(['uk:frontPage', 'norway:frontPage']);
        expect(revalidated).toEqual(['kizuna-cms:page:uk:frontPage', 'kizuna-cms:page:norway:frontPage']);
        expect(
            (
                await signed({
                    global: 'privacyPolicy',
                })
            ).status
        ).toBe(200);
        expect(
            (
                await signed({
                    global: 'footer',
                })
            ).status
        ).toBe(404);
    });

    it('refuses a call signed for another body or with another secret, and takes the credential auth.invalidate names', async () => {
        const forged = await request(app)
            .post('/invalidate')
            .set(
                REFRESH_SIGNATURE_HEADER,
                signRefresh(SECRET, {
                    page: 'otherPage',
                })
            )
            .send({
                page: 'frontPage',
            });
        expect(forged.status).toBe(401);
        const wrongSecret = await request(app)
            .post('/invalidate')
            .set(
                REFRESH_SIGNATURE_HEADER,
                signRefresh('another-secret', {
                    page: 'frontPage',
                })
            )
            .send({
                page: 'frontPage',
            });
        expect(wrongSecret.status).toBe(401);
        expect(
            (
                await asEditor(request(app).post('/invalidate')).send({
                    page: 'frontPage',
                })
            ).status
        ).toBe(200);
    });
});

describe('a CMS with one site', () => {
    it('declares no jobs, so it needs no jobRunner', () => {
        const single = defineConfig({
            auth: {
                identities: {
                    editor,
                },
            },
            content: cms({
                db,
                pages: definePages({
                    frontPage: {
                        path: '/',
                        page: FrontPage,
                    },
                }),
                auth: {
                    identity: 'editor',
                },
            }),
        });
        expect(single.api.jobs).toBeUndefined();
    });

    it('declares the refresh job with sites, and runs it in process', () => {
        const several = defineConfig({
            jobRunner: heldJobs,
            auth: {
                identities: {
                    editor,
                },
            },
            content: cms({
                db,
                sites,
                auth: {
                    identity: 'editor',
                },
            }),
        });
        expect(Object.keys((several.api.jobs as Record<string, object>)['content']!)).toEqual(['refreshSite']);
    });
});

describe("the refresh job's identity", () => {
    const scheduler = k.identity.bearer({
        context: z.object({
            invokedBy: z.string(),
        }),
    });
    const identityOf = (jobs: unknown) =>
        (jobs as Record<string, Record<string, { identity: string | undefined }>>)['content']!['refreshSite']!.identity;

    it('runs as the identity cms() names, so the job routes serve with no app jobs', () => {
        const served = defineConfig({
            jobRunner: {
                mode: 'http',
            },
            auth: {
                identities: {
                    editor,
                    scheduler,
                },
            },
            content: cms({
                db,
                sites,
                jobs: {
                    identity: 'scheduler',
                },
                auth: {
                    identity: 'editor',
                },
            }),
        });
        expect(identityOf(served.api.jobs)).toBe('scheduler');
    });

    it("runs as the app's jobs do when cms() names none", () => {
        const served = defineConfig({
            jobRunner: {
                mode: 'http',
            },
            auth: {
                identities: {
                    editor,
                    scheduler,
                },
            },
            jobs: k.jobs('scheduler', {
                sendDigests: k.job({}),
            }),
            content: cms({
                db,
                sites,
                auth: {
                    identity: 'editor',
                },
            }),
        });
        expect(identityOf(served.api.jobs)).toBeUndefined();
        expect(Object.keys(served.api.jobs as Record<string, object>)).toEqual(['sendDigests', 'content']);
    });

    it('says where the identity goes when neither cms() nor the app names one', () => {
        expect(() =>
            defineConfig({
                jobRunner: {
                    mode: 'http',
                },
                auth: {
                    identities: {
                        editor,
                    },
                },
                content: cms({
                    db,
                    sites,
                    auth: {
                        identity: 'editor',
                    },
                }),
            })
        ).toThrow("Name the identity the CMS's refresh job runs as with `jobs: { identity }` on cms(), or declare app jobs with one.");
    });

    it('refuses an identity the config does not declare', () => {
        expect(() =>
            defineConfig({
                jobRunner: {
                    mode: 'http',
                },
                auth: {
                    identities: {
                        editor,
                    },
                },
                content: cms({
                    db,
                    sites,
                    jobs: {
                        identity: 'scheduler',
                    },
                    auth: {
                        identity: 'editor',
                    },
                }),
            })
        ).toThrow("cms() runs its refresh job as the identity 'scheduler', which `auth.identities` does not declare.");
    });
});
