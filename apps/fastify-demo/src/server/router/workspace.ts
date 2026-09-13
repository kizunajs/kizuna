import { db } from '@ts-kizuna-demo/shared';
import type { Router } from '@ts-kizuna/fastify';
import type { contract } from '@ts-kizuna-demo/shared';

export const workspace: Router<typeof contract.routes.workspace> = {
    getWorkspace: async ({ auth }) => {
        const workspace = await db.workspaces.findById(auth.member.workspaceId);
        return {
            status: 200,
            body: {
                id: auth.member.workspaceId,
                name: workspace?.name ?? '',
            },
        };
    },
    deleteWorkspace: async ({ auth }) => ({
        status: 200,
        body: {
            ok: await db.workspaces.delete(auth.member.workspaceId),
        },
    }),
    transfer: async ({ body, auth }) => {
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
    },
};
