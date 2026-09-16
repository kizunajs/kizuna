import { z } from 'zod';
import { Kizuna } from './kizuna.js';

const user = Kizuna.identity.bearer({
    context: z.object({
        userId: z.string(),
    }),
});

const permissions = Kizuna.permissions({
    workspace: ['read', 'delete'],
});

const roles = Kizuna.roles(permissions, {
    admin: {
        workspace: ['read'],
    },
    owner: 'all',
});

const member = Kizuna.identity.apiKey({
    name: 'x-workspace-token',
    in: 'header',
    context: z.object({
        workspaceUserId: z.string(),
    }),
    roles,
});

const k = new Kizuna({
    identities: {
        user,
        member,
    },
});

const routeDefinition = <const Auth>(path: `/${string}`, auth: Auth) => ({
    method: 'GET' as const,
    path,
    auth,
    responses: {
        200: z.object({
            ok: z.boolean(),
        }),
    },
});

export const items = k.routes({
    listItems: routeDefinition('/items', false),
    getSecret: routeDefinition('/secret', 'user'),
    ownerOnly: routeDefinition('/owner-only', {
        identity: 'member',
        requires: {
            workspace: ['delete'],
        },
    }),
    adminOnly: routeDefinition('/admin-only', {
        identity: 'member',
        roles: 'admin',
    }),
});
