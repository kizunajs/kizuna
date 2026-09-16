import { z } from 'zod';
import { k } from '../k';

export const healthRoutes = k.routes('health', {
    check: {
        method: 'GET',
        path: '/health',
        auth: false,
        responses: {
            200: {
                body: z.object({ ok: z.boolean() }),
                cache: 'no-store',
            },
        },
        summary: 'Health check, exercises nested sub-client routing',
    },
    version: {
        method: 'GET',
        path: '/health/version',
        auth: false,
        responses: {
            200: z.object({ version: z.string() }),
        },
        summary: 'Version, exercises second method in a sub-client group',
    },
    history: {
        method: 'GET',
        path: '/health/history',
        auth: false,
        responses: {
            200: z.array(z.object({ ok: z.boolean(), checkedAt: z.iso.datetime() })),
        },
        summary: 'Health history, exercises array return type qualification',
    },
});
