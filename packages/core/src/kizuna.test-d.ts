import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import type {
    HandlersFromRoutes,
    HandlerReturn,
    GuardReturn,
    GuardSuccess,
    GuardParams,
    RouteHandler,
    BrandedHandlerContext,
} from './handler-pipeline.js';
import type { RouteDefinition } from './types.js';
import { Kizuna } from './kizuna.js';
import { type CredentialOf } from './identity.js';

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

type MemberRole = 'owner' | 'admin' | readonly ('owner' | 'admin')[];
type MemberPermission = 'workspace:read' | 'workspace:delete';

const k = new Kizuna({
    identities: {
        user,
        member,
    },
});

const okResponse = {
    responses: {
        200: z.object({
            ok: z.boolean(),
        }),
    },
} as const;

const users = k.routes({
    listUsers: {
        method: 'GET',
        path: '/users',
        auth: false,
        ...okResponse,
    },
});

const workspace = k.routes({
    getWorkspace: {
        method: 'GET',
        path: '/workspace',
        auth: 'user',
        ...okResponse,
    },
    deleteWorkspace: {
        method: 'DELETE',
        path: '/workspace',
        auth: {
            identity: ['user', 'member'],
            requires: {
                workspace: ['delete'],
            },
        },
        ...okResponse,
    },
});

const contract = k.contract({
    routes: {
        users,
        workspace,
    },
});

type Identities = NonNullable<typeof contract.securitySchemes>;
type Handlers = HandlersFromRoutes<typeof contract.routes, {}, Identities>;

test('a public route receives no auth context', () => {
    type Args = Parameters<Handlers['users']['listUsers']>[0];
    expectTypeOf<Args>().not.toHaveProperty('auth');
});

test('a secured route receives the identity context under auth by name', () => {
    type Args = Parameters<Handlers['workspace']['getWorkspace']>[0];
    expectTypeOf<Args['auth']['user']>().toEqualTypeOf<{ userId: string }>();
});

test('a secured handler reads the role and what it holds', () => {
    type Args = Parameters<Handlers['workspace']['deleteWorkspace']>[0];
    expectTypeOf<Args['auth']['member']['role']>().toEqualTypeOf<MemberRole>();
    expectTypeOf<Args['auth']['member']['permissions']>().toEqualTypeOf<readonly MemberPermission[]>();
    expectTypeOf<Args['auth']['member']['workspaceUserId']>().toEqualTypeOf<string>();
});

test('an identity array hands the handler every identity it names', () => {
    type Args = Parameters<Handlers['workspace']['deleteWorkspace']>[0];
    expectTypeOf<Args['auth']['user']>().toEqualTypeOf<{ userId: string }>();
});

test('roles from names give the handler a role and no permissions', () => {
    const viewer = Kizuna.identity.bearer({
        context: z.object({
            userId: z.string(),
        }),
        roles: Kizuna.roles(['viewer', 'editor']),
    });
    const plain = new Kizuna({
        identities: {
            viewer,
        },
    });
    const docs = plain.routes({
        listDocs: {
            method: 'GET',
            path: '/docs',
            auth: {
                identity: 'viewer',
                roles: ['editor'],
            },
            ...okResponse,
        },
    });
    const plainContract = plain.contract({
        routes: {
            docs,
        },
    });
    type Args = Parameters<
        HandlersFromRoutes<typeof plainContract.routes, {}, NonNullable<typeof plainContract.securitySchemes>>['docs']['listDocs']
    >[0];
    expectTypeOf<Args['auth']['viewer']['role']>().toEqualTypeOf<'viewer' | 'editor' | readonly ('viewer' | 'editor')[]>();
    expectTypeOf<Args['auth']['viewer']>().not.toHaveProperty('permissions');
    expectTypeOf<GuardReturn<typeof viewer>>().not.toHaveProperty('permissions');
    plain.routes({
        listDocs: {
            method: 'GET',
            path: '/docs',
            // @ts-expect-error roles from names carry no permissions to require
            auth: {
                identity: 'viewer',
                requires: {
                    workspace: ['read'],
                },
            },
            ...okResponse,
        },
    });
});

test('roles on a route are checked against its identity', () => {
    k.routes({
        deleteWorkspace: {
            method: 'DELETE',
            path: '/workspace',
            // @ts-expect-error viewer is not a member role
            auth: {
                identity: 'member',
                roles: 'viewer',
            },
            ...okResponse,
        },
    });
    k.routes({
        deleteWorkspace: {
            method: 'DELETE',
            path: '/workspace',
            // @ts-expect-error user declares no roles
            auth: {
                identity: 'user',
                roles: 'owner',
            },
            ...okResponse,
        },
    });
});

test('requires rejects a permission the identity does not declare', () => {
    k.routes({
        deleteWorkspace: {
            method: 'DELETE',
            path: '/workspace',
            // @ts-expect-error archive is not a workspace permission
            auth: {
                identity: 'member',
                requires: {
                    workspace: ['archive'],
                },
            },
            ...okResponse,
        },
    });
});

test('requires rejects an identity that declares no roles', () => {
    k.routes({
        deleteWorkspace: {
            method: 'DELETE',
            path: '/workspace',
            // @ts-expect-error user declares no roles
            auth: {
                identity: 'user',
                requires: {
                    workspace: ['read'],
                },
            },
            ...okResponse,
        },
    });
});

test('a route cannot leave out its auth once an identity exists', () => {
    k.routes({
        // @ts-expect-error every route states its rule
        listThings: {
            method: 'GET',
            path: '/things',
            ...okResponse,
        },
    });
});

test('an identity-less contract degrades to plain handlers', () => {
    const plainK = new Kizuna();
    const items = plainK.routes({
        listItems: {
            method: 'GET',
            path: '/items',
            ...okResponse,
        },
    });
    const plainContract = plainK.contract({
        routes: {
            items,
        },
    });
    type PlainHandlers = HandlersFromRoutes<typeof plainContract.routes, {}, Record<string, never>>;
    type Args = Parameters<PlainHandlers['items']['listItems']>[0];
    expectTypeOf<Args>().toHaveProperty('query');
    expectTypeOf<Args>().not.toHaveProperty('auth');
    expectTypeOf<ReturnType<PlainHandlers['items']['listItems']>>().toEqualTypeOf<
        HandlerReturn<(typeof items)['listItems']> | Promise<HandlerReturn<(typeof items)['listItems']>>
    >();
});

test('a route rejects an identity the instance does not declare', () => {
    k.routes({
        listThings: {
            method: 'GET',
            path: '/things',
            // @ts-expect-error 'admin' is not a declared identity
            auth: 'admin',
            ...okResponse,
        },
    });
});

test('k.routes rejects inline security on a route', () => {
    k.routes({
        listThings: {
            method: 'GET',
            path: '/things',
            auth: false,
            // @ts-expect-error security is resolved from auth
            security: ['user'],
            ...okResponse,
        },
    });
});

test('GuardReturn accepts a literal role without an annotation', () => {
    const result: GuardReturn<typeof member> = {
        workspaceUserId: '1',
        role: 'owner',
    };
    expectTypeOf(result.role).toEqualTypeOf<MemberRole>();
    const several: GuardReturn<typeof member> = {
        workspaceUserId: '1',
        role: ['owner', 'admin'],
    };
    void several;
    const invalid: GuardReturn<typeof member> = {
        workspaceUserId: '1',
        // @ts-expect-error 'viewer' is not a member role
        role: 'viewer',
    };
    void invalid;
});

test('GuardSuccess carries the permissions the runtime fills in', () => {
    expectTypeOf<GuardSuccess<typeof member>['permissions']>().toEqualTypeOf<readonly MemberPermission[]>();
    expectTypeOf<GuardReturn<typeof member>['permissions']>().toEqualTypeOf<readonly MemberPermission[] | undefined>();
});

test('resolved security on a route is the typed requirement shape', () => {
    expectTypeOf<RouteDefinition['security']>().toEqualTypeOf<
        readonly (string | { [name: string]: readonly string[] | undefined })[] | undefined
    >();
});

const members = k.routes({
    session: {
        login: {
            method: 'POST',
            path: '/auth/login',
            auth: false,
            ...okResponse,
        },
        me: {
            method: 'GET',
            path: '/auth/me',
            auth: 'user',
            ...okResponse,
        },
    },
    events: {
        list: {
            method: 'GET',
            path: '/events',
            auth: {
                identity: ['user', 'member'],
                requires: {
                    workspace: ['delete'],
                },
            },
            ...okResponse,
        },
        get: {
            method: 'GET',
            path: '/events/:eventId',
            auth: {
                identity: ['user', 'member'],
                requires: {
                    workspace: ['delete'],
                },
            },
            ...okResponse,
        },
    },
    invites: {
        list: {
            method: 'GET',
            path: '/invites',
            auth: false,
            ...okResponse,
        },
        get: {
            method: 'GET',
            path: '/invites/:inviteId',
            auth: false,
            ...okResponse,
        },
    },
});

const nestedContract = k.contract({
    routes: {
        members,
    },
});

type NestedHandlers = HandlersFromRoutes<typeof nestedContract.routes, {}, NonNullable<typeof nestedContract.securitySchemes>>;

test('a public route in a nested group receives no auth context', () => {
    type Args = Parameters<NestedHandlers['members']['session']['login']>[0];
    expectTypeOf<Args>().not.toHaveProperty('auth');
});

test('a secured route in a nested group receives its identity', () => {
    type Args = Parameters<NestedHandlers['members']['session']['me']>[0];
    expectTypeOf<Args['auth']['user']>().toEqualTypeOf<{ userId: string }>();
});

test('a route naming two identities receives both', () => {
    type Args = Parameters<NestedHandlers['members']['events']['list']>[0];
    expectTypeOf<Args['auth']['user']>().toEqualTypeOf<{ userId: string }>();
    expectTypeOf<Args['auth']['member']['role']>().toEqualTypeOf<MemberRole>();
});

test('sibling groups keep their own auth for the same route key', () => {
    type Args = Parameters<NestedHandlers['members']['invites']['list']>[0];
    expectTypeOf<Args>().not.toHaveProperty('auth');
});

test('GuardParams only derives params from the routes an identity secures', () => {
    type MemberParams = GuardParams<typeof nestedContract.routes, 'member'>;
    expectTypeOf<MemberParams>().toEqualTypeOf<{ eventId?: string }>();
});

test('GuardParams derives param names from every route an identity secures', () => {
    const paramRoutes = k.routes({
        getWorkspaceUser: {
            method: 'GET',
            path: '/workspaces/:workspaceId/users/:id',
            auth: 'member',
            ...okResponse,
        },
        listWorkspaces: {
            method: 'GET',
            path: '/workspaces',
            auth: 'member',
            ...okResponse,
        },
    });
    const paramContract = k.contract({
        routes: {
            api: paramRoutes,
        },
    });
    type Params = GuardParams<typeof paramContract.routes, 'member'>;
    expectTypeOf<Params>().toEqualTypeOf<{ workspaceId?: string; id?: string }>();
    type NoParams = GuardParams<typeof paramContract.routes, 'user'>;
    expectTypeOf<NoParams>().toEqualTypeOf<Record<string, string>>();
});

test('a contract brands each route with the auth it declares', () => {
    expectTypeOf<BrandedHandlerContext<typeof nestedContract.routes.members.session.me>>().toEqualTypeOf<{
        auth: { user: { userId: string } };
    }>();
});

test('a public route carries no branded auth', () => {
    expectTypeOf<BrandedHandlerContext<typeof nestedContract.routes.members.session.login>>().toEqualTypeOf<{}>();
});

test('a branded route carries every identity its auth names', () => {
    type Context = BrandedHandlerContext<typeof nestedContract.routes.members.events.list>;
    expectTypeOf<Context['auth']['user']>().toEqualTypeOf<{ userId: string }>();
    expectTypeOf<Context['auth']['member']['role']>().toEqualTypeOf<MemberRole>();
    expectTypeOf<Context['auth']['member']['workspaceUserId']>().toEqualTypeOf<string>();
});

test('a route straight from k.routes is unbranded', () => {
    expectTypeOf<BrandedHandlerContext<typeof users.listUsers>>().toEqualTypeOf<{}>();
});

test('the standalone RouteHandler matches the Router tree it drops into', () => {
    expectTypeOf<RouteHandler<typeof nestedContract.routes.members.session.me, {}>>().toEqualTypeOf<
        NestedHandlers['members']['session']['me']
    >();
});

const inviteToken = Kizuna.identity.custom({
    context: z.object({
        inviteId: z.string(),
    }),
});

const inviteK = new Kizuna({
    identities: {
        inviteToken,
    },
});

const inviteContract = inviteK.contract({
    routes: {
        invites: inviteK.routes({
            getInvite: {
                method: 'GET',
                path: '/invites/:token',
                auth: 'inviteToken',
                ...okResponse,
            },
        }),
    },
});

type InviteHandlers = HandlersFromRoutes<typeof inviteContract.routes, {}, NonNullable<typeof inviteContract.securitySchemes>>;

test('a custom identity carries no credential key to its guard', () => {
    expectTypeOf<CredentialOf<typeof inviteToken>>().toEqualTypeOf<{}>();
});

test('a custom-guarded route hands its context to the handler by name', () => {
    type Args = Parameters<InviteHandlers['invites']['getInvite']>[0];
    expectTypeOf<Args['auth']['inviteToken']>().toEqualTypeOf<{ inviteId: string }>();
});

test('a custom identity derives its guard params from the routes it secures', () => {
    type Params = GuardParams<typeof inviteContract.routes, 'inviteToken'>;
    expectTypeOf<Params>().toEqualTypeOf<{ token?: string }>();
});
