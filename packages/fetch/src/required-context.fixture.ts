import { z } from 'zod';
import { Kizuna, defineConfig } from 'kizunajs';

interface Config {
    requestContext: {
        analytics: typeof analyticsContext;
        tenant: typeof tenantContext;
    };
}

const k = new Kizuna<Config>();

const analyticsContext = k.requestContext({
    headers: z.object({
        'x-session-id': z.string().optional(),
    }),
    context: z.object({
        sessionId: z.string().nullable(),
    }),
});

const tenantContext = k.requestContext({
    headers: z.object({
        'x-tenant': z.string(),
    }),
    context: z.object({
        tenantId: z.string(),
    }),
});

export const requiredContextContract = defineConfig({
    requestContext: {
        analytics: analyticsContext,
        tenant: tenantContext,
    },
    routes: [
        k.routes({
            users: {
                listUsers: k.route({
                    method: 'GET',
                    path: '/users',
                    responses: {
                        200: z.object({
                            ok: z.boolean(),
                        }),
                    },
                }),
            },
        }),
    ],
}).api;
