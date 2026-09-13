import { ProblemDetailsSchema } from '@ts-kizuna/core/schemas';
import { z } from 'zod';
import { k } from '../k';
import { UserSchema } from './users';

const workspaceMembers = k.routes('members', {
    listMembers: {
        method: 'GET',
        path: '/workspace/members',
        responses: {
            200: z.object({
                members: z.array(UserSchema),
            }),
        },
        summary: 'List workspace members',
    },
    inviteMember: {
        method: 'POST',
        path: '/workspace/members',
        body: z.object({
            email: z.email(),
        }),
        responses: {
            201: UserSchema,
            409: ProblemDetailsSchema,
        },
        summary: 'Invite a member to the workspace',
    },
    cancelInvite: {
        method: 'DELETE',
        path: '/workspace/invites/:inviteId',
        responses: {
            200: z.object({
                cancelled: z.boolean(),
            }),
            404: ProblemDetailsSchema,
        },
        summary: 'Cancel an invite, an admin only their own',
    },
});

const workspaceInfo = k.routes('workspace', {
    getWorkspace: {
        method: 'GET',
        path: '/workspace',
        responses: {
            200: z.object({
                id: z.string(),
                name: z.string(),
            }),
        },
        summary: 'Get workspace info',
    },
    deleteWorkspace: {
        method: 'DELETE',
        path: '/workspace',
        responses: {
            200: z.object({
                ok: z.boolean(),
            }),
        },
        summary: 'Delete the workspace, owner only',
    },
    transfer: {
        method: 'POST',
        path: '/workspace/transfer',
        body: z.object({
            toUserId: z.string(),
        }),
        responses: {
            200: z.object({
                ok: z.boolean(),
            }),
        },
        summary: 'Transfer ownership, owner only',
    },
});

export const workspaceRoutes = {
    members: workspaceMembers,
    info: workspaceInfo,
};
