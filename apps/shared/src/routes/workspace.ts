import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { ProblemDetailsSchema } from '@ts-kizuna/core/schemas';
import { z } from 'zod';
import { k } from '../k';
import { UserSchema } from './users';

const workspaceMembers = k.routes('members', {
    listMembers: k
        .route({
            method: 'GET',
            path: '/workspace/members',
            auth: 'user',
            responses: {
                200: z.object({
                    members: z.array(UserSchema),
                }),
            },
            summary: 'List workspace members',
        })
        .handler(async ({ auth }) => {
            const allMembers = await db.users.findMany();
            return {
                status: 200,
                body: {
                    members: allMembers.filter((candidate) => candidate.id !== auth.user.userId),
                },
            };
        }),
    inviteMember: k
        .route({
            method: 'POST',
            path: '/workspace/members',
            auth: {
                identity: ['user', 'member'],
                requires: {
                    invite: ['send'],
                },
            },
            body: z.object({
                email: z.email(),
            }),
            responses: {
                201: UserSchema,
                409: ProblemDetailsSchema,
            },
            summary: 'Invite a member to the workspace',
        })
        .handler(async ({ body, auth }) => {
            const existingMember = await db.users.findByEmail(body.email);
            if (existingMember) {
                return {
                    status: 409,
                    body: {
                        detail: `${body.email} is already a member (invite attempted by ${auth.member.role}).`,
                    },
                };
            }
            const invited = await db.users.create({
                id: randomUUID(),
                name: body.email,
                email: body.email,
            });
            return {
                status: 201,
                body: invited,
            };
        }),
    cancelInvite: k
        .route({
            method: 'DELETE',
            path: '/workspace/invites/:inviteId',
            auth: {
                identity: ['user', 'member'],
                requires: {
                    invite: ['cancel'],
                },
            },
            responses: {
                200: z.object({
                    cancelled: z.boolean(),
                }),
                404: ProblemDetailsSchema,
            },
            summary: 'Cancel an invite, an admin only their own',
        })
        .handler(async ({ params, auth }) => {
            const invite = await db.invites.findById(params.inviteId);
            if (!invite) {
                return {
                    status: 404,
                    body: {
                        detail: `No invite ${params.inviteId}`,
                    },
                };
            }
            if (invite.sentBy !== auth.member.workspaceUserId) {
                return {
                    status: 403,
                    body: {
                        detail: 'Only the member who sent an invite cancels it',
                    },
                };
            }
            await db.invites.cancel(invite.id);
            return {
                status: 200,
                body: {
                    cancelled: true,
                },
            };
        }),
});

const workspaceInfo = k.routes('workspace', {
    getWorkspace: k
        .route({
            method: 'GET',
            path: '/workspace',
            auth: {
                identity: 'member',
                requires: {
                    workspace: ['read'],
                },
            },
            responses: {
                200: z.object({
                    id: z.string(),
                    name: z.string(),
                }),
            },
            summary: 'Get workspace info',
        })
        .handler(async ({ auth }) => {
            const workspace = await db.workspaces.findById(auth.member.workspaceId);
            return {
                status: 200,
                body: {
                    id: auth.member.workspaceId,
                    name: workspace?.name ?? '',
                },
            };
        }),
    deleteWorkspace: k
        .route({
            method: 'DELETE',
            path: '/workspace',
            auth: {
                identity: 'member',
                requires: {
                    workspace: ['delete'],
                },
            },
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
            summary: 'Delete the workspace, owner only',
            tool: {
                confirm: 'This deletes the workspace and everything in it. It cannot be undone.',
            },
        })
        .handler(async ({ auth }) => ({
            status: 200,
            body: {
                ok: await db.workspaces.delete(auth.member.workspaceId),
            },
        })),
    transfer: k
        .route({
            method: 'POST',
            path: '/workspace/transfer',
            auth: {
                identity: 'member',
                requires: {
                    workspace: ['transfer'],
                },
            },
            body: z.object({
                toUserId: z.string(),
            }),
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
            summary: 'Transfer ownership, owner only',
        })
        .handler(async ({ body, auth }) => {
            if (body.toUserId === auth.member.workspaceUserId) {
                return {
                    status: 200,
                    body: {
                        ok: false,
                    },
                };
            }
            await db.users.delete(body.toUserId);
            return {
                status: 200,
                body: {
                    ok: true,
                },
            };
        }),
});

export const workspaceRoutes = {
    members: workspaceMembers,
    info: workspaceInfo,
};
