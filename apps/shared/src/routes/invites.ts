import { ProblemDetailsSchema } from 'kizunajs/schemas';
import { z } from 'zod';
import { k } from '../k';
import { InviteToken } from '../invite-token';

/**
 * The `:token` of every route under `/invites/:token`.
 */
const InviteTokenParams = z.object({
    token: InviteToken,
});

export const inviteRoutes = k.routes('invites', {
    getInvite: k
        .route({
            method: 'GET',
            path: '/invites/:token',
            auth: 'inviteToken',
            pathParams: InviteTokenParams,
            responses: {
                200: z.object({
                    inviteId: z.string(),
                    email: z.email(),
                }),
                404: ProblemDetailsSchema,
            },
            summary: 'Resolve an invite by its capability-URL token, guarded by a custom path-token identity',
        })
        .handler(({ auth }) => ({
            status: 200,
            body: {
                inviteId: auth.inviteToken.inviteId,
                email: auth.inviteToken.email,
            },
        })),
    acceptInvite: k
        .route({
            method: 'POST',
            path: '/invites/:token/accept',
            auth: 'inviteToken',
            pathParams: InviteTokenParams,
            body: z.object({
                name: z.string(),
            }),
            responses: {
                201: z.object({
                    userId: z.string(),
                }),
                404: ProblemDetailsSchema,
            },
            summary: 'Accept an invite via the capability URL',
        })
        .handler(({ auth }) => ({
            status: 201,
            body: {
                userId: `usr_${auth.inviteToken.inviteId}`,
            },
        })),
});
