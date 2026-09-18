import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from '@ts-kizuna/core';
import { defineConfig } from '@ts-kizuna/core';
import { fastifyAdapter } from './server.js';

let failing = false;

interface Config {
    adapter: typeof fastifyAdapter;
    identities: {
        scheduler: typeof scheduler;
    };
}

const k = new Kizuna<Config>();

const scheduler = k.identity
    .bearer({
        context: z.object({
            invokedBy: z.string(),
        }),
    })
    .guard(({ bearer, deny }) =>
        bearer?.token === 'cron-secret'
            ? { invokedBy: 'platform' }
            : deny({
                  status: 401,
                  body: {
                      detail: 'Unauthorized',
                  },
              })
    );

const config = {
    identities: {
        scheduler,
    },
};

const routes = k.routes({
    listUsers: k
        .route({
            method: 'GET',
            path: '/users',
            auth: false,
            responses: {
                200: z.array(z.string()),
            },
        })
        .handler(() => ({
            status: 200,
            body: ['ada'],
        })),
});

const jobs = k.jobs('scheduler', {
    sendDigests: k
        .job({
            schedule: '* * * * *',
            result: z.object({
                sent: z.int(),
            }),
        })
        .handler(() => {
            if (failing) throw new Error('the mailer is down');
            return {
                status: 200,
                body: {
                    sent: 8,
                },
            };
        }),
    reconcile: k
        .job({
            input: z.object({
                since: z.string(),
            }),
            result: z.object({
                reconciled: z.int(),
            }),
        })
        .handler(({ input }) => ({
            status: 200,
            body: {
                reconciled: input.since.length,
            },
        })),
    cleanup: k
        .job({
            schedule: '0 3 * * *',
        })
        .handler(() => {}),
});

const contract = defineConfig({
    ...config,
    adapter: fastifyAdapter,
    routes,
    jobs,
}).api;

const buildApp = async (options?: { failing?: boolean }) => {
    failing = options?.failing ?? false;
    const api = contract;

    const app = Fastify();
    await api.mount(app);
    await app.ready();
    return app;
};

const secret = {
    authorization: 'Bearer cron-secret',
};

describe('the dispatch endpoint', () => {
    it('runs the jobs due this minute', async () => {
        const response = await (
            await buildApp()
        ).inject({
            method: 'POST',
            url: '/jobs/dispatch',
            headers: secret,
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            due: ['sendDigests'],
            ran: [
                {
                    job: 'sendDigests',
                    status: 'ok',
                },
            ],
        });
    });

    it('rejects a tick without the scheduler credential', async () => {
        const response = await (
            await buildApp()
        ).inject({
            method: 'POST',
            url: '/jobs/dispatch',
        });
        expect(response.statusCode).toBe(401);
        expect(response.headers['content-type']).toContain('application/problem+json');
    });

    it('answers 503 with the failed names, so the scheduler retries', async () => {
        const response = await (
            await buildApp({ failing: true })
        ).inject({
            method: 'POST',
            url: '/jobs/dispatch',
            headers: secret,
        });
        expect(response.statusCode).toBe(503);
        expect(response.json()).toMatchObject({
            status: 503,
            failed: ['sendDigests'],
        });
    });

    it('gives a job no endpoint of its own', async () => {
        const response = await (
            await buildApp()
        ).inject({
            method: 'POST',
            url: '/jobs/send-digests',
            headers: secret,
        });
        expect(response.statusCode).toBe(404);
    });

    it('leaves the API routes working alongside it', async () => {
        const response = await (
            await buildApp()
        ).inject({
            method: 'GET',
            url: '/users',
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual(['ada']);
    });
});
