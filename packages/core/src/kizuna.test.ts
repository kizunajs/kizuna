import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { RouteDefinition } from './types.js';
import { Kizuna, type RouteAuthValue } from './kizuna.js';
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

const identities = {
    user,
    member,
};

type Auth = RouteAuthValue<'user' | 'member', typeof identities>;

const routeDefinition = (auth: Auth, path: `/${string}` = '/workspace') => ({
    method: 'GET' as const,
    path,
    auth,
    responses: {
        200: z.object({
            ok: z.boolean(),
        }),
    },
});

/**
 * Resolves one route's `auth` and hands back the route `k.contract` wrote to.
 */
const resolve = (auth: Auth): RouteDefinition => {
    const k = new Kizuna({
        identities,
    });
    const route = routeDefinition(auth);
    k.contract({
        routes: k.routes({
            workspace: {
                getWorkspace: route,
            },
        }),
    });
    return route as RouteDefinition;
};

describe('a route resolving its auth', () => {
    it('is public with security: [] when auth is false', () => {
        expect(resolve(false).security).toEqual([]);
    });

    it('requires the identity an auth names', () => {
        const route = resolve('user');

        expect(route.security).toEqual(['user']);
        expect(route.requires).toBeUndefined();
    });

    it('resolves requires onto the route beside security', () => {
        const route = resolve({
            identity: 'member',
            requires: {
                workspace: ['delete'],
            },
        });

        expect(route.security).toEqual([
            {
                member: [],
            },
        ]);
        expect(route.requires).toEqual({
            workspace: ['delete'],
        });
    });

    it('resolves roles onto the route beside security', () => {
        expect(
            resolve({
                identity: 'member',
                roles: 'owner',
            }).roles
        ).toEqual(['owner']);

        const several = resolve({
            identity: 'member',
            roles: ['admin', 'owner'],
        });

        expect(several.roles).toEqual(['admin', 'owner']);
        expect(several.requires).toBeUndefined();
    });

    it('resolves an identity array to one requirement over every identity', () => {
        expect(resolve(['user', 'member']).security).toEqual([
            {
                user: [],
                member: [],
            },
        ]);
    });

    it('resolves the same route again without keeping what the last one set', () => {
        const k = new Kizuna({
            identities,
        });
        const route = routeDefinition({
            identity: 'member',
            requires: {
                workspace: ['delete'],
            },
        });
        const routes = k.routes({
            workspace: {
                getWorkspace: route,
            },
        });
        k.contract({
            routes,
        });

        route.auth = 'member';
        k.contract({
            routes,
        });

        expect((route as RouteDefinition).requires).toBeUndefined();
        expect((route as RouteDefinition).roles).toBeUndefined();
    });
});

describe('an auth the identities do not support', () => {
    it('rejects requires naming a permission no identity on the route declares', () => {
        expect(() =>
            // @ts-expect-error archive is not a workspace permission
            resolve({
                identity: 'member',
                requires: {
                    workspace: ['archive'],
                },
            })
        ).toThrow(/workspace:archive/);
    });

    it('rejects requires on an identity that declares no permissions', () => {
        expect(() =>
            // @ts-expect-error user declares no roles
            resolve({
                identity: 'user',
                requires: {
                    workspace: ['read'],
                },
            })
        ).toThrow(/declares permissions/);
    });

    it('rejects roles naming a role no identity on the route declares', () => {
        expect(() =>
            // @ts-expect-error viewer is not a member role
            resolve({
                identity: 'member',
                roles: 'viewer',
            })
        ).toThrow(/viewer/);
    });

    it('rejects roles on an identity that declares none', () => {
        expect(() =>
            // @ts-expect-error user declares no roles
            resolve({
                identity: 'user',
                roles: 'owner',
            })
        ).toThrow(/declares roles/);
    });

    it('rejects an empty identity list', () => {
        expect(() =>
            resolve({
                identity: [],
            })
        ).toThrow(/names no identity/);
    });
});

describe('a route that declares no auth', () => {
    it('is refused when the instance declares an identity', () => {
        const k = new Kizuna({
            identities,
        });

        expect(() =>
            k.contract({
                routes: k.routes({
                    workspace: {
                        // @ts-expect-error every route needs an auth once an identity exists
                        getWorkspace: {
                            method: 'GET',
                            path: '/workspace',
                            responses: {
                                200: z.object({
                                    ok: z.boolean(),
                                }),
                            },
                        },
                    },
                }),
            })
        ).toThrow(/declares no `auth`/);
    });

    it('is public when the instance declares none', () => {
        const k = new Kizuna();
        const route = {
            method: 'GET' as const,
            path: '/health' as const,
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        };

        k.contract({
            routes: k.routes({
                health: {
                    live: route,
                },
            }),
        });

        expect((route as RouteDefinition).security).toEqual([]);
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
