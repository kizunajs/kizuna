import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    createAdapter,
    extractCredential,
    renderJsonResult,
    resolveSecurityRequirements,
    type AdapterRequest,
    type AdapterResult,
    type GuardMap,
} from './adapter.js';
import type { RouteDefinition } from './types.js';
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

const makeContract = () => {
    const routes = {
        items: k.routes({
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
        }),
    };
    return k.contract({
        routes,
    });
};

const makeRequest = (path: string, headers: Record<string, string> = {}): AdapterRequest<null> => ({
    request: null,
    method: 'GET',
    resolution: {
        kind: 'core-match',
        path,
    },
    query: {},
    headers,
    readBody: () => undefined,
});

const makeAdapter = () => {
    const results: AdapterResult[] = [];
    const adapter = createAdapter<null, void, Record<string, never>>({
        buildHandlerContext: () => ({}),
        respond: (result) => {
            results.push(result);
        },
    });
    return { adapter, results };
};

const okHandler = () => ({
    status: 200 as const,
    body: {
        ok: true,
    },
});

describe('guard pipeline', () => {
    it('skips guards entirely on a public route', async () => {
        const contract = makeContract();
        const { adapter, results } = makeAdapter();
        let guardRan = false;
        const guards: GuardMap<Record<string, never>> = {
            user: () => {
                guardRan = true;
                return {};
            },
        };
        await adapter.handle({
            routes: contract.routes,
            router: {
                items: {
                    listItems: okHandler,
                    getSecret: okHandler,
                    ownerOnly: okHandler,
                    adminOnly: okHandler,
                },
            },
            request: makeRequest('/items'),
            responseContext: {},
            guards,
            schemes: contract.securitySchemes,
        });
        expect(guardRan).toBe(false);
        expect(results[0]?.kind).toBe('success');
    });

    it('passes the extracted bearer credential to the guard and its context to the handler', async () => {
        const contract = makeContract();
        const { adapter, results } = makeAdapter();
        let received: unknown;
        await adapter.handle({
            routes: contract.routes,
            router: {
                items: {
                    listItems: okHandler,
                    getSecret: (args: Record<string, unknown>) => {
                        received = (args.auth as Record<string, unknown>).user;
                        return okHandler();
                    },
                    ownerOnly: okHandler,
                    adminOnly: okHandler,
                },
            },
            request: makeRequest('/secret', {
                authorization: 'Bearer tok_ada',
            }),
            responseContext: {},
            guards: {
                user: ({ bearer }) => ({
                    userId: `id-for-${(bearer as { token: string }).token}`,
                }),
            } as GuardMap<Record<string, never>>,
            schemes: contract.securitySchemes,
        });
        expect(results[0]?.kind).toBe('success');
        expect(received).toEqual({
            userId: 'id-for-tok_ada',
        });
    });

    it('returns guard-denied when the guard denies', async () => {
        const contract = makeContract();
        const { adapter, results } = makeAdapter();
        await adapter.handle({
            routes: contract.routes,
            router: {
                items: {
                    listItems: okHandler,
                    getSecret: okHandler,
                    ownerOnly: okHandler,
                    adminOnly: okHandler,
                },
            },
            request: makeRequest('/secret'),
            responseContext: {},
            guards: {
                user: ({ deny }) =>
                    deny({
                        status: 401,
                        body: {
                            detail: 'Unauthorized',
                        },
                    }),
            } as GuardMap<Record<string, never>>,
            schemes: contract.securitySchemes,
        });
        expect(results[0]).toEqual({
            kind: 'guard-denied',
            status: 401,
            body: {
                detail: 'Unauthorized',
            },
            headers: {
                'cache-control': 'no-store',
                'www-authenticate': 'Bearer',
            },
        });
    });

    it('carries the headers a denial passes and lets them replace the default challenge', async () => {
        const contract = makeContract();
        const { adapter, results } = makeAdapter();
        await adapter.handle({
            routes: contract.routes,
            router: {
                items: {
                    listItems: okHandler,
                    getSecret: okHandler,
                    ownerOnly: okHandler,
                    adminOnly: okHandler,
                },
            },
            request: makeRequest('/secret'),
            responseContext: {},
            guards: {
                user: ({ deny }) =>
                    deny({
                        status: 403,
                        body: {
                            detail: 'Missing scope',
                        },
                        headers: {
                            'www-authenticate': 'Bearer error="insufficient_scope", scope="items:read"',
                        },
                    }),
            } as GuardMap<Record<string, never>>,
            schemes: contract.securitySchemes,
        });
        expect(results[0]).toEqual({
            kind: 'guard-denied',
            status: 403,
            body: {
                detail: 'Missing scope',
            },
            headers: {
                'cache-control': 'no-store',
                'www-authenticate': 'Bearer error="insufficient_scope", scope="items:read"',
            },
        });
    });

    it('rejects with 403 when the returned role does not hold what the route requires', async () => {
        const contract = makeContract();
        const { adapter, results } = makeAdapter();
        await adapter.handle({
            routes: contract.routes,
            router: {
                items: {
                    listItems: okHandler,
                    getSecret: okHandler,
                    ownerOnly: okHandler,
                    adminOnly: okHandler,
                },
            },
            request: makeRequest('/owner-only', {
                'x-workspace-token': 'wst_admin',
            }),
            responseContext: {},
            guards: {
                member: () => ({
                    workspaceUserId: '2',
                    role: 'admin',
                }),
            } as GuardMap<Record<string, never>>,
            schemes: contract.securitySchemes,
        });
        expect(results[0]?.kind).toBe('guard-denied');
        expect((results[0] as { status: number; body: { detail: string } }).status).toBe(403);
        expect((results[0] as { body: { detail: string } }).body.detail).toBe('Forbidden: this route requires workspace:delete.');
    });

    it('passes requires when the returned role holds it and hands the handler the role and its permissions', async () => {
        const contract = makeContract();
        const { adapter, results } = makeAdapter();
        let received: unknown;
        await adapter.handle({
            routes: contract.routes,
            router: {
                items: {
                    listItems: okHandler,
                    getSecret: okHandler,
                    ownerOnly: (args: Record<string, unknown>) => {
                        received = (args.auth as Record<string, unknown>).member;
                        return okHandler();
                    },
                    adminOnly: okHandler,
                },
            },
            request: makeRequest('/owner-only', {
                'x-workspace-token': 'wst_owner',
            }),
            responseContext: {},
            guards: {
                member: ({ apiKey }) => ({
                    workspaceUserId: (apiKey as { value: string }).value,
                    role: 'owner',
                }),
            } as GuardMap<Record<string, never>>,
            schemes: contract.securitySchemes,
        });
        expect(results[0]?.kind).toBe('success');
        expect(received).toEqual({
            workspaceUserId: 'wst_owner',
            role: 'owner',
            permissions: ['workspace:read', 'workspace:delete'],
        });
    });

    it('rejects with 403 when the returned role is not one the route accepts', async () => {
        const contract = makeContract();
        const { adapter, results } = makeAdapter();
        await adapter.handle({
            routes: contract.routes,
            router: {
                items: {
                    listItems: okHandler,
                    getSecret: okHandler,
                    ownerOnly: okHandler,
                    adminOnly: okHandler,
                },
            },
            request: makeRequest('/admin-only', {
                'x-workspace-token': 'wst_owner',
            }),
            responseContext: {},
            guards: {
                member: () => ({
                    workspaceUserId: '1',
                    role: 'owner',
                }),
            } as GuardMap<Record<string, never>>,
            schemes: contract.securitySchemes,
        });
        expect(results[0]?.kind).toBe('guard-denied');
        expect((results[0] as { status: number }).status).toBe(403);
        expect((results[0] as { body: { detail: string } }).body.detail).toBe('Forbidden: this route requires the admin role.');
    });

    it('passes roles when one of the returned roles is accepted', async () => {
        const contract = makeContract();
        const { adapter, results } = makeAdapter();
        await adapter.handle({
            routes: contract.routes,
            router: {
                items: {
                    listItems: okHandler,
                    getSecret: okHandler,
                    ownerOnly: okHandler,
                    adminOnly: okHandler,
                },
            },
            request: makeRequest('/admin-only', {
                'x-workspace-token': 'wst_both',
            }),
            responseContext: {},
            guards: {
                member: () => ({
                    workspaceUserId: '3',
                    role: ['owner', 'admin'],
                }),
            } as GuardMap<Record<string, never>>,
            schemes: contract.securitySchemes,
        });
        expect(results[0]?.kind).toBe('success');
    });

    it('hands a handler behind roles from names the role alone', async () => {
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
            listDocs: routeDefinition('/docs', {
                identity: 'viewer',
                roles: 'editor',
            }),
        });
        const contract = plain.contract({
            routes: {
                docs,
            },
        });
        const { adapter, results } = makeAdapter();
        let received: unknown;
        await adapter.handle({
            routes: contract.routes,
            router: {
                docs: {
                    listDocs: (args: Record<string, unknown>) => {
                        received = (args.auth as Record<string, unknown>).viewer;
                        return okHandler();
                    },
                },
            },
            request: makeRequest('/docs', {
                authorization: 'Bearer tok',
            }),
            responseContext: {},
            guards: {
                viewer: () => ({
                    userId: '1',
                    role: 'editor',
                }),
            } as GuardMap<Record<string, never>>,
            schemes: contract.securitySchemes,
        });
        expect(results[0]?.kind).toBe('success');
        expect(received).toEqual({
            userId: '1',
            role: 'editor',
        });
    });

    it('surfaces a missing guard as a handler error', async () => {
        const contract = makeContract();
        const { adapter, results } = makeAdapter();
        await adapter.handle({
            routes: contract.routes,
            router: {
                items: {
                    listItems: okHandler,
                    getSecret: okHandler,
                    ownerOnly: okHandler,
                    adminOnly: okHandler,
                },
            },
            request: makeRequest('/secret'),
            responseContext: {},
            guards: {},
            schemes: contract.securitySchemes,
        });
        expect(results[0]?.kind).toBe('handler-error');
    });

    it('renders guard-denied as RFC 9457 problem details', () => {
        const rendered = renderJsonResult({
            kind: 'guard-denied',
            status: 401,
            body: {
                detail: 'Unauthorized',
            },
        });
        expect(rendered.status).toBe(401);
        expect(rendered.headers['content-type']).toBe('application/problem+json');
        expect(rendered.body).toMatchObject({
            status: 401,
            detail: 'Unauthorized',
        });
    });
});

describe('resolveSecurityRequirements', () => {
    it('expands names and scoped entries', () => {
        const route = {
            ...routeDefinition('/x', false),
            security: [
                'user',
                {
                    member: ['a', 'b'],
                },
            ],
        } as RouteDefinition;
        expect(resolveSecurityRequirements(route)).toEqual([
            {
                scheme: 'user',
                scopes: [],
            },
            {
                scheme: 'member',
                scopes: ['a', 'b'],
            },
        ]);
    });

    it('returns nothing for a public or unsecured route', () => {
        expect(resolveSecurityRequirements(routeDefinition('/x', false))).toEqual([]);
        expect(
            resolveSecurityRequirements({
                ...routeDefinition('/x', false),
                security: [],
            } as RouteDefinition)
        ).toEqual([]);
    });
});

describe('extractCredential', () => {
    const request = (headers: Record<string, string | string[]>, query: Record<string, unknown> = {}): AdapterRequest<null> => ({
        request: null,
        method: 'GET',
        resolution: {
            kind: 'core-match',
            path: '/x',
        },
        query,
        headers,
        readBody: () => undefined,
    });

    it('extracts a bearer token case-insensitively', () => {
        expect(extractCredential(user, request({ authorization: 'bearer abc' }))).toEqual({
            bearer: {
                token: 'abc',
            },
        });
    });

    it('yields null when the authorization header is absent or not bearer', () => {
        expect(extractCredential(user, request({}))).toEqual({
            bearer: null,
        });
        expect(extractCredential(user, request({ authorization: 'Basic abc' }))).toEqual({
            bearer: null,
        });
    });

    it('extracts an apiKey from its header', () => {
        expect(extractCredential(member, request({ 'x-workspace-token': 'wst_1' }))).toEqual({
            apiKey: {
                in: 'header',
                name: 'x-workspace-token',
                value: 'wst_1',
            },
        });
    });

    it('extracts an apiKey from a query parameter', () => {
        const queryKey = Kizuna.identity.apiKey({
            name: 'api_key',
            in: 'query',
            context: z.object({}),
        });
        expect(extractCredential(queryKey, request({}, { api_key: 'qk_1' }))).toEqual({
            apiKey: {
                in: 'query',
                name: 'api_key',
                value: 'qk_1',
            },
        });
    });

    it('extracts an apiKey from a cookie', () => {
        const cookieKey = Kizuna.identity.apiKey({
            name: 'session',
            in: 'cookie',
            context: z.object({}),
        });
        expect(extractCredential(cookieKey, request({ cookie: 'theme=dark; session=ck_1' }))).toEqual({
            apiKey: {
                in: 'cookie',
                name: 'session',
                value: 'ck_1',
            },
        });
    });

    it('decodes basic credentials and tolerates malformed input', () => {
        const admin = Kizuna.identity.basic({
            context: z.object({}),
        });
        const encoded = Buffer.from('ada:secret').toString('base64');
        expect(extractCredential(admin, request({ authorization: `Basic ${encoded}` }))).toEqual({
            basic: {
                username: 'ada',
                password: 'secret',
            },
        });
        expect(extractCredential(admin, request({ authorization: 'Basic %%%not-base64%%%' }))).toEqual({
            basic: null,
        });
    });

    it('labels oauth2 and openIdConnect tokens by their scheme kind', () => {
        const oauthUser = Kizuna.identity.oauth2({
            flows: {},
            context: z.object({}),
        });
        const oidcUser = Kizuna.identity.openIdConnect({
            openIdConnectUrl: 'https://example.com/.well-known/openid-configuration',
            context: z.object({}),
        });
        expect(extractCredential(oauthUser, request({ authorization: 'Bearer t' }))).toEqual({
            oauth2: {
                token: 't',
            },
        });
        expect(extractCredential(oidcUser, request({ authorization: 'Bearer t' }))).toEqual({
            openIdConnect: {
                token: 't',
            },
        });
    });
});

describe('guard params and several roles', () => {
    const withParams = k.contract({
        routes: {
            items: k.routes({
                getWorkspaceUser: {
                    method: 'GET',
                    path: '/workspaces/:workspaceId/users/:id',
                    auth: 'user',
                    responses: {
                        200: z.object({
                            ok: z.boolean(),
                        }),
                    },
                },
            }),
        },
    });

    it('passes the matched route params to the guard', async () => {
        const { adapter, results } = makeAdapter();
        let received: Record<string, string> | undefined;
        await adapter.handle({
            routes: withParams.routes,
            router: {
                items: {
                    getWorkspaceUser: okHandler,
                },
            },
            request: makeRequest('/workspaces/ws_1/users/42', {
                authorization: 'Bearer tok',
            }),
            responseContext: {},
            guards: {
                user: ({ params }) => {
                    received = params;
                    return {
                        userId: '1',
                    };
                },
            } as GuardMap<Record<string, never>>,
            schemes: withParams.securitySchemes,
        });
        expect(results[0]?.kind).toBe('success');
        expect(received).toEqual({
            workspaceId: 'ws_1',
            id: '42',
        });
    });

    const teamPermissions = Kizuna.permissions({
        user: ['export'],
        member: ['invite'],
    });

    const teamRoles = Kizuna.roles(teamPermissions, {
        inviter: {
            member: ['invite'],
        },
        exporter: {
            user: ['export'],
        },
    });

    const teamMember = Kizuna.identity.apiKey({
        name: 'x-workspace-token',
        in: 'header',
        context: z.object({
            workspaceUserId: z.string(),
        }),
        roles: teamRoles,
    });

    const teamK = new Kizuna({
        identities: {
            member: teamMember,
        },
    });

    const teamContract = teamK.contract({
        routes: {
            users: teamK.routes({
                exportUsers: {
                    method: 'GET',
                    path: '/users/export',
                    auth: {
                        identity: 'member',
                        requires: {
                            user: ['export'],
                        },
                    },
                    responses: {
                        200: z.object({
                            ok: z.boolean(),
                        }),
                    },
                },
            }),
        },
    });

    const teamRouter = {
        users: {
            exportUsers: okHandler,
        },
    };

    it('unions what several returned roles hold', async () => {
        const { adapter, results } = makeAdapter();
        await adapter.handle({
            routes: teamContract.routes,
            router: teamRouter,
            request: makeRequest('/users/export', {
                'x-workspace-token': 'tok',
            }),
            responseContext: {},
            guards: {
                member: () => ({
                    workspaceUserId: '1',
                    role: ['inviter', 'exporter'],
                }),
            } as GuardMap<Record<string, never>>,
            schemes: teamContract.securitySchemes,
        });
        expect(results[0]?.kind).toBe('success');
    });

    it('rejects when none of the returned roles holds the permission', async () => {
        const { adapter, results } = makeAdapter();
        await adapter.handle({
            routes: teamContract.routes,
            router: teamRouter,
            request: makeRequest('/users/export', {
                'x-workspace-token': 'tok',
            }),
            responseContext: {},
            guards: {
                member: () => ({
                    workspaceUserId: '1',
                    role: ['inviter'],
                }),
            } as GuardMap<Record<string, never>>,
            schemes: teamContract.securitySchemes,
        });
        expect(results[0]?.kind).toBe('guard-denied');
        expect((results[0] as { status: number }).status).toBe(403);
    });
});

describe('custom identity guard', () => {
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
                    responses: {
                        200: z.object({
                            ok: z.boolean(),
                        }),
                    },
                },
            }),
        },
    });

    it('extracts no credential for a custom identity', () => {
        expect(extractCredential(inviteToken, makeRequest('/invites/tok'))).toEqual({});
    });

    it('runs the guard with the path params and no credential key', async () => {
        const { adapter, results } = makeAdapter();
        let receivedKeys: string[] | undefined;
        let received: unknown;
        await adapter.handle({
            routes: inviteContract.routes,
            router: {
                invites: {
                    getInvite: (args: Record<string, unknown>) => {
                        received = (args.auth as Record<string, unknown>).inviteToken;
                        return okHandler();
                    },
                },
            },
            request: makeRequest('/invites/inv_1'),
            responseContext: {},
            guards: {
                inviteToken: (args: Record<string, unknown>) => {
                    receivedKeys = Object.keys(args);
                    return {
                        inviteId: `invite-for-${(args.params as Record<string, string>).token}`,
                    };
                },
            } as GuardMap<Record<string, never>>,
            schemes: inviteContract.securitySchemes,
        });
        expect(results[0]?.kind).toBe('success');
        // The guard receives exactly the framework args, with no credential key.
        expect(receivedKeys?.sort()).toEqual(['deny', 'params']);
        expect(received).toEqual({
            inviteId: 'invite-for-inv_1',
        });
    });

    it('denies 404 on an unknown token', async () => {
        const { adapter, results } = makeAdapter();
        await adapter.handle({
            routes: inviteContract.routes,
            router: {
                invites: {
                    getInvite: okHandler,
                },
            },
            request: makeRequest('/invites/nope'),
            responseContext: {},
            guards: {
                inviteToken: ({ deny }) =>
                    deny({
                        status: 404,
                        body: {
                            detail: 'Not found',
                        },
                    }),
            } as GuardMap<Record<string, never>>,
            schemes: inviteContract.securitySchemes,
        });
        expect(results[0]).toMatchObject({
            kind: 'guard-denied',
            status: 404,
            body: {
                detail: 'Not found',
            },
        });
    });
});

describe('permissions within a role', () => {
    const catalog = Kizuna.permissions({
        report: ['read', 'export'],
    });

    const analyst = Kizuna.identity.apiKey({
        name: 'x-token',
        in: 'header',
        context: z.object({
            userId: z.string(),
        }),
        roles: Kizuna.roles(catalog, {
            analyst: {
                report: ['read', 'export'],
            },
            viewer: {
                report: ['read'],
            },
        }),
    });

    const granted = new Kizuna({
        identities: {
            analyst,
        },
    });

    const reports = granted.routes({
        exportReport: routeDefinition('/reports/export', {
            identity: 'analyst',
            requires: {
                report: ['export'],
            },
        }),
    });

    const contract = granted.contract({
        routes: {
            reports,
        },
    });

    const run = async (returned: Record<string, unknown>) => {
        const { adapter, results } = makeAdapter();
        let received: unknown;
        await adapter.handle({
            routes: contract.routes,
            router: {
                reports: {
                    exportReport: (args: Record<string, unknown>) => {
                        received = (args.auth as Record<string, unknown>).analyst;
                        return okHandler();
                    },
                },
            },
            request: makeRequest('/reports/export', {
                'x-token': 'tok',
            }),
            responseContext: {},
            guards: {
                analyst: () => returned,
            } as GuardMap<Record<string, never>>,
            schemes: contract.securitySchemes,
        });
        return { result: results[0], received };
    };

    it('treats what the guard returns as what the caller holds', async () => {
        const denied = await run({
            userId: '1',
            role: 'analyst',
            permissions: ['report:read'],
        });
        expect(denied.result?.kind).toBe('guard-denied');
        expect((denied.result as { status: number }).status).toBe(403);

        const allowed = await run({
            userId: '1',
            role: 'analyst',
            permissions: ['report:export'],
        });
        expect(allowed.result?.kind).toBe('success');
        expect(allowed.received).toEqual({
            userId: '1',
            role: 'analyst',
            permissions: ['report:export'],
        });
    });

    it('hands the whole role to a guard that returns no list', async () => {
        const allowed = await run({
            userId: '1',
            role: 'analyst',
        });
        expect(allowed.result?.kind).toBe('success');
        expect(allowed.received).toEqual({
            userId: '1',
            role: 'analyst',
            permissions: ['report:read', 'report:export'],
        });
    });

    it('drops a permission the role cannot hold', async () => {
        const beyond = await run({
            userId: '1',
            role: 'viewer',
            permissions: ['report:read', 'report:export'],
        });
        expect(beyond.result?.kind).toBe('guard-denied');
        expect(beyond.received).toBeUndefined();
    });
});

describe('OAuth tokens', () => {
    const catalog = Kizuna.permissions({
        users: ['read', 'write'],
        report: ['read'],
    });

    const partner = Kizuna.identity.oauth2({
        flows: {
            clientCredentials: {
                tokenUrl: 'https://auth.example.com/token',
                scopes: {
                    'users:read': 'Read users',
                    'users:write': 'Write users',
                    'report:read': 'Read reports',
                },
            },
        },
        resourceMetadata: 'https://api.example.com/.well-known/oauth-protected-resource',
        context: z.object({
            clientId: z.string(),
        }),
        roles: Kizuna.roles(catalog, {
            integration: {
                users: ['read', 'write'],
            },
        }),
    });

    const oauth = new Kizuna({
        identities: {
            partner,
        },
    });

    const users = oauth.routes({
        createUser: routeDefinition('/users', {
            identity: 'partner',
            requires: {
                users: ['write'],
            },
        }),
        readReport: routeDefinition('/report', {
            identity: 'partner',
            requires: {
                report: ['read'],
            },
        }),
    });

    const contract = oauth.contract({
        routes: {
            users,
        },
    });

    const run = async (path: `/${string}`, tokenScopes: string[]) => {
        const { adapter, results } = makeAdapter();
        await adapter.handle({
            routes: contract.routes,
            router: {
                users: {
                    createUser: okHandler,
                    readReport: okHandler,
                },
            },
            request: makeRequest(path, {
                authorization: 'Bearer tok',
            }),
            responseContext: {},
            guards: {
                partner: () => ({
                    clientId: 'c1',
                    role: 'integration',
                    permissions: tokenScopes,
                }),
            } as GuardMap<Record<string, never>>,
            schemes: contract.securitySchemes,
        });
        return results[0] as { kind: string; status?: number; headers?: Record<string, string> };
    };

    it('writes what the route requires as the scopes of the security requirement', () => {
        expect(resolveSecurityRequirements(contract.routes.users.createUser as RouteDefinition)).toEqual([
            {
                scheme: 'partner',
                scopes: ['users:write'],
            },
        ]);
    });

    it('passes a token that carries the permission', async () => {
        const result = await run('/users', ['users:read', 'users:write']);
        expect(result.kind).toBe('success');
    });

    it('answers insufficient_scope when the role holds the permission and the token does not', async () => {
        const result = await run('/users', ['users:read']);
        expect(result.status).toBe(403);
        expect(result.headers?.['www-authenticate']).toBe(
            'Bearer error="insufficient_scope", scope="users:write", resource_metadata="https://api.example.com/.well-known/oauth-protected-resource"'
        );
    });

    it('points a missing token at the metadata document', async () => {
        const { adapter, results } = makeAdapter();
        await adapter.handle({
            routes: contract.routes,
            router: {
                users: {
                    createUser: okHandler,
                    readReport: okHandler,
                },
            },
            request: makeRequest('/users'),
            responseContext: {},
            guards: {
                partner: ({ deny }) =>
                    deny({
                        status: 401,
                        body: {
                            detail: 'Unauthorized',
                        },
                    }),
            } as GuardMap<Record<string, never>>,
            schemes: contract.securitySchemes,
        });
        const result = results[0] as { status: number; headers?: Record<string, string> };
        expect(result.status).toBe(401);
        expect(result.headers?.['www-authenticate']).toBe(
            'Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource"'
        );
    });

    it('answers a plain 403 when no token could help, since the role lacks the permission', async () => {
        const result = await run('/report', ['report:read']);
        expect(result.status).toBe(403);
        expect(result.headers?.['www-authenticate']).toBeUndefined();
    });
});
