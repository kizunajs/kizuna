import { z } from 'zod';
import { getHeaderValue } from '@ts-kizuna/core';
import { k } from '../k';

/**
 * What only this demo can answer, because it reads the Fastify request the
 * adapter hands every handler.
 */
export const diagnostics = k.routes({
    whoAmI: k
        .route({
            method: 'GET',
            path: '/diagnostics/caller',
            auth: false,
            responses: {
                200: z.object({
                    ip: z.string(),
                    protocol: z.string(),
                    userAgent: z.string().nullable(),
                }),
            },
            summary: 'Report the caller as Fastify sees it',
        })
        .handler(({ request }) => ({
            status: 200,
            body: {
                ip: request.ip,
                protocol: request.protocol,
                userAgent: getHeaderValue(request.headers['user-agent']) ?? null,
            },
        })),
});
