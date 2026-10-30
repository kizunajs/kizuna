import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineConfig, Kizuna } from './index.js';
import { authenticate, contentOf, JOBS_META, jobFnAt, jobRunnerFrom, type JobsMeta } from './adapter.js';
import { buildJobs, flattenJobs, type Jobs } from './jobs.js';
import { defineContentProvider, definePlugin, route, type ContentRuntime } from './plugin.js';

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

const notesPlugin = definePlugin({
    slug: 'notes',
    setup: () => ({
        exports: {
            notes: ['Welcome'],
        },
    }),
});

const readNotes = route({
    method: 'GET',
    path: '/content/notes',
    auth: false,
    summary: 'Read the notes',
    responses: {
        200: z.object({
            notes: z.array(z.string()),
        }),
    },
}).handler(() => ({
    status: 200,
    body: {
        notes: ['Welcome'],
    },
}));

const notesContent = () =>
    defineContentProvider({
        plugin: notesPlugin(),
        routes: {
            content: {
                notes: readNotes,
            },
        },
        reader: ({ runtime }) => ({
            hasRuntime: runtime !== undefined,
        }),
        documents: () => [
            {
                ref: 'global:notes',
                kind: 'global' as const,
                name: 'notes',
                schema: z.object({
                    notes: z.array(z.string()),
                }),
                migration: 0,
            },
        ],
    });

const runtime: ContentRuntime = {
    cache: (read) => read,
    revalidate: () => undefined,
    draftMode: async () => ({
        enabled: false,
        enable: () => undefined,
        disable: () => undefined,
    }),
    cookies: async () => ({
        get: () => undefined,
        set: () => undefined,
        delete: () => undefined,
    }),
    notFound: async () => {
        throw new Error('not found');
    },
};

describe('content', () => {
    it("joins the provider's routes to the api's own and hands back its reader", () => {
        const kizuna = defineConfig({
            adapter: {
                name: 'test',
                mount: () => undefined,
                content: runtime,
            },
            content: notesContent(),
        });
        expect(Object.keys(kizuna.api.routes)).toEqual(['content']);
        expect(kizuna.content).toEqual({
            hasRuntime: true,
        });
        expect(
            contentOf(kizuna.api)
                ?.provider.documents()
                .map((document) => document.ref)
        ).toEqual(['global:notes']);
    });

    it('reads without a runtime when the adapter has none', () => {
        expect(
            defineConfig({
                content: notesContent(),
            }).content
        ).toEqual({
            hasRuntime: false,
        });
    });

    it('refuses a group of routes under the same name as the content', () => {
        expect(() =>
            defineConfig({
                routes: [
                    {
                        content: k.routes({}),
                    },
                ],
                content: notesContent(),
            })
        ).toThrow("serves its routes under 'content'");
    });

    it('refuses something other than a provider', () => {
        expect(() =>
            defineConfig({
                content: {} as never,
            })
        ).toThrow('takes a content provider');
    });

    it('leaves an api without content alone', () => {
        expect(contentOf(defineConfig({}).api)).toBeUndefined();
    });
});

describe('authenticate', () => {
    const kizuna = defineConfig({
        auth: {
            identities: {
                editor,
            },
        },
        routes: [],
    });

    it("answers the guard's context for a credential it accepts", async () => {
        expect(
            await authenticate(kizuna.api, 'editor', {
                headers: {
                    authorization: 'Bearer editor-token',
                },
            })
        ).toEqual({
            userId: 'ada',
        });
    });

    it('answers undefined when the guard denies', async () => {
        expect(
            await authenticate(kizuna.api, 'editor', {
                headers: {},
            })
        ).toBeUndefined();
    });

    it('throws for an identity the api does not have', async () => {
        await expect(
            authenticate(kizuna.api, 'staff', {
                headers: {},
            })
        ).rejects.toThrow("no guard for the identity 'staff'");
    });
});

describe('jobs a content provider declares', () => {
    const refreshed: string[] = [];
    const refreshJobs = (identity?: 'scheduler' | 'worker') => {
        const definitions = {
            refreshSite: k
                .job({
                    retry: 3,
                    input: z.object({
                        site: z.string(),
                        brand: z.string(),
                        id: z.string(),
                    }),
                })
                .handler(({ input }) => {
                    refreshed.push(`${input.site} ${input.brand} ${input.id}`);
                }),
        };
        return buildJobs(identity, definitions);
    };
    const contentWithJobs = (jobs: Jobs) =>
        defineContentProvider({
            plugin: notesPlugin(),
            routes: {
                content: {
                    notes: readNotes,
                },
            },
            reader: () => undefined,
            documents: () => [],
            jobs,
        });

    it("registers them under 'content', beside the app's own", async () => {
        const { api } = defineConfig({
            content: contentWithJobs(refreshJobs()),
            jobRunner: {
                mode: 'in-process',
            },
        });

        expect(flattenJobs(api.jobs as Jobs).map(({ jobKey }) => jobKey)).toEqual(['content.refreshSite']);
        const runner = jobRunnerFrom((api as unknown as Record<typeof JOBS_META, JobsMeta>)[JOBS_META]);
        await jobFnAt(runner, 'content.refreshSite')?.run({
            site: 'uk',
            brand: 'EmployeeId',
            id: 'ada',
        });
        expect(refreshed).toEqual(['uk EmployeeId ada']);
    });

    it("keeps the app's jobs, guarded by the identity they share", () => {
        const { api } = defineConfig({
            auth: {
                identities: {
                    scheduler: k.identity.bearer({
                        context: z.object({
                            invokedBy: z.string(),
                        }),
                    }),
                },
            },
            jobs: buildJobs('scheduler', {
                sendDigests: k.job({}),
            }),
            content: contentWithJobs(refreshJobs()),
            jobRunner: {
                mode: 'http',
            },
        });

        expect(flattenJobs(api.jobs as Jobs).map(({ jobKey }) => jobKey)).toEqual(['sendDigests', 'content.refreshSite']);
    });

    it('guards them with their own identity when the app declares no jobs', () => {
        const { api } = defineConfig({
            auth: {
                identities: {
                    scheduler: k.identity.bearer({
                        context: z.object({
                            invokedBy: z.string(),
                        }),
                    }),
                },
            },
            content: contentWithJobs(refreshJobs('scheduler')),
            jobRunner: {
                mode: 'http',
            },
        });

        expect(flattenJobs(api.jobs as Jobs).map(({ job }) => job.identity)).toEqual(['scheduler']);
    });

    it('says where the identity goes when neither the provider nor the app names one', () => {
        expect(() =>
            defineConfig({
                content: contentWithJobs(refreshJobs()),
                jobRunner: {
                    mode: 'http',
                },
            })
        ).toThrow(
            "The jobs under `content` declare no identity, so `/jobs/dispatch` and `/jobs/run` would let anyone trigger them. Name the identity the CMS's refresh job runs as with `jobs: { identity }` on cms(), or declare app jobs with one."
        );
    });

    it('names `k.jobs` when an app job declares no identity', () => {
        expect(() =>
            defineConfig({
                jobs: k.jobs({
                    sendDigests: k.job({}),
                }),
                content: contentWithJobs(refreshJobs()),
                jobRunner: {
                    mode: 'http',
                },
            })
        ).toThrow('Pass an identity to `k.jobs`');
    });

    it('requires jobRunner.mode, as app jobs do', () => {
        expect(() =>
            defineConfig({
                content: contentWithJobs(refreshJobs()),
            } as never)
        ).toThrow('The jobs do not say how they run.');
    });

    it("refuses an app job group named 'content'", () => {
        expect(() =>
            defineConfig({
                jobs: k.jobs({
                    content: {
                        sendDigests: k.job({}),
                    },
                }),
                content: contentWithJobs(refreshJobs()),
                jobRunner: {
                    mode: 'in-process',
                },
            })
        ).toThrow("`content` declares its jobs under 'content'");
    });

    it('refuses jobs that name two identities', () => {
        expect(() =>
            defineConfig({
                jobs: buildJobs('worker', {
                    sendDigests: k.job({}),
                }),
                content: contentWithJobs(refreshJobs('scheduler')),
                jobRunner: {
                    mode: 'http',
                },
            })
        ).toThrow("The jobs name the identities 'worker' and 'scheduler'");
    });

    it('adds no jobs for a provider without any', () => {
        expect(
            defineConfig({
                content: notesContent(),
            }).api.jobs
        ).toBeUndefined();
    });
});
