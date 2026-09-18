import { db, k } from '@ts-kizuna-demo/shared';

export const requireUser = k.guard('user', async ({ bearer, deny }) => {
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

export const requireMember = k.guard('member', async ({ apiKey, deny }) => {
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

export const requireInviteToken = k.guard('inviteToken', async ({ params, deny }) => {
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
 * The shared secret the platform scheduler sends. Every job requires it.
 */
export const requireScheduler = k.guard('scheduler', ({ bearer, deny }) => {
    const secret = process.env.CRON_SECRET ?? 'dev-cron-secret';
    if (bearer?.token !== secret) {
        return deny({
            status: 401,
            body: {
                detail: 'Unauthorized',
            },
        });
    }
    return {
        invokedAt: new Date().toISOString(),
    };
});
