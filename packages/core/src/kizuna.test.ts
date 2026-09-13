import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { RouteDefinition, Routes } from './types.js';
import { Kizuna } from './kizuna.js';
import { createPlugin } from './plugin.js';

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

const deleteRule = {
    auth: 'member',
    requires: {
        workspace: ['delete'],
    },
} as const;

const routeDefinition = (path: `/${string}`) => ({
    method: 'GET' as const,
    path,
    responses: {
        200: z.object({
            ok: z.boolean(),
        }),
    },
});

const makeRoutes = () => {
    const k = new Kizuna({
        identities: {
            user,
            member,
        },
    });
    return {
        k,
        users: k.routes({
            listUsers: routeDefinition('/users'),
            getUser: routeDefinition('/users/:id'),
        }),
        workspace: k.routes({
            getWorkspace: routeDefinition('/workspace'),
            deleteWorkspace: routeDefinition('/workspace/delete'),
        }),
    };
};

const routeOf = (routes: Routes, key: string): RouteDefinition => routes[key] as RouteDefinition;

const makeNestedRoutes = () => {
    const k = new Kizuna({
        identities: {
            user,
            member,
        },
    });
    return {
        k,
        members: k.routes({
            session: {
                login: routeDefinition('/auth/login'),
                refresh: routeDefinition('/auth/refresh'),
                me: routeDefinition('/auth/me'),
            },
            events: {
                list: routeDefinition('/events'),
                get: routeDefinition('/events/:eventId'),
            },
            invites: {
                list: routeDefinition('/invites'),
                get: routeDefinition('/invites/:inviteId'),
            },
        }),
    };
};

const nestedRouteOf = (routes: Routes, groupKey: string, routeKey: string): RouteDefinition =>
    routeOf(routes[groupKey] as Routes, routeKey);

describe('k.contract access resolution', () => {
    it('marks a group public with security: [] when the entry is false', () => {
        const { k, users, workspace } = makeRoutes();
        k.contract({
            routes: {
                users,
                workspace,
            },
            accessControl: {
                users: false,
                workspace: false,
            },
        });
        expect(routeOf(users, 'listUsers').security).toEqual([]);
        expect(routeOf(users, 'getUser').security).toEqual([]);
    });

    it('requires an identity across a group from a scheme name', () => {
        const { k, users, workspace } = makeRoutes();
        k.contract({
            routes: {
                users,
                workspace,
            },
            accessControl: {
                users: 'user',
                workspace: false,
            },
        });
        expect(routeOf(users, 'listUsers').security).toEqual(['user']);
        expect(routeOf(users, 'listUsers').requires).toBeUndefined();
    });

    it('resolves requires onto the route beside security', () => {
        const { k, users, workspace } = makeRoutes();
        k.contract({
            routes: {
                users,
                workspace,
            },
            accessControl: {
                users: false,
                workspace: deleteRule,
            },
        });
        expect(routeOf(workspace, 'getWorkspace').security).toEqual([
            {
                member: [],
            },
        ]);
        expect(routeOf(workspace, 'getWorkspace').requires).toEqual({
            workspace: ['delete'],
        });
    });

    it('rejects requires naming a permission no identity on the route declares', () => {
        const { k, users, workspace } = makeRoutes();
        expect(() =>
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
            })
        ).toThrow(/workspace:archive/);
    });

    it('rejects requires on an identity that declares no permissions', () => {
        const { k, users, workspace } = makeRoutes();
        expect(() =>
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
            })
        ).toThrow(/declares permissions/);
    });

    it('resolves roles onto the route beside security', () => {
        const { k, users, workspace } = makeRoutes();
        k.contract({
            routes: {
                users,
                workspace,
            },
            accessControl: {
                users: false,
                workspace: {
                    '*': {
                        auth: 'member',
                        roles: 'owner',
                    },
                    getWorkspace: {
                        auth: 'member',
                        roles: ['admin', 'owner'],
                    },
                },
            },
        });
        expect(routeOf(workspace, 'deleteWorkspace').roles).toEqual(['owner']);
        expect(routeOf(workspace, 'getWorkspace').roles).toEqual(['admin', 'owner']);
        expect(routeOf(workspace, 'getWorkspace').requires).toBeUndefined();
    });

    it('rejects roles naming a role no identity on the route declares', () => {
        const { k, users, workspace } = makeRoutes();
        expect(() =>
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
            })
        ).toThrow(/'viewer'/);
    });

    it('rejects roles on an identity that declares none', () => {
        const { k, users, workspace } = makeRoutes();
        expect(() =>
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
            })
        ).toThrow(/declares roles/);
    });

    it('rejects requires on roles declared without a catalog', () => {
        const viewer = Kizuna.identity.bearer({
            context: z.object({
                userId: z.string(),
            }),
            roles: Kizuna.roles(['viewer', 'editor']),
        });
        const k = new Kizuna({
            identities: {
                viewer,
            },
        });
        const docs = k.routes({
            listDocs: routeDefinition('/docs'),
        });
        k.contract({
            routes: {
                docs,
            },
            accessControl: {
                docs: {
                    auth: 'viewer',
                    roles: 'editor',
                },
            },
        });
        expect(routeOf(docs, 'listDocs').roles).toEqual(['editor']);
        expect(() =>
            // @ts-expect-error roles from names carry no permissions to require
            k.contract({
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
            })
        ).toThrow(/declares permissions/);
    });

    it('writes what an OAuth route requires as its scopes', () => {
        const partner = Kizuna.identity.oauth2({
            flows: {
                clientCredentials: {
                    tokenUrl: 'https://auth.example.com/token',
                    scopes: {
                        'workspace:read': 'Read the workspace',
                    },
                },
            },
            roles: Kizuna.roles(permissions, {
                integration: {
                    workspace: ['read'],
                },
            }),
        });
        const k = new Kizuna({
            identities: {
                partner,
                member,
            },
        });
        const workspace = k.routes({
            getWorkspace: routeDefinition('/workspace'),
        });
        k.contract({
            routes: {
                workspace,
            },
            accessControl: {
                workspace: {
                    auth: 'partner',
                    requires: {
                        workspace: ['read'],
                    },
                },
            },
        });
        expect(routeOf(workspace, 'getWorkspace').security).toEqual([
            {
                partner: ['workspace:read'],
            },
        ]);
        k.contract({
            routes: {
                workspace,
            },
            accessControl: {
                workspace: {
                    auth: 'member',
                    requires: {
                        workspace: ['read'],
                    },
                },
            },
        });
        expect(routeOf(workspace, 'getWorkspace').security).toEqual([
            {
                member: [],
            },
        ]);
    });

    it('cascades a * default with per-route overrides', () => {
        const { k, users, workspace } = makeRoutes();
        k.contract({
            routes: {
                users,
                workspace,
            },
            accessControl: {
                users: false,
                workspace: {
                    '*': 'member',
                    deleteWorkspace: deleteRule,
                },
            },
        });
        expect(routeOf(workspace, 'getWorkspace').security).toEqual(['member']);
        expect(routeOf(workspace, 'deleteWorkspace').security).toEqual([
            {
                member: [],
            },
        ]);
        expect(routeOf(workspace, 'deleteWorkspace').requires).toEqual({
            workspace: ['delete'],
        });
    });

    it('applies group auth to routes in nested groups', () => {
        const { k } = makeRoutes();
        const nested = k.routes({
            inner: {
                getThing: routeDefinition('/things/:id'),
            },
        });
        k.contract({
            routes: {
                nested,
            },
            accessControl: {
                nested: 'user',
            },
        });
        expect(routeOf(nested.inner as Routes, 'getThing').security).toEqual(['user']);
    });

    it('carries the identities and access control map on the contract', () => {
        const { k, users, workspace } = makeRoutes();
        const contract = k.contract({
            routes: {
                users,
                workspace,
            },
            accessControl: {
                users: false,
                workspace: 'member',
            },
        });
        expect(contract.securitySchemes).toEqual({
            user,
            member,
        });
        expect(contract.accessControl).toEqual({
            users: false,
            workspace: 'member',
        });
    });

    it('leaves routes untouched when no access control map is passed', () => {
        const k = new Kizuna();
        const routes = k.routes({
            listItems: routeDefinition('/items'),
        });
        const contract = k.contract({
            routes: {
                items: routes,
            },
        });
        expect(routeOf(routes, 'listItems').security).toBeUndefined();
        expect(contract.securitySchemes).toBeUndefined();
    });
});

describe('multi-identity access values', () => {
    it('resolves an auth array to one requirement over every identity', () => {
        const { k, users, workspace } = makeRoutes();
        k.contract({
            routes: {
                users,
                workspace,
            },
            accessControl: {
                users: false,
                workspace: {
                    auth: ['user', 'member'],
                    requires: {
                        workspace: ['delete'],
                    },
                },
            },
        });
        expect(routeOf(workspace, 'getWorkspace').security).toEqual([
            {
                user: [],
                member: [],
            },
        ]);
        expect(routeOf(workspace, 'getWorkspace').requires).toEqual({
            workspace: ['delete'],
        });
    });
});

describe('cascade overrides', () => {
    it('replaces the * default with the named entry', () => {
        const { k, users, workspace } = makeRoutes();
        k.contract({
            routes: {
                users,
                workspace,
            },
            accessControl: {
                users: false,
                workspace: {
                    '*': 'member',
                    deleteWorkspace: 'user',
                },
            },
        });
        expect(routeOf(workspace, 'getWorkspace').security).toEqual(['member']);
        expect(routeOf(workspace, 'deleteWorkspace').security).toEqual(['user']);
    });

    it('clears a stale requires when a routes tree is reused under a looser map', () => {
        const { k, users, workspace } = makeRoutes();
        k.contract({
            routes: {
                users,
                workspace,
            },
            accessControl: {
                users: false,
                workspace: deleteRule,
            },
        });
        k.contract({
            routes: {
                users,
                workspace,
            },
            accessControl: {
                users: false,
                workspace: 'member',
            },
        });
        expect(routeOf(workspace, 'deleteWorkspace').requires).toBeUndefined();
    });

    it('rejects a cascade key that matches no route or subgroup in the group', () => {
        const { k, users, workspace } = makeRoutes();
        expect(() =>
            // @ts-expect-error renameWorkspace is not a route in the group
            k.contract({
                routes: {
                    users,
                    workspace,
                },
                accessControl: {
                    users: false,
                    workspace: {
                        '*': 'member',
                        renameWorkspace: false,
                    },
                },
            })
        ).toThrow(/renameWorkspace/);
    });

    it('false opts a route out of the default', () => {
        const { k, users, workspace } = makeRoutes();
        k.contract({
            routes: {
                users,
                workspace,
            },
            accessControl: {
                users: false,
                workspace: {
                    '*': 'member',
                    getWorkspace: false,
                },
            },
        });
        expect(routeOf(workspace, 'getWorkspace').security).toEqual([]);
        expect(routeOf(workspace, 'deleteWorkspace').security).toEqual(['member']);
    });
});

describe('nested group access', () => {
    it('applies an access value on a subgroup key to that whole subtree', () => {
        const { k, members } = makeNestedRoutes();
        k.contract({
            routes: {
                members,
            },
            accessControl: {
                members: {
                    '*': 'user',
                    invites: false,
                },
            },
        });
        expect(nestedRouteOf(members, 'invites', 'list').security).toEqual([]);
        expect(nestedRouteOf(members, 'invites', 'get').security).toEqual([]);
        expect(nestedRouteOf(members, 'events', 'list').security).toEqual(['user']);
        expect(nestedRouteOf(members, 'session', 'login').security).toEqual(['user']);
    });

    it('recurses into a nested cascade on a subgroup key', () => {
        const { k, members } = makeNestedRoutes();
        k.contract({
            routes: {
                members,
            },
            accessControl: {
                members: {
                    '*': 'user',
                    session: {
                        '*': 'user',
                        login: false,
                        refresh: false,
                    },
                },
            },
        });
        expect(nestedRouteOf(members, 'session', 'login').security).toEqual([]);
        expect(nestedRouteOf(members, 'session', 'refresh').security).toEqual([]);
        expect(nestedRouteOf(members, 'session', 'me').security).toEqual(['user']);
        expect(nestedRouteOf(members, 'events', 'list').security).toEqual(['user']);
    });

    it("replaces the parent default with a nested cascade's *", () => {
        const { k, members } = makeNestedRoutes();
        k.contract({
            routes: {
                members,
            },
            accessControl: {
                members: {
                    '*': 'user',
                    events: {
                        '*': deleteRule,
                        list: false,
                    },
                },
            },
        });
        expect(nestedRouteOf(members, 'events', 'get').security).toEqual([
            {
                member: [],
            },
        ]);
        expect(nestedRouteOf(members, 'events', 'get').requires).toEqual({
            workspace: ['delete'],
        });
        expect(nestedRouteOf(members, 'events', 'list').security).toEqual([]);
    });

    it('applies an access value on a subgroup key across its subtree in place of the parent default', () => {
        const { k, members } = makeNestedRoutes();
        k.contract({
            routes: {
                members,
            },
            accessControl: {
                members: {
                    '*': 'user',
                    events: deleteRule,
                },
            },
        });
        expect(nestedRouteOf(members, 'events', 'list').security).toEqual([
            {
                member: [],
            },
        ]);
        expect(nestedRouteOf(members, 'events', 'list').requires).toEqual({
            workspace: ['delete'],
        });
    });

    it('does not match a cascade key against leaf routes in subgroups', () => {
        const { k, members } = makeNestedRoutes();
        expect(() =>
            // @ts-expect-error list is not a route or subgroup directly in members
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
            })
        ).toThrow(/list/);
        expect(nestedRouteOf(members, 'events', 'list').security).not.toEqual([]);
        expect(nestedRouteOf(members, 'invites', 'list').security).not.toEqual([]);
    });

    it('rejects a nested cascade on a route key', () => {
        const { k, members } = makeNestedRoutes();
        expect(() =>
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
            })
        ).toThrow(/login/);
    });
});

describe('k.contract: plugins', () => {
    const k = new Kizuna({
        tags: Kizuna.tags({
            api: 'API',
        }),
    });

    const routes = k.routes('api', {
        health: {
            method: 'GET',
            path: '/health',
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        },
    });

    const probePlugin = (props: { skip?: Record<string, boolean> } = {}) =>
        createPlugin({
            name: 'probe',
            serverModule: '@example/probe/server',
            routes: {
                status: {
                    method: 'GET',
                    path: '/probe/status',
                    responses: {
                        200: z.object({
                            skipped: z.array(z.string()),
                        }),
                    },
                },
            },
            props,
        });

    it('carries a plugin map onto the contract', () => {
        const contract = k.contract({
            routes,
            plugins: {
                probe: probePlugin(),
            },
        });

        expect(Object.keys(contract.plugins ?? {})).toEqual(['probe']);
    });

    it('calls a plugins function with the contract routes', () => {
        const seen: string[][] = [];

        const contract = k.contract({
            routes,
            plugins: ({ routes: given }) => {
                seen.push(Object.keys(given));
                return {
                    probe: probePlugin({
                        skip: {
                            health: true,
                        },
                    }),
                };
            },
        });

        expect(seen).toEqual([['health']]);
        expect(contract.plugins?.['probe']?.props).toEqual({
            skip: {
                health: true,
            },
        });
    });

    it('checks a plugin route against the contract routes', () => {
        expect(() =>
            k.contract({
                routes: k.routes('api', {
                    status: {
                        method: 'GET',
                        path: '/probe/status',
                        responses: {
                            200: z.object({
                                ok: z.boolean(),
                            }),
                        },
                    },
                }),
                plugins: {
                    probe: probePlugin(),
                },
            })
        ).toThrow(/probe\/status/);
    });
});
