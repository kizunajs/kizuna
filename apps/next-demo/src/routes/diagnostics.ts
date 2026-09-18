import { z } from 'zod';
import { k } from '../k';

/**
 * What only this demo can answer, because it reads the Next request the adapter
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
                    path: z.string(),
                    method: z.string(),
                    userAgent: z.string().nullable(),
                }),
            },
            summary: 'Report the caller as Next sees it',
        })
        .handler(({ request }) => ({
            status: 200,
            body: {
                path: request.nextUrl.pathname,
                method: request.method,
                userAgent: request.headers.get('user-agent'),
            },
        })),
});
