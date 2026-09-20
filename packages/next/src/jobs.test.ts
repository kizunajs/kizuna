import { describe, expect, it } from 'vitest';
import { nextAdapter } from './server.js';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { defineConfig } from 'kizunajs';

interface Config {
    adapter: ReturnType<typeof nextAdapter>;
    auth: {
        identities: {
            scheduler: typeof scheduler;
        };
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
    auth: {
        identities: {
            scheduler,
        },
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
    adapter: nextAdapter(),
    routes,
    jobs,
}).api;

const api = contract;

const { GET, POST } = api.mount({
    basePath: '/api',
});

const secret = {
    authorization: 'Bearer cron-secret',
};

describe('the dispatch endpoint', () => {
    it('runs the jobs due this minute, under the base path', async () => {
        const response = await POST(
            new NextRequest('http://localhost:3000/api/jobs/dispatch', {
                method: 'POST',
                headers: secret,
            })
        );
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
        const response = await POST(
            new NextRequest('http://localhost:3000/api/jobs/dispatch', {
                method: 'POST',
            })
        );
        expect(response.status).toBe(401);
        expect(response.headers.get('content-type')).toContain('application/problem+json');
    });

    it('gives a job no endpoint of its own', async () => {
        const response = await POST(
            new NextRequest('http://localhost:3000/api/jobs/send-digests', {
                method: 'POST',
                headers: secret,
            })
        );
        expect(response.status).toBe(404);
    });

    it('leaves the API routes working alongside it', async () => {
        const response = await GET(new NextRequest('http://localhost:3000/api/users'));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(['ada']);
    });

    it('404s a path that is neither a route nor the dispatch endpoint', async () => {
        const response = await GET(new NextRequest('http://localhost:3000/api/nope'));
        expect(response.status).toBe(404);
    });
});
