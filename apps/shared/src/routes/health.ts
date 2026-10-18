import { ProblemDetailsSchema } from 'kizunajs/schemas';
import { z } from 'zod';
import { k } from '../k';

let warmedUp = false;

export const healthRoutes = k.routes.health({
    check: k
        .route({
            method: 'GET',
            path: '/health',
            auth: false,
            tool: true,
            responses: {
                200: {
                    body: z.object({ ok: z.boolean() }),
                    cache: 'no-store',
                },
            },
            summary: 'Health check, exercises nested sub-client routing',
        })
        .handler(() => ({
            status: 200,
            body: {
                ok: true,
            },
        })),
    version: k
        .route({
            method: 'GET',
            path: '/health/version',
            auth: false,
            responses: {
                200: z.object({ version: z.string() }),
            },
            summary: 'Version, exercises second method in a sub-client group',
        })
        .handler(() => ({
            status: 200,
            body: {
                version: '1.0.0',
            },
        })),
    ready: k
        .route({
            method: 'GET',
            path: '/health/ready',
            auth: false,
            responses: {
                200: z.object({ ready: z.boolean() }),
                503: {
                    body: ProblemDetailsSchema,
                    headers: z.object({
                        'retry-after': z.string(),
                    }),
                },
            },
            summary: 'Readiness, answers 503 with Retry-After once while the server warms up, exercises client retries',
        })
        .handler(() => {
            if (!warmedUp) {
                warmedUp = true;
                return {
                    status: 503,
                    body: {
                        detail: 'Warming up',
                    },
                    headers: {
                        'retry-after': '0',
                    },
                };
            }
            return {
                status: 200,
                body: {
                    ready: true,
                },
            };
        }),
    history: k
        .route({
            method: 'GET',
            path: '/health/history',
            auth: false,
            responses: {
                200: z.array(z.object({ ok: z.boolean(), checkedAt: z.iso.datetime() })),
            },
            summary: 'Health history, exercises array return type qualification',
        })
        .handler(() => ({
            status: 200,
            body: [{ ok: true, checkedAt: new Date().toISOString() }],
        })),
});
