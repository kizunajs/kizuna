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

const scopedRule = {
    auth: 'member',
    scopes: ['workspace:delete'],
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
    });

    it('resolves scopes into the requirement', () => {
        const { k, users, workspace } = makeRoutes();
        k.contract({
            routes: {
                users,
                workspace,
            },
            accessControl: {
                users: false,
                workspace: {
                    auth: 'user',
                    scopes: ['read:workspace'],
                },
            },
        });
        expect(routeOf(workspace, 'getWorkspace').security).toEqual([
            {
                user: ['read:workspace'],
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
                    deleteWorkspace: scopedRule,
                },
            },
        });
        expect(routeOf(workspace, 'getWorkspace').security).toEqual(['member']);
        expect(routeOf(workspace, 'deleteWorkspace').security).toEqual([
            {
                member: ['workspace:delete'],
            },
        ]);
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
                    scopes: ['workspace:delete'],
                },
            },
        });
        expect(routeOf(workspace, 'getWorkspace').security).toEqual([
            {
                user: ['workspace:delete'],
                member: ['workspace:delete'],
            },
        ]);
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

    it('clears stale scopes when a routes tree is reused under a looser map', () => {
        const { k, users, workspace } = makeRoutes();
        k.contract({
            routes: {
                users,
                workspace,
            },
            accessControl: {
                users: false,
                workspace: scopedRule,
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
        expect(routeOf(workspace, 'deleteWorkspace').security).toEqual(['member']);
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
                        '*': scopedRule,
                        list: false,
                    },
                },
            },
        });
        expect(nestedRouteOf(members, 'events', 'get').security).toEqual([
            {
                member: ['workspace:delete'],
            },
        ]);
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
                    events: scopedRule,
                },
            },
        });
        expect(nestedRouteOf(members, 'events', 'list').security).toEqual([
            {
                member: ['workspace:delete'],
            },
        ]);
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
