import { z } from 'zod';
import { k } from '../k';

/**
 * What only this demo can answer, because it reads the Hono context the adapter
 * hands every handler.
 */
export const diagnostics = k.routes({
    whoAmI: k
        .route({
            method: 'GET',
            path: '/diagnostics/caller',
            auth: false,
            responses: {
                200: z.object({
                    url: z.string(),
                    method: z.string(),
                    userAgent: z.string().nullable(),
                }),
            },
            summary: 'Report the caller as Hono sees it',
        })
        .handler(({ c }) => ({
            status: 200,
            body: {
                url: c.req.url,
                method: c.req.method,
                userAgent: c.req.header('user-agent') ?? null,
            },
        })),
});
