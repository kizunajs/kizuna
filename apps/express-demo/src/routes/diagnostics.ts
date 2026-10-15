import { z } from 'zod';
import { k } from '../k';

/**
 * What only this demo can answer, because it reads the Express request the
 * adapter hands every handler. `ready` is for the load balancer, so it's
 * hidden from the clients, the OpenAPI document and MCP.
 */
export const diagnostics = k.routes.diagnostics({
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
            summary: 'Report the caller as Express sees it',
        })
        .handler(({ req }) => ({
            status: 200,
            body: {
                ip: req.ip ?? 'unknown',
                protocol: req.protocol,
                userAgent: req.get('user-agent') ?? null,
            },
        })),
    ready: k
        .route({
            method: 'GET',
            path: '/diagnostics/ready',
            auth: false,
            hidden: true,
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
            summary: 'Answer the load balancer',
        })
        .handler(() => ({
            status: 200,
            body: {
                ok: true,
            },
        })),
});
