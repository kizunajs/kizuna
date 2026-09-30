import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import { defineConfig } from './define-config.js';
import { isCompiledJob, isJobDefinition } from './jobs.js';
import { cron } from './schedule.js';
import { definePlugin } from './plugin.js';
import { JOBS_META, jobRoutes, jobRunnerFrom, jobFnAt, type JobsMeta } from './adapter.js';

interface Config {
    auth: {
        identities: {
            scheduler: typeof scheduler;
        };
    };
}

const k = new Kizuna<Config>();

const scheduler = k.identity.bearer({
    description: 'The platform scheduler',
});

const config = {
    auth: {
        identities: {
            scheduler,
        },
    },
};

describe('k.jobs', () => {
    it('compiles a job, carrying its schedule and identity', () => {
        const jobs = k.jobs('scheduler', {
            sendDigests: k.job({
                schedule: '0 5 * * *',
            }),
        });
        expect(jobs.sendDigests.schedule).toBe('0 5 * * *');
        expect(jobs.sendDigests.identity).toBe('scheduler');
    });

    it('leaves the identity undefined when declared without one', () => {
        const jobs = k.jobs({
            sendDigests: k.job({
                schedule: '0 5 * * *',
            }),
        });
        expect(jobs.sendDigests.identity).toBeUndefined();
    });

    it('answers 204 when the job declares no result', () => {
        const jobs = k.jobs('scheduler', {
            sendDigests: k.job({
                schedule: '0 5 * * *',
            }),
        });
        expect(Object.keys(jobs.sendDigests.responses).sort()).toEqual(['204', '422', '500', '503']);
    });

    it('answers 200 with the result schema when declared', () => {
        const jobs = k.jobs('scheduler', {
            sendDigests: k.job({
                schedule: '0 5 * * *',
                result: z.object({
                    sent: z.int(),
                }),
            }),
        });
        expect(Object.keys(jobs.sendDigests.responses).sort()).toEqual(['200', '422', '500', '503']);
    });

    it('always synthesizes the retry contract statuses', () => {
        const jobs = k.jobs('scheduler', {
            sendDigests: k.job({
                schedule: '0 5 * * *',
            }),
        });
        const responses = jobs.sendDigests.responses as Record<number, unknown>;
        for (const status of [422, 500, 503]) {
            expect(responses[status]).toBeDefined();
        }
    });

    it('keeps the input schema for validation', () => {
        const input = z.object({
            since: z.iso.datetime(),
        });
        const jobs = k.jobs('scheduler', {
            sendDigests: {
                input,
            },
        });
        expect(jobs.sendDigests.input).toBe(input);
    });

    it('merges extra responses over the synthesized ones', () => {
        const conflict = z.object({
            type: z.string(),
            title: z.string(),
            status: z.number(),
            detail: z.string(),
            lockedBy: z.string(),
        });
        const jobs = k.jobs('scheduler', {
            sendDigests: k.job({
                schedule: '0 5 * * *',
                responses: {
                    409: conflict,
                },
            }),
        });
        expect((jobs.sendDigests.responses as Record<number, unknown>)[409]).toBe(conflict);
        expect((jobs.sendDigests.responses as Record<number, unknown>)[503]).toBeDefined();
    });

    it('accepts a schedule built by a helper', () => {
        const jobs = k.jobs('scheduler', {
            sendDigests: k.job({
                schedule: cron.daily('05:00'),
            }),
        });
        expect(jobs.sendDigests.schedule).toBe('0 5 * * *');
    });

    it('accepts the object schedule form', () => {
        const jobs = k.jobs('scheduler', {
            sendDigests: k.job({
                schedule: {
                    cron: '0 5 * * *',
                    timezone: 'Europe/Oslo',
                },
            }),
        });
        expect(jobs.sendDigests.schedule).toEqual({
            cron: '0 5 * * *',
            timezone: 'Europe/Oslo',
        });
    });

    it('nests groups of jobs', () => {
        const jobs = k.jobs('scheduler', {
            billing: {
                reconcileInvoices: k.job({
                    schedule: '0 5 * * *',
                }),
            },
        });
        expect(isCompiledJob(jobs.billing)).toBe(false);
        expect(jobs.billing.reconcileInvoices.schedule).toBe('0 5 * * *');
    });

    it('compiles a job declaring nothing at all', () => {
        const jobs = k.jobs('scheduler', {
            ping: {},
        });
        expect(jobs.ping.schedule).toBeUndefined();
        expect(Object.keys(jobs.ping.responses).sort()).toEqual(['204', '422', '500', '503']);
    });

    it('rejects an invalid schedule, naming the job', () => {
        expect(() =>
            k.jobs('scheduler', {
                sendDigests: k.job({
                    schedule: 'every morning',
                }),
            })
        ).toThrow('Job "sendDigests" has an invalid schedule');
    });

    it('names the nested job whose schedule is invalid', () => {
        expect(() =>
            k.jobs('scheduler', {
                billing: {
                    reconcileInvoices: k.job({
                        schedule: 'every morning',
                    }),
                },
            })
        ).toThrow('Job "billing.reconcileInvoices" has an invalid schedule');
    });

    it('rejects a scheduled job whose input will not accept an empty payload', () => {
        expect(() =>
            k.jobs('scheduler', {
                indexUser: k.job({
                    schedule: '0 5 * * *',
                    input: z.object({
                        userId: z.string(),
                    }),
                }),
            })
        ).toThrow('will not accept an empty payload');
    });

    it('rejects a retry that is not a whole number of attempts', () => {
        expect(() =>
            k.jobs('scheduler', {
                sendDigests: {
                    retry: 0,
                },
            })
        ).toThrow('at least 1');
    });

    it('rejects a node that is neither a job nor a group', () => {
        expect(() =>
            k.jobs('scheduler', {
                billing: {
                    reconcileInvoices: 'nightly' as unknown as Record<string, never>,
                },
            })
        ).toThrow('Job "billing.reconcileInvoices" is not an object');
    });
});

describe('isJobDefinition', () => {
    it('reads a node declaring only job fields as a job', () => {
        expect(
            isJobDefinition({
                schedule: '0 5 * * *',
                retry: 3,
            })
        ).toBe(true);
    });

    it('reads an empty node as a job', () => {
        expect(isJobDefinition({})).toBe(true);
    });

    it('reads a node holding other jobs as a group', () => {
        expect(
            isJobDefinition({
                reconcileInvoices: {
                    schedule: '0 5 * * *',
                },
            })
        ).toBe(false);
    });

    // A group is free to take a name a job field also uses, so the value's type
    // decides, not the key alone.
    it('reads a group named after a job field as a group', () => {
        expect(
            isJobDefinition({
                summary: {
                    schedule: '0 5 * * *',
                },
            })
        ).toBe(false);
    });
});

describe('isCompiledJob', () => {
    it('recognises a compiled job', () => {
        const jobs = k.jobs('scheduler', {
            sendDigests: k.job({
                schedule: '0 5 * * *',
            }),
        });
        expect(isCompiledJob(jobs.sendDigests)).toBe(true);
    });

    it.each([[null], [undefined], [{}], [{ responses: {} }]])('rejects %j', (value) => {
        expect(isCompiledJob(value)).toBe(false);
    });
});

describe('k.contract with jobs', () => {
    const routes = k.routes({
        listUsers: k.route({
            method: 'GET',
            path: '/users',
            auth: false,
            responses: {
                200: z.array(z.string()),
            },
        }),
    });

    it('carries jobs alongside routes, not inside them', () => {
        const jobs = k.jobs('scheduler', {
            sendDigests: k.job({
                schedule: '0 5 * * *',
            }),
        });
        const contract = defineConfig({
            ...config,
            routes,
            jobRunner: {
                mode: 'http',
            },
            jobs,
        }).api;
        expect(Object.keys(contract.jobs ?? {})).toEqual(['sendDigests']);
        expect(Object.keys(contract.routes)).toEqual(['listUsers']);
    });

    it('leaves jobs undefined when none are declared', () => {
        const contract = defineConfig({
            ...config,
            routes,
        }).api;
        expect(contract.jobs).toBeUndefined();
    });

    it('does not require jobs in the auth map', () => {
        const jobs = k.jobs('scheduler', {
            sendDigests: k.job({
                schedule: '0 5 * * *',
            }),
        });
        expect(
            () =>
                defineConfig({
                    ...config,
                    routes,
                    jobRunner: {
                        mode: 'http',
                    },
                    jobs,
                }).api
        ).not.toThrow();
    });
});

describe('a job endpoint colliding with a route', () => {
    const routesAt = (path: `/${string}`) =>
        k.routes({
            listJobs: k.route({
                method: 'POST',
                auth: false,
                path,
                responses: {
                    200: z.array(z.string()),
                },
            }),
        });

    const scheduled = k.jobs('scheduler', {
        sendDigests: k.job({
            schedule: '0 5 * * *',
        }),
    });

    it.each([['/jobs/dispatch'], ['/jobs/run']] as const)('rejects a contract whose route already serves %s', (path) => {
        expect(
            () =>
                defineConfig({
                    ...config,
                    routes: routesAt(path),
                    jobRunner: {
                        mode: 'http',
                    },
                    jobs: scheduled,
                }).api
        ).toThrow('which already serves it');
    });

    it('leaves the namespace itself free', () => {
        expect(
            () =>
                defineConfig({
                    ...config,
                    routes: routesAt('/jobs'),
                    jobRunner: {
                        mode: 'http',
                    },
                    jobs: scheduled,
                }).api
        ).not.toThrow();
    });

    it('accepts the same route once the endpoints are moved', () => {
        const movedConfig = {
            auth: {
                identities: {
                    scheduler,
                },
            },
        };
        const moved = new Kizuna<{
            auth: {
                identities: {
                    scheduler: typeof scheduler;
                };
            };
        }>();
        expect(
            () =>
                defineConfig({
                    ...movedConfig,
                    jobRunner: {
                        mode: 'http',
                        path: '/internal/tick',
                    },
                    routes: moved.routes({
                        listJobs: moved.route({
                            method: 'POST',
                            path: '/jobs/dispatch',
                            auth: false,
                            responses: {
                                200: z.array(z.string()),
                            },
                        }),
                    }),
                    jobs: moved.jobs('scheduler', {
                        sendDigests: moved.job({
                            schedule: '0 5 * * *',
                        }),
                    }),
                }).api
        ).not.toThrow();
    });

    it('claims nothing for jobs that run in process', () => {
        expect(
            () =>
                defineConfig({
                    ...config,
                    jobRunner: {
                        mode: 'in-process',
                    },
                    routes: routesAt('/jobs/dispatch'),
                    jobs: scheduled,
                }).api
        ).not.toThrow();
    });
});

describe('how jobs run', () => {
    const scheduled = k.jobs('scheduler', {
        sendDigests: k.job({
            schedule: '0 5 * * *',
        }),
    });

    const unguarded = k.jobs({
        sendDigests: k.job({
            schedule: '0 5 * * *',
        }),
    });

    it('must be said once jobs are declared', () => {
        expect(
            () =>
                // @ts-expect-error `jobRunner` is required once `jobs` declares one
                defineConfig({
                    ...config,
                    routes: {},
                    jobs: scheduled,
                }).api
        ).toThrow('The jobs do not say how they run.');
    });

    it('rejects jobs served over HTTP with no identity', () => {
        expect(
            () =>
                defineConfig({
                    ...config,
                    routes: {},
                    jobs: unguarded,
                    jobRunner: {
                        mode: 'http',
                    },
                }).api
        ).toThrow('would let anyone trigger them');
    });

    it('accepts jobs with no identity in process', () => {
        expect(
            () =>
                defineConfig({
                    ...config,
                    routes: {},
                    jobs: unguarded,
                    jobRunner: {
                        mode: 'in-process',
                    },
                }).api
        ).not.toThrow();
    });

    it('needs no jobRunner when no jobs are declared', () => {
        expect(
            () =>
                defineConfig({
                    ...config,
                    routes: {},
                }).api
        ).not.toThrow();
    });
});

describe('the job endpoints', () => {
    const scheduled = k.jobs({
        sendDigests: k.job({
            schedule: '0 5 * * *',
        }),
    });

    it('serve dispatch and run under the namespace', () => {
        const served = jobRoutes({
            jobs: scheduled,
            handlers: {},
        });
        expect(Object.values(served).map((route) => route.path)).toEqual(['/jobs/dispatch', '/jobs/run']);
    });

    it('are not built for jobs that run in process', () => {
        const served = jobRoutes({
            jobs: scheduled,
            handlers: {},
            config: {
                mode: 'in-process',
            },
        });
        expect(served).toEqual({});
    });
});

describe('job handlers and plugins', () => {
    const greeter = definePlugin({
        slug: 'greeter',
        options: z.object({
            greeting: z.string(),
        }),
        setup: ({ options }) => ({
            exports: {
                greet: (name: string) => `${options.greeting}, ${name}`,
            },
        }),
    });

    it('hands every job handler the installed plugins', async () => {
        const received: string[] = [];
        const jobs = k.jobs('scheduler', {
            welcome: k
                .job({
                    input: z.object({
                        name: z.string(),
                    }),
                })
                .handler((args) => {
                    const { plugins } = args as unknown as {
                        plugins: {
                            greeter: {
                                greet: (name: string) => string;
                            };
                        };
                    };
                    received.push(plugins.greeter.greet(args.input.name));
                }),
        });
        const { api } = defineConfig({
            ...config,
            routes: {},
            jobRunner: {
                mode: 'http',
            },
            jobs,
            plugins: [
                greeter({
                    greeting: 'Hello',
                }),
            ],
        });

        const runner = jobRunnerFrom((api as unknown as Record<typeof JOBS_META, JobsMeta>)[JOBS_META]);
        await jobFnAt(runner, 'welcome')?.run({
            name: 'Alice',
        });

        expect(received).toEqual(['Hello, Alice']);
    });
});
