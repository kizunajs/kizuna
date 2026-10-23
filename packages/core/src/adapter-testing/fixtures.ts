import { z } from 'zod';
import { ProblemDetailsSchema } from '../error-response.js';
import { Kizuna } from '../kizuna.js';
import { defineConfig } from '../define-config.js';
import { rawResponse } from '../adapter.js';
import { definePlugin, route } from '../plugin.js';

interface Config {
    groups: typeof kGroups;
}

interface SecuredKConfig {
    auth: {
        identities: {
            user: typeof userIdentity;
            member: typeof memberIdentity;
            invite: typeof inviteIdentity;
            staff: typeof staffIdentity;
        };
    };
}

interface PluginKConfig {
    groups: typeof pluginKGroups;
}

const k = new Kizuna<Config>();
const securedK = new Kizuna<SecuredKConfig>();
const pluginK = new Kizuna<PluginKConfig>();

const kGroups = k.groups({
    api: 'API',
});
const config = {
    groups: kGroups,
};

export interface User {
    id: string;
    name: string;
    email: string;
}

/**
 * The user CRUD group the express, hono, fastify and next suites each defined by hand.
 *
 * Module level rather than a factory so `k.routes` infers `method` and `path` as literals; a factory returning an object
 * literal widens both to `string` and weakens `PathParamsCheck`.
 */
const users = new Map<string, User>();
let nextUserId = 1;

/**
 * Empties the user store, so each test starts from nothing.
 */
export const resetUsers = (): void => {
    users.clear();
    nextUserId = 1;
};

export const userRoutes = k.routes({
    getUser: k
        .route({
            method: 'GET',
            path: '/users/:id',
            responses: {
                200: z.object({
                    id: z.string(),
                    name: z.string(),
                }),
                404: ProblemDetailsSchema,
            },
        })
        .handler(({ params }) => {
            const user = users.get(params.id);
            if (!user) {
                return {
                    status: 404,
                    body: {
                        detail: 'Not found',
                    },
                };
            }
            return {
                status: 200,
                body: {
                    id: user.id,
                    name: user.name,
                },
            };
        }),
    createUser: k
        .route({
            method: 'POST',
            path: '/users',
            body: z.object({
                name: z.string().min(1),
                email: z.email(),
            }),
            responses: {
                201: z.object({
                    id: z.string(),
                    name: z.string(),
                    email: z.string(),
                }),
            },
        })
        .handler(({ body }) => {
            const id = String(nextUserId++);
            const user: User = {
                id,
                name: body.name,
                email: body.email,
            };
            users.set(id, user);
            return {
                status: 201,
                body: user,
            };
        }),
    listUsers: k
        .route({
            method: 'GET',
            path: '/users',
            query: z.object({
                page: z.number().int().min(1).default(1),
                limit: z.number().int().min(1).default(10),
                ids: z.array(z.string()).optional(),
            }),
            responses: {
                200: z.object({
                    users: z.array(
                        z.object({
                            id: z.string(),
                            name: z.string(),
                        })
                    ),
                    total: z.number(),
                }),
            },
        })
        .handler(({ query }) => {
            const all = Array.from(users.values()).filter((user) => !query.ids || query.ids.includes(user.id));
            const start = (query.page - 1) * query.limit;
            return {
                status: 200,
                body: {
                    users: all.slice(start, start + query.limit).map((user) => ({
                        id: user.id,
                        name: user.name,
                    })),
                    total: all.length,
                },
            };
        }),
    deleteUser: k
        .route({
            method: 'DELETE',
            path: '/users/:id',
            responses: {
                200: z.object({
                    success: z.boolean(),
                }),
                404: ProblemDetailsSchema,
            },
        })
        .handler(({ params }) => {
            if (!users.has(params.id)) {
                return {
                    status: 404,
                    body: {
                        detail: 'Not found',
                    },
                };
            }
            users.delete(params.id);
            return {
                status: 200,
                body: {
                    success: true,
                },
            };
        }),
});

export type UserRoutes = typeof userRoutes;

export const userInput = {
    ...config,
    routes: [userRoutes],
};

export const userContract = defineConfig(userInput).api;

/**
 * A route whose handler returns a body the api does not allow, for `responses.validation`.
 */
export const brokenRoutes = k.routes({
    getBroken: k
        .route({
            method: 'GET',
            path: '/broken',
            responses: {
                200: z.object({
                    id: z.string(),
                }),
            },
        })
        .handler(() => ({
            status: 200,
            body: {
                id: 42 as unknown as string,
            },
        })),
});

export const brokenInput = {
    ...config,
    routes: [brokenRoutes],
};

export const brokenContract = defineConfig(brokenInput).api;

export const sessionToken = 'tok_ada';

/**
 * The `Authorization` value the guard features send. Every adapter matches on this, so it is written once here rather
 * than hardcoded per adapter.
 */
export const sessionAuthorization = `Bearer ${sessionToken}`;

export const userIdentity = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
    })
    .guard(({ bearer, deny }) => {
        if (bearer?.token !== sessionToken)
            return deny({
                status: 401,
                body: {
                    detail: 'Unauthorized',
                },
            });
        return {
            userId: '1',
        };
    });

export const workspacePermissions = Kizuna.permissions({
    workspace: ['read', 'delete'],
});

export const workspaceRoles = Kizuna.roles(workspacePermissions, {
    admin: {
        workspace: ['read'],
    },
    owner: 'all',
});

export const memberIdentity = k.identity
    .apiKey({
        name: 'x-workspace-token',
        in: 'header',
        context: z.object({
            workspaceUserId: z.string(),
        }),
        roles: workspaceRoles,
    })
    .guard(({ apiKey, deny }) => {
        const membership = apiKey ? memberships.get(apiKey.value) : undefined;
        if (!membership)
            return deny({
                status: 403,
                body: {
                    detail: 'Forbidden',
                },
            });
        return membership;
    });

export const ownerToken = 'wst_owner';
export const adminToken = 'wst_admin';

const memberships = new Map<string, { workspaceUserId: string; role: 'owner' | 'admin' }>([
    [ownerToken, { workspaceUserId: '1', role: 'owner' }],
    [adminToken, { workspaceUserId: '2', role: 'admin' }],
]);

/**
 * A capability link whose code travels in the path, read by the guard as the number its `params` declare.
 */
export const inviteIdentity = k.identity
    .custom({
        params: z.object({
            code: z.int().positive(),
        }),
        context: z.object({
            inviteCode: z.int(),
        }),
    })
    .guard(({ params }) => ({
        inviteCode: params.code,
    }));

export const staffToken = 'tok_staff';

/**
 * A guard that calls `deny` without returning it.
 */
export const staffIdentity = k.identity
    .bearer({
        context: z.object({
            staffId: z.string(),
        }),
    })
    .guard(({ bearer, deny }) => {
        if (bearer?.token !== staffToken) {
            deny({
                status: 401,
                body: {
                    detail: 'Staff only',
                },
            });
        }
        return {
            staffId: '1',
        };
    });

const securedKConfig = {
    auth: {
        identities: {
            user: userIdentity,
            member: memberIdentity,
            invite: inviteIdentity,
            staff: staffIdentity,
        },
    },
};

export const securedTools = securedK.routes({
    readProfile: securedK
        .route({
            method: 'GET',
            path: '/profile',
            auth: 'user',
            responses: {
                200: z.object({
                    userId: z.string(),
                }),
            },
            summary: 'Read the signed-in user',
            tool: true,
        })
        .handler(({ auth }) => ({
            status: 200,
            body: {
                userId: auth.user.userId,
            },
        })),
});

/**
 * Tools a stream names that `routes` does not list.
 */
export const draftTools = securedK.routes({
    readDrafts: securedK
        .route({
            method: 'GET',
            path: '/drafts',
            auth: 'user',
            responses: {
                200: z.object({
                    drafts: z.int(),
                }),
            },
            summary: 'Count the signed-in user drafts',
            tool: true,
        })
        .handler(() => ({
            status: 200,
            body: {
                drafts: 2,
            },
        })),
});

export const securedRoutes = securedK.routes({
    tools: securedTools,
    draftsReply: securedK
        .route({
            method: 'GET',
            path: '/drafts-reply',
            auth: false,
            responses: {
                200: {
                    stream: {
                        done: z.object({
                            ok: z.boolean(),
                        }),
                    },
                    tools: draftTools,
                },
            },
        })
        .handler(({ tools }) => ({
            status: 200,
            body: async function* () {
                const result = yield* tools.run({
                    id: 'call_1',
                    name: 'read_drafts',
                });
                yield {
                    event: 'done',
                    data: {
                        ok: result.state === 'done',
                    },
                };
            },
        })),
    acceptInvite: securedK
        .route({
            method: 'GET',
            path: '/invites/:code',
            auth: 'invite',
            responses: {
                200: z.object({
                    inviteCode: z.int(),
                }),
            },
        })
        .handler(({ auth }) => ({
            status: 200,
            body: {
                inviteCode: auth.invite.inviteCode,
            },
        })),
    staffOnly: securedK
        .route({
            method: 'GET',
            path: '/staff',
            auth: 'staff',
            responses: {
                200: z.object({
                    staffId: z.string(),
                }),
            },
        })
        .handler(({ auth }) => ({
            status: 200,
            body: {
                staffId: auth.staff.staffId,
            },
        })),
    profileReply: securedK
        .route({
            method: 'GET',
            path: '/profile-reply',
            auth: false,
            responses: {
                200: {
                    stream: {
                        done: z.object({
                            ok: z.boolean(),
                        }),
                    },
                    tools: securedTools,
                },
            },
        })
        .handler(({ tools }) => ({
            status: 200,
            body: async function* () {
                const result = yield* tools.run({
                    id: 'call_1',
                    name: 'read_profile',
                });
                yield {
                    event: 'done',
                    data: {
                        ok: result.state === 'done',
                    },
                };
            },
        })),
    publicRoute: securedK
        .route({
            method: 'GET',
            path: '/public',
            auth: false,
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        })
        .handler(() => ({
            status: 200,
            body: {
                ok: true,
            },
        })),
    whoAmI: securedK
        .route({
            method: 'GET',
            path: '/who-am-i',
            auth: 'user',
            responses: {
                200: z.object({
                    userId: z.string(),
                }),
            },
        })
        .handler(({ auth }) => ({
            status: 200,
            body: {
                userId: auth.user.userId,
            },
        })),
    ownerOnly: securedK
        .route({
            method: 'GET',
            path: '/owner-only',
            auth: {
                identity: 'member',
                requires: {
                    workspace: ['delete'],
                },
            },
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        })
        .handler(() => ({
            status: 200,
            body: {
                ok: true,
            },
        })),
    adminOnly: securedK
        .route({
            method: 'GET',
            path: '/admin-only',
            auth: {
                identity: 'member',
                roles: 'admin',
            },
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        })
        .handler(() => ({
            status: 200,
            body: {
                ok: true,
            },
        })),
    both: securedK
        .route({
            method: 'GET',
            path: '/both',
            auth: ['user', 'member'],
            responses: {
                200: z.object({
                    userId: z.string(),
                    workspaceUserId: z.string(),
                }),
            },
        })
        .handler(({ auth }) => ({
            status: 200,
            body: {
                userId: auth.user.userId,
                workspaceUserId: auth.member.workspaceUserId,
            },
        })),
});

export const securedInput = {
    ...securedKConfig,
    routes: [{ api: securedRoutes }],
};

export const securedContract = defineConfig(securedInput).api;

/**
 * A one-route group at a distinct path, for the sub-router composition tests each adapter repeated.
 */
export const subUserRoutes = k.routes({
    getUser: k
        .route({
            method: 'GET',
            path: '/sub-users/:id',
            responses: {
                200: z.object({
                    id: z.string(),
                }),
            },
        })
        .handler(({ params }) => ({
            status: 200,
            body: {
                id: params.id,
            },
        })),
});

export const subUserInput = {
    ...config,
    routes: [{ users: subUserRoutes }],
};

export const subUserContract = defineConfig(subUserInput).api;

/**
 * Constraints covering each Zod issue code the kernel serializes, so every adapter proves it surfaces them.
 */
export const issueRoutes = k.routes({
    createProfile: k
        .route({
            method: 'POST',
            path: '/profiles',
            body: z
                .object({
                    name: z.string().min(1),
                    age: z.number().max(120),
                    tags: z.array(z.string()).max(2),
                    slug: z.string().refine((value) => !value.includes(' '), 'no spaces'),
                    nickname: z.string().optional(),
                })
                .refine((value) => value.name !== value.slug, 'name and slug must differ'),
            responses: {
                201: z.object({
                    id: z.string(),
                }),
            },
        })
        .handler(() => ({
            status: 201,
            body: {
                id: '1',
            },
        })),
});

export const issueInput = {
    ...config,
    routes: [issueRoutes],
};

export const issueContract = defineConfig(issueInput).api;

/**
 * Routes declaring non-JSON and empty response bodies.
 */
export const csvBody = 'id,name\n1,Ada';
export const badgeBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

export const responseShapeRoutes = k.routes({
    exportCsv: k
        .route({
            method: 'GET',
            path: '/items.csv',
            responses: {
                200: {
                    body: z.string(),
                    contentType: 'text/csv',
                },
            },
        })
        .handler(() => ({
            status: 200,
            body: csvBody,
        })),
    downloadBadge: k
        .route({
            method: 'GET',
            path: '/badge',
            responses: {
                200: {
                    body: z.instanceof(Uint8Array),
                    contentType: 'application/octet-stream',
                },
            },
        })
        .handler(() => ({
            status: 200,
            body: badgeBytes,
        })),
    deleteItem: k
        .route({
            method: 'DELETE',
            path: '/items/:id',
            responses: {
                204: z.void(),
            },
        })
        .handler(() => ({
            status: 204,
            body: undefined,
        })),
    createValidated: k
        .route({
            method: 'POST',
            path: '/validated',
            body: z.object({
                name: z.string().min(1),
            }),
            responses: {
                201: z.object({
                    id: z.string(),
                }),
            },
        })
        .handler(() => ({
            status: 201,
            body: {
                id: '1',
            },
        })),
    receiveSigned: k
        .route({
            method: 'POST',
            path: '/signed',
            rawBody: true,
            body: z.object({
                name: z.string(),
            }),
            responses: {
                200: z.object({
                    rawBody: z.string(),
                    name: z.string(),
                }),
            },
        })
        .handler(({ rawBody, body }) => ({
            status: 200,
            body: {
                rawBody,
                name: body.name,
            },
        })),
});

/**
 * Spaced the way no serializer would write it, so a re-serialized body cannot
 * pass for the one that was sent.
 */
export const signedBodyText = '{ "name" :  "Ada" }';

export const responseShapeInput = {
    ...config,
    routes: [responseShapeRoutes],
};

export const responseShapeContract = defineConfig(responseShapeInput).api;

export const deprecatedRoutes = k.routes({
    deleteUser: k
        .route({
            method: 'DELETE',
            path: '/deprecated-users/:id',
            deprecated: {
                message: 'use `archiveUser` instead',
                date: '2026-03-01T00:00:00Z',
                link: 'https://example.com/changelog/delete-user',
            },
            responses: {
                200: z.object({
                    success: z.boolean(),
                }),
                404: ProblemDetailsSchema,
            },
        })
        .handler(({ params }) => {
            if (params.id !== '1') {
                return {
                    status: 404,
                    body: {
                        detail: 'Not found',
                    },
                };
            }
            return {
                status: 200,
                body: {
                    success: true,
                },
            };
        }),
    exportReport: k
        .route({
            method: 'GET',
            path: '/report',
            sunset: {
                date: '2027-01-01',
                link: 'https://example.com/retirement-policy',
            },
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        })
        .handler(() => ({
            status: 200,
            body: {
                ok: true,
            },
        })),
});

export const deprecatedInput = {
    ...config,
    routes: [deprecatedRoutes],
};

export const deprecatedContract = defineConfig(deprecatedInput).api;

export const cachedRoutes = k.routes({
    listUsers: k
        .route({
            method: 'GET',
            path: '/cached-users',
            responses: {
                200: {
                    body: z.object({
                        users: z.array(z.string()),
                    }),
                    cache: {
                        scope: 'private',
                        maxAge: 300,
                        vary: ['authorization'],
                    },
                },
            },
        })
        .handler(() => ({
            status: 200,
            body: {
                users: ['alice'],
            },
        })),
    getUser: k
        .route({
            method: 'GET',
            path: '/cached-users/:id',
            responses: {
                200: {
                    body: z.object({
                        id: z.string(),
                    }),
                    cache: {
                        scope: 'private',
                        maxAge: 300,
                    },
                },
                404: {
                    body: ProblemDetailsSchema,
                    cache: {
                        scope: 'public',
                        maxAge: 10,
                    },
                },
            },
        })
        .handler(({ params }) => {
            if (params.id !== '1') {
                return {
                    status: 404,
                    body: {
                        detail: 'Not found',
                    },
                };
            }
            return {
                status: 200,
                body: {
                    id: params.id,
                },
            };
        }),
    findUser: k
        .route({
            method: 'GET',
            path: '/cached-lookup/:id',
            responses: {
                200: {
                    body: z.object({
                        id: z.string(),
                    }),
                    cache: {
                        scope: 'private',
                        maxAge: 300,
                    },
                },
                404: ProblemDetailsSchema,
            },
        })
        .handler(({ params }) => {
            if (params.id !== '1') {
                return {
                    status: 404,
                    body: {
                        detail: 'Not found',
                    },
                };
            }
            return {
                status: 200,
                body: {
                    id: params.id,
                },
            };
        }),
    health: k
        .route({
            method: 'GET',
            path: '/cached-health',
            responses: {
                200: {
                    body: z.object({
                        ok: z.boolean(),
                    }),
                    cache: 'no-store',
                },
            },
        })
        .handler(() => ({
            status: 200,
            body: {
                ok: true,
            },
        })),
    /**
     * Its handler returns a `cache-control` of its own, which the declared
     * policy overrules.
     */
    freshReport: k
        .route({
            method: 'GET',
            path: '/cached-report',
            responses: {
                200: {
                    body: z.object({
                        ok: z.boolean(),
                    }),
                    cache: {
                        scope: 'private',
                        maxAge: 300,
                    },
                },
            },
        })
        .handler(() => ({
            status: 200,
            body: {
                ok: true,
            },
            headers: {
                'cache-control': 'no-store',
            },
        })),
    guardedReport: k
        .route({
            method: 'GET',
            path: '/cached-guarded',
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
                403: {
                    body: ProblemDetailsSchema,
                    cache: 'no-store',
                },
            },
        })
        .handler(() => ({
            status: 403,
            body: {
                detail: 'Forbidden',
            },
        })),
    validatedReport: k
        .route({
            method: 'GET',
            path: '/cached-validated',
            query: z.object({
                page: z.number().int(),
            }),
            responses: {
                200: z.object({
                    page: z.number(),
                }),
                400: {
                    body: ProblemDetailsSchema,
                    cache: 'no-store',
                },
            },
        })
        .handler(({ query }) => ({
            status: 200,
            body: {
                page: query.page,
            },
        })),
    taggedUser: k
        .route({
            method: 'GET',
            path: '/tagged-users/:id',
            responses: {
                200: {
                    body: z.object({
                        id: z.string(),
                    }),
                    cache: {
                        scope: 'private',
                        noCache: true,
                    },
                    etag: true,
                },
            },
        })
        .handler(({ params }) => ({
            status: 200,
            body: {
                id: params.id,
            },
        })),
    createTaggedUser: k
        .route({
            method: 'POST',
            path: '/tagged-users',
            responses: {
                200: {
                    body: z.object({
                        id: z.string(),
                    }),
                    etag: true,
                },
            },
        })
        .handler(() => ({
            status: 200,
            body: {
                id: '1',
            },
        })),
});

export const cachedInput = {
    ...config,
    routes: [cachedRoutes],
};

export const cachedContract = defineConfig(cachedInput).api;

const echoMethod = (method: string) => () => ({
    status: 200 as const,
    body: {
        method,
    },
});

/**
 * One route per HTTP method, so every adapter proves it registers and dispatches all of them.
 */
export const methodRoutes = k.routes({
    getItem: k
        .route({
            method: 'GET',
            path: '/items/:id',
            responses: {
                200: z.object({
                    method: z.string(),
                }),
            },
        })
        .handler(echoMethod('GET')),
    createItem: k
        .route({
            method: 'POST',
            path: '/items',
            responses: {
                200: z.object({
                    method: z.string(),
                }),
            },
        })
        .handler(echoMethod('POST')),
    listItems: k
        .route({
            method: 'GET',
            path: '/items',
            responses: {
                200: z.object({
                    method: z.string(),
                }),
            },
        })
        .handler(echoMethod('GET')),
    optionsItems: k
        .route({
            method: 'OPTIONS',
            path: '/items',
            responses: {
                200: z.object({
                    method: z.string(),
                }),
            },
        })
        .handler(echoMethod('OPTIONS')),
    replaceItem: k
        .route({
            method: 'PUT',
            path: '/items/:id',
            responses: {
                200: z.object({
                    method: z.string(),
                }),
            },
        })
        .handler(echoMethod('PUT')),
    patchItem: k
        .route({
            method: 'PATCH',
            path: '/items/:id',
            responses: {
                200: z.object({
                    method: z.string(),
                }),
            },
        })
        .handler(echoMethod('PATCH')),
    deleteItem: k
        .route({
            method: 'DELETE',
            path: '/items/:id',
            responses: {
                200: z.object({
                    method: z.string(),
                }),
            },
        })
        .handler(echoMethod('DELETE')),
    optionsItem: k
        .route({
            method: 'OPTIONS',
            path: '/items/:id',
            responses: {
                200: z.object({
                    method: z.string(),
                }),
            },
        })
        .handler(echoMethod('OPTIONS')),
    headItem: k
        .route({
            method: 'HEAD',
            path: '/items/:id',
            responses: {
                200: z.object({
                    method: z.string(),
                }),
            },
        })
        .handler(echoMethod('HEAD')),
});

export const methodInput = {
    ...config,
    routes: [methodRoutes],
};

export const methodContract = defineConfig(methodInput).api;

export const failingStreamFirstChunk = 'first chunk\n';

const probePlugin = definePlugin({
    slug: 'probe',
    options: z.object({
        label: z.string(),
    }),
    setup: ({ options }) => ({
        routes: {
            ping: route({
                method: 'GET',
                path: '/probe/ping',
                responses: {
                    200: z.object({
                        pong: z.boolean(),
                    }),
                },
            }).handler(() => ({
                status: 200,
                body: {
                    pong: true,
                },
            })),
            overlap: route({
                method: 'GET',
                path: '/which-label/:id',
                responses: {
                    200: z.object({
                        from: z.string(),
                    }),
                },
            }).handler(() => ({
                status: 200,
                body: {
                    from: 'plugin',
                },
            })),
            stream: route({
                method: 'GET',
                path: '/probe/stream',
                responses: {
                    200: z.object({
                        never: z.boolean(),
                    }),
                },
            }).handler(() =>
                rawResponse(
                    new Response('not json at all', {
                        status: 200,
                        headers: {
                            'Content-Type': 'text/plain',
                        },
                    })
                )
            ),
            failingStream: route({
                method: 'GET',
                path: '/probe/failing-stream',
                responses: {
                    200: z.object({
                        never: z.boolean(),
                    }),
                },
            }).handler(() =>
                rawResponse(
                    new Response(
                        new ReadableStream<Uint8Array>({
                            start(controller) {
                                controller.enqueue(new TextEncoder().encode(failingStreamFirstChunk));
                            },
                            async pull(controller) {
                                await new Promise((resolve) => setTimeout(resolve, 20));
                                controller.error(new Error('The stream failed after its first chunk'));
                            },
                        }),
                        {
                            status: 200,
                            headers: {
                                'Content-Type': 'text/plain',
                            },
                        }
                    )
                )
            ),
        },
        exports: {
            label: () => options.label,
        },
    }),
});

const pluginKGroups = k.groups({
    api: 'API',
});
const pluginKConfig = {
    groups: pluginKGroups,
};

export const pluginRoutes = pluginK.routes({
    whichLabel: pluginK
        .route({
            method: 'GET',
            path: '/which-label',
            responses: {
                200: z.object({
                    label: z.string(),
                }),
            },
        })
        .handler((({ plugins }: { plugins: { probe: { label: () => string } } }) => ({
            status: 200,
            body: {
                label: plugins.probe.label(),
            },
        })) as never),
    overlapping: pluginK
        .route({
            method: 'GET',
            path: '/which-label/me',
            responses: {
                200: z.object({
                    from: z.string(),
                }),
            },
        })
        .handler(() => ({
            status: 200,
            body: {
                from: 'contract',
            },
        })),
});

export const pluginInput = {
    ...pluginKConfig,
    routes: [pluginRoutes],
    plugins: [
        probePlugin({
            label: 'probed',
        }),
    ],
};

export const pluginContract = defineConfig(pluginInput).api;

// Holds the generator before its last event. Open by default; `hold()` arms it for one test.
const createStreamGate = () => {
    let open: Promise<void> = Promise.resolve();
    let release: () => void = () => undefined;
    let markAborted: () => void = () => undefined;
    let aborted: Promise<void> = new Promise((resolve) => {
        markAborted = resolve;
    });
    return {
        reset(): void {
            open = Promise.resolve();
            release = () => undefined;
            aborted = new Promise((resolve) => {
                markAborted = resolve;
            });
        },
        hold(): void {
            open = new Promise((resolve) => {
                release = resolve;
            });
        },
        release(): void {
            release();
        },
        wait(): Promise<void> {
            return open;
        },
        markAborted(): void {
            markAborted();
        },
        get aborted(): Promise<void> {
            return aborted;
        },
    };
};

export const streamGate = createStreamGate();

const notifications = [
    {
        id: '1',
        title: 'Invoice paid',
    },
    {
        id: '2',
        title: 'New comment',
    },
    {
        id: '3',
        title: 'Report ready',
    },
];

export const streamRoutes = k.routes({
    watchEvents: k
        .route({
            method: 'GET',
            path: '/events',
            query: z.object({
                fail: z.string().optional(),
                boom: z.string().optional(),
                invalid: z.string().optional(),
            }),
            responses: {
                200: {
                    stream: {
                        delta: z.object({
                            text: z.string(),
                        }),
                        done: z.object({
                            count: z.int(),
                        }),
                    },
                },
                400: ProblemDetailsSchema,
            },
        })
        .handler(({ query, throwError }) => {
            if (query.fail === '1') {
                return throwError({
                    status: 400,
                    body: {
                        detail: 'asked to fail',
                    },
                });
            }
            return {
                status: 200,
                body: async function* ({ signal }) {
                    signal.addEventListener('abort', () => streamGate.markAborted(), {
                        once: true,
                    });
                    yield {
                        event: 'delta',
                        data: {
                            text: 'a',
                        },
                    };
                    yield {
                        comment: 'keep-alive',
                    };
                    if (query.boom === '1') throw new Error('boom');
                    if (query.invalid === '1') {
                        yield {
                            event: 'delta',
                            data: {
                                text: 42 as unknown as string,
                            },
                        };
                    }
                    await streamGate.wait();
                    yield {
                        event: 'done',
                        data: {
                            count: 1,
                        },
                        id: 'evt-1',
                        retry: 5000,
                    };
                },
            };
        }),
    watchNotifications: k
        .route({
            method: 'GET',
            path: '/notifications',
            responses: {
                200: {
                    stream: z.object({
                        title: z.string(),
                    }),
                },
            },
        })
        .handler(({ lastEventId }) => ({
            status: 200,
            body: async function* () {
                const after = lastEventId === undefined ? 0 : Number(lastEventId);
                for (const notification of notifications.filter((candidate) => Number(candidate.id) > after)) {
                    yield {
                        id: notification.id,
                        data: {
                            title: notification.title,
                        },
                    };
                }
            },
        })),
    watchTicks: k
        .route({
            method: 'GET',
            path: '/ticks',
            responses: {
                200: {
                    stream: z.object({
                        tick: z.int(),
                    }),
                },
            },
        })
        .handler(() => ({
            status: 200,
            body: async function* () {
                yield {
                    data: {
                        tick: 1,
                    },
                };
                yield {
                    data: {
                        tick: 2,
                    },
                };
            },
        })),
    exportLines: k
        .route({
            method: 'GET',
            path: '/lines.txt',
            responses: {
                200: {
                    stream: z.string(),
                    contentType: 'text/plain',
                },
            },
        })
        .handler(() => ({
            status: 200,
            body: async function* () {
                yield 'one\n';
                yield 'two\n';
            },
        })),
});

export const streamInput = {
    ...config,
    routes: [streamRoutes],
};

export const streamContract = defineConfig(streamInput).api;

export const streamedEventsText =
    'event: delta\ndata: {"text":"a"}\n\n: keep-alive\n\nevent: done\ndata: {"count":1}\nid: evt-1\nretry: 5000\n\n';
export const streamedTicksText = 'data: {"tick":1}\n\ndata: {"tick":2}\n\n';
export const streamedLinesText = 'one\ntwo\n';

/**
 * An employee as the store holds it, with fields no response declares.
 */
const storedEmployee = {
    id: '1',
    name: 'Ada',
    salary: 98000,
    profile: {
        bio: 'Writes the payroll engine',
        bankAccount: 'NO9386011117947',
    },
};

const EmployeeSchema = z.object({
    id: z.string(),
    name: z.string(),
});

export const strippedTools = k.routes({
    lookupEmployee: k
        .route({
            method: 'GET',
            path: '/employees/lookup',
            summary: 'Look up the employee on duty',
            tool: true,
            responses: {
                200: EmployeeSchema,
            },
        })
        .handler(() => {
            const employee: z.input<typeof EmployeeSchema> = storedEmployee;
            return {
                status: 200,
                body: employee,
            };
        }),
});

/**
 * Handlers that return more than their responses declare, for the features that strip it.
 */
export const strippedRoutes = k.routes({
    tools: strippedTools,
    getEmployee: k
        .route({
            method: 'GET',
            path: '/employees/:id',
            responses: {
                200: z.object({
                    id: z.string(),
                    name: z.string(),
                    profile: z.object({
                        bio: z.string(),
                    }),
                }),
            },
        })
        .handler(() => {
            const employee: {
                id: string;
                name: string;
                profile: {
                    bio: string;
                };
            } = storedEmployee;
            return {
                status: 200,
                body: employee,
            };
        }),
    listEmployees: k
        .route({
            method: 'GET',
            path: '/employees',
            responses: {
                200: z.object({
                    employees: z.array(EmployeeSchema),
                }),
            },
        })
        .handler(() => {
            const employees: z.input<typeof EmployeeSchema>[] = [storedEmployee, storedEmployee];
            return {
                status: 200,
                body: {
                    employees,
                },
            };
        }),
    deleteEmployee: k
        .route({
            method: 'DELETE',
            path: '/employees/:id',
            responses: {
                204: z.void(),
                409: ProblemDetailsSchema.extend({
                    openShifts: z.int(),
                }),
            },
        })
        .handler(({ throwError }) => {
            const conflict = {
                detail: 'Ada has open shifts',
                openShifts: 2,
                internalQuery: 'SELECT * FROM shifts WHERE employee_id = 1',
            };
            const body: {
                detail: string;
                openShifts: number;
            } = conflict;
            return throwError({
                status: 409,
                body,
            });
        }),
    watchEmployee: k
        .route({
            method: 'GET',
            path: '/employees/:id/events',
            responses: {
                200: {
                    stream: {
                        updated: EmployeeSchema,
                    },
                },
            },
        })
        .handler(() => ({
            status: 200,
            body: async function* () {
                const employee: z.input<typeof EmployeeSchema> = storedEmployee;
                yield {
                    event: 'updated',
                    data: employee,
                };
            },
        })),
    askAssistant: k
        .route({
            method: 'GET',
            path: '/assistant',
            responses: {
                200: {
                    stream: {
                        done: z.object({
                            ok: z.boolean(),
                        }),
                    },
                    tools: strippedTools,
                },
            },
        })
        .handler(({ tools }) => ({
            status: 200,
            body: async function* () {
                const result = yield* tools.run({
                    id: 'call_1',
                    name: 'lookup_employee',
                });
                yield {
                    event: 'done',
                    data: {
                        ok: result.state === 'done',
                    },
                };
            },
        })),
});

export const strippedInput = {
    ...config,
    routes: [strippedRoutes],
};

export const strippedContract = defineConfig(strippedInput).api;

interface CookieKConfig {
    auth: {
        identities: {
            visitor: typeof visitorIdentity;
        };
    };
}

const cookieK = new Kizuna<CookieKConfig>();

export const visitorSession = 'sess_ada';

export const visitorIdentity = cookieK.identity
    .apiKey({
        name: 'session',
        in: 'cookie',
        context: z.object({
            visitorId: z.string(),
        }),
    })
    .guard(({ apiKey, deny }) => {
        if (apiKey?.value !== visitorSession)
            return deny({
                status: 403,
                body: {
                    detail: 'Forbidden',
                },
            });
        return {
            visitorId: '1',
        };
    });

export const cookieRoutes = cookieK.routes({
    getVisit: cookieK
        .route({
            method: 'GET',
            path: '/visit',
            auth: 'visitor',
            responses: {
                200: z.object({
                    visitorId: z.string(),
                }),
            },
        })
        .handler(({ auth }) => ({
            status: 200,
            body: {
                visitorId: auth.visitor.visitorId,
            },
        })),
});

export const cookieInput = {
    auth: {
        identities: {
            visitor: visitorIdentity,
        },
    },
    routes: [cookieRoutes],
};

export const cookieContract = defineConfig(cookieInput).api;

/**
 * Routes reading request headers and query keys, for the features about how a
 * request's names reach the handler.
 */
export const requestNameRoutes = k.routes({
    getTenant: k
        .route({
            method: 'GET',
            path: '/tenant',
            headers: z.object({
                'X-Tenant-Id': z.string(),
            }),
            responses: {
                200: z.object({
                    tenantId: z.string(),
                }),
            },
        })
        .handler(({ headers }) => ({
            status: 200,
            body: {
                tenantId: headers['X-Tenant-Id'],
            },
        })),
    search: k
        .route({
            method: 'GET',
            path: '/search',
            query: z.looseObject({
                term: z.string().optional(),
            }),
            responses: {
                200: z.object({
                    keys: z.array(z.string()),
                    constructorValue: z.unknown(),
                    plainPrototype: z.boolean(),
                }),
            },
        })
        .handler(({ query }) => ({
            status: 200,
            body: {
                keys: Object.keys(query),
                constructorValue: Object.hasOwn(query, 'constructor') ? query['constructor'] : 'inherited',
                plainPrototype: Object.getPrototypeOf(query) === Object.prototype,
            },
        })),
});

export const requestNameInput = {
    ...config,
    routes: [requestNameRoutes],
};

export const requestNameContract = defineConfig(requestNameInput).api;
