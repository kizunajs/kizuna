import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from '@ts-kizuna/core';
import { defineConfig } from '@ts-kizuna/core';
import { honoAdapter } from './server.js';

interface Config {
    adapter: typeof honoAdapter;
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
    adapter: honoAdapter,
    routes,
    jobs,
}).api;

let failing = false;

const buildApp = (options?: { failing?: boolean }) => {
    failing = options?.failing ?? false;
    const api = contract;

    const app = new Hono();
    api.mount(app);
    return app;
};

const secret = {
    authorization: 'Bearer cron-secret',
};

const tick = (app: Hono, options?: RequestInit) =>
    app.request('/jobs/dispatch', {
        method: 'POST',
        headers: secret,
        ...options,
    });

describe('the dispatch endpoint', () => {
    it('runs the jobs due this minute', async () => {
        const response = await tick(buildApp());
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
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
        const response = await buildApp().request('/jobs/dispatch', {
            method: 'POST',
        });
        expect(response.status).toBe(401);
        expect(response.headers.get('content-type')).toContain('application/problem+json');
    });

    it('answers 503 with the failed names, so the scheduler retries', async () => {
        const response = await tick(buildApp({ failing: true }));
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({
            status: 503,
            failed: ['sendDigests'],
        });
    });

    it('gives a job no endpoint of its own', async () => {
        const response = await buildApp().request('/jobs/send-digests', {
            method: 'POST',
            headers: secret,
        });
        expect(response.status).toBe(404);
    });

    it('leaves the API routes working alongside it', async () => {
        const response = await buildApp().request('/users');
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(['ada']);
    });
});
