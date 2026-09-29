import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { RouteDefinition } from './types.js';
import { Kizuna, type RouteAuthValue } from './kizuna.js';
import { defineConfig } from './define-config.js';
import { definePlugin, route } from './plugin.js';
import { pluginExportsOf, pluginRoutesOf } from './plugin-server.js';

interface Config {
    auth: {
        identities: {
            user: typeof user;
            member: typeof member;
        };
    };
}

const k = new Kizuna<Config>();

const user = k.identity.bearer({
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

const member = k.identity.apiKey({
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
    const config = {
        auth: {
            identities,
        },
    };
    const k = new Kizuna<{
        auth: { identities: typeof identities };
    }>();
    const route = routeDefinition(auth);
    defineConfig({
        ...config,
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
        const k2Config = {
            auth: {
                identities,
            },
        };
        const k2 = new Kizuna<{
            auth: { identities: typeof identities };
        }>();
        const route = routeDefinition({
            identity: 'member',
            requires: {
                workspace: ['delete'],
            },
        });
        const routes = k2.routes({
            workspace: {
                getWorkspace: route,
            },
        });
        defineConfig({
            ...k2Config,
            routes,
        });

        route.auth = 'member';
        defineConfig({
            ...k2Config,
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
        const k3Config = {
            auth: {
                identities,
            },
        };
        const k3 = new Kizuna<{
            auth: { identities: typeof identities };
        }>();

        expect(
            () =>
                defineConfig({
                    ...k3Config,
                    routes: k3.routes({
                        workspace: {
                            // @ts-expect-error every route needs an auth once an identity exists
                            getWorkspace: k3.route({
                                method: 'GET',
                                path: '/workspace',
                                responses: {
                                    200: z.object({
                                        ok: z.boolean(),
                                    }),
                                },
                            }),
                        },
                    }),
                }).api
        ).toThrow(/declares no `auth`/);
    });

    it('is public when the instance declares none', () => {
        const k4 = new Kizuna();
        const route = {
            method: 'GET' as const,
            path: '/health' as const,
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        };

        defineConfig({
            routes: k4.routes({
                health: {
                    live: route,
                },
            }),
        });

        expect((route as RouteDefinition).security).toEqual([]);
    });
});

describe('k.contract: plugins', () => {
    const k5Tags = k.tags({
        api: 'API',
    });
    const k5Config = {
        tags: k5Tags,
    };
    const k5 = new Kizuna<{
        tags: typeof k5Tags;
    }>();

    const routes = k5.routes('api', {
        health: k5.route({
            method: 'GET',
            path: '/health',
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        }),
    });

    const probePlugin = definePlugin({
        slug: 'probe',
        options: z.object({
            skip: z.record(z.string(), z.boolean()).default({}),
        }),
        setup: ({ options }) => ({
            routes: {
                status: route({
                    method: 'GET',
                    path: '/probe/status',
                    responses: {
                        200: z.object({
                            skipped: z.array(z.string()),
                        }),
                    },
                }).handler(() => ({
                    status: 200,
                    body: {
                        skipped: Object.keys(options.skip),
                    },
                })),
            },
        }),
    });

    it('carries every plugin onto the contract, keyed by its own name', () => {
        const contract = defineConfig({
            ...k5Config,
            routes,
            plugins: [probePlugin()],
        }).api;

        expect(Object.keys(contract.plugins ?? {})).toEqual(['probe']);
    });

    it('checks a plugin route against the contract routes', () => {
        expect(
            () =>
                defineConfig({
                    ...k5Config,
                    routes: k5.routes('api', {
                        status: k5.route({
                            method: 'GET',
                            path: '/probe/status',
                            responses: {
                                200: z.object({
                                    ok: z.boolean(),
                                }),
                            },
                        }),
                    }),
                    plugins: [probePlugin()],
                }).api
        ).toThrow(/probe\/status/);
    });

    const emailPlugin = definePlugin({
        slug: 'email',
        options: z.object({
            apiKey: z.string(),
            from: z.string(),
        }),
        setup: ({ options }) => ({
            exports: {
                sender: () => options.from,
            },
        }),
    });

    it('validates the options once, naming the plugin and the field', () => {
        expect(() =>
            defineConfig({
                ...k5Config,
                routes,
                plugins: [
                    emailPlugin({
                        from: 'hello@example.com',
                    } as never),
                ],
            })
        ).toThrow("[kizuna] Plugin 'email' has invalid options: apiKey is required");
    });

    it('hands the validated options to setup, and its exports to handlers', () => {
        const { api } = defineConfig({
            ...k5Config,
            routes,
            plugins: [
                emailPlugin({
                    apiKey: 'key',
                    from: 'hello@example.com',
                }),
            ],
        });

        const exported = pluginExportsOf(api) as {
            email: {
                sender: () => string;
            };
        };
        expect(exported.email.sender()).toBe('hello@example.com');
    });

    it('installs a plugin under the slug the app gives it', () => {
        const { api } = defineConfig({
            ...k5Config,
            routes,
            plugins: [
                emailPlugin({
                    slug: 'mail',
                    apiKey: 'key',
                    from: 'hello@example.com',
                }),
            ],
        });

        expect(Object.keys(pluginExportsOf(api))).toEqual(['mail']);
    });

    it('throws when two plugins share a slug, naming both', () => {
        const otherEmail = definePlugin({
            slug: 'email',
            setup: () => ({}),
        });

        expect(() =>
            defineConfig({
                ...k5Config,
                routes,
                plugins: [
                    emailPlugin({
                        apiKey: 'key',
                        from: 'hello@example.com',
                    }),
                    otherEmail(),
                ],
            })
        ).toThrow(/Two plugins are installed under the slug 'email'/);
    });

    it('runs setup once, and shares what it creates', () => {
        let setups = 0;
        const counter = definePlugin({
            slug: 'counter',
            setup: () => {
                setups += 1;
                const state = {
                    count: 0,
                };

                return {
                    routes: {
                        increment: route({
                            method: 'POST',
                            path: '/counter',
                            responses: {
                                200: z.object({
                                    count: z.number(),
                                }),
                            },
                        }).handler(() => {
                            state.count += 1;

                            return {
                                status: 200,
                                body: {
                                    count: state.count,
                                },
                            };
                        }),
                    },
                    exports: {
                        count: () => state.count,
                    },
                };
            },
        });

        const { api } = defineConfig({
            ...k5Config,
            routes,
            plugins: [counter()],
        });

        expect(setups).toBe(1);
        expect(Object.keys(pluginRoutesOf(api))).toEqual(['counter']);
    });

    it('throws when setup reads the api before it has assembled', () => {
        const eager = definePlugin({
            slug: 'eager',
            setup: ({ api }) => ({
                exports: {
                    routeCount: Object.keys(api.routes).length,
                },
            }),
        });

        expect(() =>
            defineConfig({
                ...k5Config,
                routes,
                plugins: [eager()],
            })
        ).toThrow(/read the api during `setup`/);
    });

    it('reads the api inside a handler, once it has assembled', () => {
        const reader = definePlugin({
            slug: 'reader',
            setup: ({ api }) => ({
                exports: {
                    routeKeys: () => Object.keys(api.routes),
                },
            }),
        });

        const { api } = defineConfig({
            ...k5Config,
            routes,
            plugins: [reader()],
        });

        const exported = pluginExportsOf(api) as {
            reader: {
                routeKeys: () => string[];
            };
        };
        expect(exported.reader.routeKeys()).toEqual(['health']);
    });

    it('throws when a plugin route has no handler', () => {
        const unanswered = definePlugin({
            slug: 'unanswered',
            setup: () => ({
                routes: {
                    status: {
                        method: 'GET',
                        path: '/unanswered',
                        responses: {
                            200: z.object({
                                ok: z.boolean(),
                            }),
                        },
                    },
                },
            }),
        });

        expect(() =>
            defineConfig({
                ...k5Config,
                routes,
                plugins: [unanswered()],
            })
        ).toThrow(/declares the route 'status' without a handler/);
    });

    it('resolves auth on a plugin route against the app identities', () => {
        const guarded = definePlugin({
            slug: 'guarded',
            setup: () => ({
                routes: {
                    status: route({
                        method: 'GET',
                        path: '/guarded',
                        auth: 'user',
                        responses: {
                            200: z.object({
                                ok: z.boolean(),
                            }),
                        },
                    }).handler(() => ({
                        status: 200,
                        body: {
                            ok: true,
                        },
                    })),
                },
            }),
        });

        const { api } = defineConfig({
            routes: {},
            auth: {
                identities: {
                    user,
                    member,
                },
            },
            plugins: [guarded()],
        });

        const pluginRoute = (pluginRoutesOf(api) as Record<string, Record<string, RouteDefinition> | undefined>).guarded?.status;
        expect(pluginRoute?.security).toEqual(['user']);
    });
});

describe('rawBody', () => {
    const rawTags = k.tags({
        api: 'API',
    });
    const rawK = new Kizuna<{
        tags: typeof rawTags;
    }>();

    it('throws when a multipart route declares rawBody', () => {
        expect(() =>
            defineConfig({
                tags: rawTags,
                routes: rawK.routes('api', {
                    uploadAvatar: rawK.route({
                        method: 'POST',
                        path: '/avatar',
                        rawBody: true,
                        contentType: 'multipart/form-data',
                        body: z.object({
                            name: z.string(),
                        }),
                        responses: {
                            204: z.void(),
                        },
                    }),
                }),
            })
        ).toThrow(/Route 'uploadAvatar' declares `rawBody` on a `multipart\/form-data` body/);
    });
});

describe('hidden routes', () => {
    const hiddenTags = k.tags({
        api: 'API',
    });
    const hiddenK = new Kizuna<{
        tags: typeof hiddenTags;
    }>();

    it('throws when a hidden route declares tool', () => {
        expect(() =>
            defineConfig({
                tags: hiddenTags,
                routes: hiddenK.routes('api', {
                    health: hiddenK.route({
                        method: 'GET',
                        path: '/health',
                        summary: 'Check the service',
                        hidden: true,
                        tool: true,
                        responses: {
                            200: z.object({
                                ok: z.boolean(),
                            }),
                        },
                    } as never),
                }),
            })
        ).toThrow(/Route 'health' is `hidden` and declares `tool`/);
    });

    it('hides every plugin route', () => {
        const status = definePlugin({
            slug: 'status',
            setup: () => ({
                routes: {
                    check: route({
                        method: 'GET',
                        path: '/status',
                        auth: false,
                        responses: {
                            200: z.object({
                                ok: z.boolean(),
                            }),
                        },
                    }).handler(() => ({
                        status: 200,
                        body: {
                            ok: true,
                        },
                    })),
                },
            }),
        });

        const { api } = defineConfig({
            tags: hiddenTags,
            routes: {},
            plugins: [status()],
        });

        const pluginRoute = (pluginRoutesOf(api) as Record<string, Record<string, RouteDefinition> | undefined>).status?.check;
        expect(pluginRoute?.hidden).toBe(true);
    });

    it('throws when a plugin route declares tool', () => {
        const status = definePlugin({
            slug: 'status',
            setup: () => ({
                routes: {
                    check: route({
                        method: 'GET',
                        path: '/status',
                        auth: false,
                        summary: 'Check the service',
                        tool: true,
                        responses: {
                            200: z.object({
                                ok: z.boolean(),
                            }),
                        },
                    }).handler(() => ({
                        status: 200,
                        body: {
                            ok: true,
                        },
                    })),
                },
            }),
        });

        expect(() =>
            defineConfig({
                tags: hiddenTags,
                routes: {},
                plugins: [status()],
            })
        ).toThrow(/Plugin route 'status.check' declares `tool`/);
    });
});
