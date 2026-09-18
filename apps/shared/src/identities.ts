import { z } from 'zod';
import { db } from './db';
import { k } from './k';
import { roles } from './roles';

/**
 * A signed-in user, authenticated by a bearer session token. The guard resolves
 * the token to the context handlers read under `user`.
 */
export const user = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
    })
    .guard(async ({ bearer, deny }) => {
        const session = bearer ? await db.sessions.findByToken(bearer.token) : null;
        if (!session) {
            return deny({
                status: 401,
                body: {
                    detail: 'Unauthorized',
                    code: 'unauthenticated',
                },
            });
        }
        return {
            userId: session.userId,
        };
    });

/**
 * A workspace membership, authenticated by the `x-workspace-token` header. Its
 * callers hold one of the workspace `roles`, which the guard returns and a
 * route's `requires` is checked against.
 */
export const member = k.identity
    .apiKey({
        name: 'x-workspace-token',
        in: 'header',
        context: z.object({
            workspaceUserId: z.string(),
            workspaceId: z.string(),
        }),
        roles,
    })
    .guard(async ({ apiKey, deny }) => {
        const membership = apiKey ? await db.memberships.findByApiKey(apiKey.value) : null;
        if (!membership) {
            return deny({
                status: 403,
                body: {
                    detail: 'Forbidden',
                },
            });
        }
        return membership;
    });

/**
 * An invite capability URL (`/invites/:token`) whose path token is the credential.
 * No OpenAPI scheme can express a path segment, so it uses `custom`.
 */
export const inviteToken = k.identity
    .custom({
        context: z.object({
            inviteId: z.string(),
            email: z.email(),
        }),
        params: z.object({
            token: z.string(),
        }),
    })
    .guard(async ({ params, deny }) => {
        const invite = await db.invites.findByToken(params.token);
        if (!invite) {
            return deny({
                status: 404,
                body: {
                    detail: 'Not found',
                    code: 'not_found',
                },
            });
        }
        return {
            inviteId: invite.id,
            email: invite.email,
        };
    });

/**
 * The platform scheduler, authenticated by the shared secret it sends. Every job
 * requires it; no route does.
 */
export const scheduler = k.identity
    .bearer({
        context: z.object({
            invokedAt: z.string(),
        }),
    })
    .guard(({ bearer, deny }) => {
        if (bearer?.token !== (process.env.CRON_SECRET ?? 'dev-cron-secret')) {
            return deny({
                status: 401,
                body: {
                    detail: 'Unauthorized',
                    code: 'unauthenticated',
                },
            });
        }
        return {
            invokedAt: new Date().toISOString(),
        };
    });
