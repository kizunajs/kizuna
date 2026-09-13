import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import type {
    HandlersFromAccessControl,
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
        ...okResponse,
    },
});

const workspace = k.routes({
    getWorkspace: {
        method: 'GET',
        path: '/workspace',
        ...okResponse,
    },
    deleteWorkspace: {
        method: 'DELETE',
        path: '/workspace',
        ...okResponse,
    },
});

const contract = k.contract({
    routes: {
        users,
        workspace,
    },
    accessControl: {
        users: false,
        workspace: {
            '*': 'user',
            deleteWorkspace: {
                auth: ['user', 'member'],
                requires: {
                    workspace: ['delete'],
                },
            },
        },
    },
});

type Identities = NonNullable<typeof contract.securitySchemes>;
type Handlers = HandlersFromAccessControl<typeof contract.routes, {}, Identities, NonNullable<typeof contract.accessControl>>;

test('a public route receives no auth context', () => {
    type Args = Parameters<Handlers['users']['listUsers']>[0];
    expectTypeOf<Args>().not.toHaveProperty('auth');
});

test('a group-secured route receives the identity context under auth by name', () => {
    type Args = Parameters<Handlers['workspace']['getWorkspace']>[0];
    expectTypeOf<Args['auth']['user']>().toEqualTypeOf<{ userId: string }>();
});

test('a secured handler reads the role and what it holds', () => {
    type Args = Parameters<Handlers['workspace']['deleteWorkspace']>[0];
    expectTypeOf<Args['auth']['member']['role']>().toEqualTypeOf<MemberRole>();
    expectTypeOf<Args['auth']['member']['permissions']>().toEqualTypeOf<readonly MemberPermission[]>();
    expectTypeOf<Args['auth']['member']['workspaceUserId']>().toEqualTypeOf<string>();
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
            ...okResponse,
        },
    });
    const plainContract = plain.contract({
        routes: {
            docs,
        },
        accessControl: {
            docs: {
                auth: 'viewer',
                roles: ['editor'],
            },
        },
    });
    type Args = Parameters<
        HandlersFromAccessControl<
            typeof plainContract.routes,
            {},
            NonNullable<typeof plainContract.securitySchemes>,
            NonNullable<typeof plainContract.accessControl>
        >['docs']['listDocs']
    >[0];
    expectTypeOf<Args['auth']['viewer']['role']>().toEqualTypeOf<'viewer' | 'editor' | readonly ('viewer' | 'editor')[]>();
    expectTypeOf<Args['auth']['viewer']>().not.toHaveProperty('permissions');
    expectTypeOf<GuardReturn<typeof viewer>>().not.toHaveProperty('permissions');
    // @ts-expect-error roles from names carry no permissions to require
    plain.contract({
        routes: {
            docs,
        },
        accessControl: {
            docs: {
                auth: 'viewer',
                requires: {
                    workspace: ['read'],
                },
            },
        },
    });
});

test('roles on an entry are checked against the identity', () => {
    // @ts-expect-error viewer is not a member role
    k.contract({
        routes: {
            users,
            workspace,
        },
        accessControl: {
            users: false,
            workspace: {
                auth: 'member',
                roles: 'viewer',
            },
        },
    });
    // @ts-expect-error user declares no roles
    k.contract({
        routes: {
            users,
            workspace,
        },
        accessControl: {
            users: false,
            workspace: {
                auth: 'user',
                roles: 'owner',
            },
        },
    });
});

test('an auth array hands the handler every identity it names', () => {
    type Args = Parameters<Handlers['workspace']['deleteWorkspace']>[0];
    expectTypeOf<Args['auth']['user']>().toEqualTypeOf<{ userId: string }>();
});

test('requires rejects a permission the identity does not declare', () => {
    // @ts-expect-error archive is not a workspace permission
    k.contract({
        routes: {
            users,
            workspace,
        },
        accessControl: {
            users: false,
            workspace: {
                auth: 'member',
                requires: {
                    workspace: ['archive'],
                },
            },
        },
    });
});

test('requires rejects an identity that declares no roles', () => {
    // @ts-expect-error user declares no roles
    k.contract({
        routes: {
            users,
            workspace,
        },
        accessControl: {
            users: false,
            workspace: {
                auth: 'user',
                requires: {
                    workspace: ['read'],
                },
            },
        },
    });
});

test('an auth-less contract degrades to plain handlers', () => {
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
    type PlainHandlers = HandlersFromAccessControl<
        typeof plainContract.routes,
        {},
        Record<string, never>,
        NonNullable<typeof plainContract.accessControl>
    >;
    type Args = Parameters<PlainHandlers['items']['listItems']>[0];
    expectTypeOf<Args>().toHaveProperty('query');
    expectTypeOf<Args>().not.toHaveProperty('auth');
    expectTypeOf<ReturnType<PlainHandlers['items']['listItems']>>().toEqualTypeOf<
        HandlerReturn<(typeof items)['listItems']> | Promise<HandlerReturn<(typeof items)['listItems']>>
    >();
});

test('the access control map must cover every route group', () => {
    k.contract({
        routes: {
            users,
            workspace,
        },
        // @ts-expect-error workspace is missing from the access control map
        accessControl: {
            users: false,
        },
    });
});

test('the access control map rejects unknown identity names', () => {
    // @ts-expect-error 'admin' is not a declared identity
    k.contract({
        routes: {
            users,
            workspace,
        },
        accessControl: {
            users: false,
            workspace: 'admin',
        },
    });
});

test('k.routes rejects inline security on a route', () => {
    k.routes({
        listThings: {
            method: 'GET',
            path: '/things',
            // @ts-expect-error security is owned by the access control map
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
            ...okResponse,
        },
        me: {
            method: 'GET',
            path: '/auth/me',
            ...okResponse,
        },
    },
    events: {
        list: {
            method: 'GET',
            path: '/events',
            ...okResponse,
        },
        get: {
            method: 'GET',
            path: '/events/:eventId',
            ...okResponse,
        },
    },
    invites: {
        list: {
            method: 'GET',
            path: '/invites',
            ...okResponse,
        },
        get: {
            method: 'GET',
            path: '/invites/:inviteId',
            ...okResponse,
        },
    },
});

const nestedContract = k.contract({
    routes: {
        members,
    },
    accessControl: {
        members: {
            '*': 'user',
            session: {
                '*': 'user',
                login: false,
            },
            events: {
                auth: ['user', 'member'],
                requires: {
                    workspace: ['delete'],
                },
            },
            invites: false,
        },
    },
});

type NestedHandlers = HandlersFromAccessControl<
    typeof nestedContract.routes,
    {},
    NonNullable<typeof nestedContract.securitySchemes>,
    NonNullable<typeof nestedContract.accessControl>
>;

test('a route opted out in a nested cascade receives no auth context', () => {
    type Args = Parameters<NestedHandlers['members']['session']['login']>[0];
    expectTypeOf<Args>().not.toHaveProperty('auth');
});

test('a route not named in a nested cascade inherits its * default', () => {
    type Args = Parameters<NestedHandlers['members']['session']['me']>[0];
    expectTypeOf<Args['auth']['user']>().toEqualTypeOf<{ userId: string }>();
});

test('an access value on a subgroup key applies across its subtree', () => {
    type Args = Parameters<NestedHandlers['members']['events']['list']>[0];
    expectTypeOf<Args['auth']['user']>().toEqualTypeOf<{ userId: string }>();
    expectTypeOf<Args['auth']['member']['role']>().toEqualTypeOf<MemberRole>();
});

test('a subgroup opted out with false is public despite sibling overrides for the same route keys', () => {
    type Args = Parameters<NestedHandlers['members']['invites']['list']>[0];
    expectTypeOf<Args>().not.toHaveProperty('auth');
});

test('the access control map rejects a cascade key that does not name a route or subgroup in the group', () => {
    // @ts-expect-error list is a leaf route key, not directly in members
    k.contract({
        routes: {
            members,
        },
        accessControl: {
            members: {
                '*': 'user',
                list: false,
            },
        },
    });
});

test('the access control map rejects a nested cascade on a route key', () => {
    // @ts-expect-error login is a route, not a group
    k.contract({
        routes: {
            members,
        },
        accessControl: {
            members: {
                '*': 'user',
                session: {
                    '*': 'user',
                    login: {
                        '*': false,
                    },
                },
            },
        },
    });
});

test('GuardParams only derives params from the subgroups an identity secures', () => {
    type MemberParams = GuardParams<typeof nestedContract.routes, NonNullable<typeof nestedContract.accessControl>, 'member'>;
    expectTypeOf<MemberParams>().toEqualTypeOf<{ eventId?: string }>();
});

test('GuardParams derives param names from the routes an identity secures', () => {
    const paramRoutes = k.routes({
        getWorkspaceUser: {
            method: 'GET',
            path: '/workspaces/:workspaceId/users/:id',
            ...okResponse,
        },
        listWorkspaces: {
            method: 'GET',
            path: '/workspaces',
            ...okResponse,
        },
    });
    const paramContract = k.contract({
        routes: {
            api: paramRoutes,
        },
        accessControl: {
            api: 'member',
        },
    });
    type Params = GuardParams<typeof paramContract.routes, NonNullable<typeof paramContract.accessControl>, 'member'>;
    expectTypeOf<Params>().toEqualTypeOf<{ workspaceId?: string; id?: string }>();
    type NoParams = GuardParams<typeof paramContract.routes, NonNullable<typeof paramContract.accessControl>, 'user'>;
    expectTypeOf<NoParams>().toEqualTypeOf<Record<string, string>>();
});

test('a contract brands each route with the auth its access entry resolves to', () => {
    expectTypeOf<BrandedHandlerContext<typeof nestedContract.routes.members.session.me>>().toEqualTypeOf<{
        auth: { user: { userId: string } };
    }>();
});

test('a route opted out in a nested cascade carries no branded auth', () => {
    expectTypeOf<BrandedHandlerContext<typeof nestedContract.routes.members.session.login>>().toEqualTypeOf<{}>();
});

test('a branded route carries every identity a subgroup access value names', () => {
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
                ...okResponse,
            },
        }),
    },
    accessControl: {
        invites: 'inviteToken',
    },
});

type InviteHandlers = HandlersFromAccessControl<
    typeof inviteContract.routes,
    {},
    NonNullable<typeof inviteContract.securitySchemes>,
    NonNullable<typeof inviteContract.accessControl>
>;

test('a custom identity carries no credential key to its guard', () => {
    expectTypeOf<CredentialOf<typeof inviteToken>>().toEqualTypeOf<{}>();
});

test('a custom-guarded route hands its context to the handler by name', () => {
    type Args = Parameters<InviteHandlers['invites']['getInvite']>[0];
    expectTypeOf<Args['auth']['inviteToken']>().toEqualTypeOf<{ inviteId: string }>();
});

test('a custom identity derives its guard params from the routes it secures', () => {
    type Params = GuardParams<typeof inviteContract.routes, NonNullable<typeof inviteContract.accessControl>, 'inviteToken'>;
    expectTypeOf<Params>().toEqualTypeOf<{ token?: string }>();
});
