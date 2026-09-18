import { z } from 'zod';
// Not `../kizuna.js`: an identity's credential is branded, so a contract built from `src` hands the adapters identities
// their own `server.guard` cannot resolve.
import { Kizuna } from '@ts-kizuna/core';
import { defineConfig } from '@ts-kizuna/core';
import { ProblemDetailsSchema } from '@ts-kizuna/core/schemas';
import { createPlugin } from '@ts-kizuna/core/adapter';

interface Config {
    tags: typeof kTags;
}

interface SecuredKConfig {
    identities: {
        user: typeof userIdentity;
        member: typeof memberIdentity;
    };
}

interface GateKConfig {
    identities: {
        user: typeof userIdentity;
        apiConsumer: typeof apiConsumerIdentity;
    };
}

interface RequestContextKConfig {
    identities: {
        user: typeof userIdentity;
    };
    requestContext: {
        analytics: typeof analyticsContext;
    };
}

interface PluginTypeKConfig {
    tags: typeof pluginTypeKTags;
}

const k = new Kizuna<Config>();
const securedK = new Kizuna<SecuredKConfig>();
const gateK = new Kizuna<GateKConfig>();
const requestContextK = new Kizuna<RequestContextKConfig>();
const pluginTypeK = new Kizuna<PluginTypeKConfig>();

const kTags = k.tags({
    api: 'API',
});
const config = {
    tags: kTags,
};

/**
 * Two routes, not the runtime suite's four: every `router.*` feature writes one handler per route, once per adapter.
 */
export const inferenceRoutes = k.routes('api', {
    getUser: k.route({
        method: 'GET',
        path: '/users/:id',
        responses: {
            200: z.object({
                id: z.string(),
                name: z.string(),
            }),
            404: z.object({
                message: z.string(),
            }),
        },
    }),
    createUser: k.route({
        method: 'POST',
        path: '/users',
        body: z.object({
            name: z.string(),
            email: z.string(),
        }),
        responses: {
            201: z.object({
                id: z.string(),
                name: z.string(),
                email: z.string(),
            }),
        },
    }),
});

export const inferenceContract = defineConfig({
    ...config,
    routes: inferenceRoutes,
}).api;

export const streamInferenceRoutes = k.routes('api', {
    reply: k.route({
        method: 'POST',
        path: '/reply',
        body: z.object({
            prompt: z.string(),
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
    }),
});

export const streamInferenceContract = defineConfig({
    ...config,
    routes: streamInferenceRoutes,
}).api;

export const toolInferenceContract = defineConfig({
    ...config,
    routes: k.routes('api', {
        countWords: k.route({
            method: 'POST',
            path: '/word-count',
            body: z.object({
                text: z.string(),
            }),
            responses: {
                200: z.object({
                    words: z.int(),
                }),
            },
            summary: 'Count the words in a piece of text',
            tool: true,
        }),
    }),
}).api;

export const inferenceGroupContract = defineConfig({
    ...config,
    routes: {
        users: inferenceRoutes,
    },
}).api;

export const userIdentity = k.identity.bearer({
    context: z.object({
        userId: z.string(),
    }),
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

export const memberIdentity = k.identity.apiKey({
    name: 'x-workspace-token',
    in: 'header',
    context: z.object({
        workspaceUserId: z.string(),
    }),
    roles: workspaceRoles,
});

const securedKConfig = {
    identities: {
        user: userIdentity,
        member: memberIdentity,
    },
};

export const securedRoutes = securedK.routes({
    publicRoute: securedK.route({
        method: 'GET',
        path: '/public',
        auth: false,
        responses: {
            200: z.object({
                ok: z.boolean(),
            }),
        },
    }),
    whoAmI: securedK.route({
        method: 'GET',
        path: '/who-am-i',
        auth: 'user',
        responses: {
            200: z.object({
                userId: z.string(),
            }),
        },
    }),
    ownerOnly: securedK.route({
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
    }),
    adminOnly: securedK.route({
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
    }),
    both: securedK.route({
        method: 'GET',
        path: '/both',
        auth: ['user', 'member'],
        responses: {
            200: z.object({
                userId: z.string(),
                workspaceUserId: z.string(),
            }),
        },
    }),
});

export const securedContract = defineConfig({
    ...securedKConfig,
    routes: {
        api: securedRoutes,
    },
}).api;

export const apiConsumerIdentity = k.identity.apiKey({
    name: 'x-api-key',
    in: 'header',
});

const gateKConfig = {
    identities: {
        user: userIdentity,
        apiConsumer: apiConsumerIdentity,
    },
};

export const gateRoutes = gateK.routes({
    publicRoute: gateK.route({
        method: 'GET',
        path: '/public',
        auth: false,
        responses: {
            200: z.object({
                ok: z.boolean(),
            }),
        },
    }),
    apiOnly: gateK.route({
        method: 'GET',
        path: '/api-only',
        auth: 'apiConsumer',
        responses: {
            200: z.object({
                ok: z.boolean(),
            }),
        },
    }),
    whoAmI: gateK.route({
        method: 'GET',
        path: '/who-am-i',
        auth: 'user',
        responses: {
            200: z.object({
                userId: z.string(),
            }),
        },
    }),
});

export const gateContract = defineConfig({
    ...gateKConfig,
    routes: {
        api: gateRoutes,
    },
}).api;

export const analyticsContext = k.requestContext(
    z.object({
        sessionId: z.string().nullable(),
    })
);

const requestContextKConfig = {
    identities: {
        user: userIdentity,
    },
    requestContext: {
        analytics: analyticsContext,
    },
};

export const requestContextRoutes = requestContextK.routes({
    publicRoute: requestContextK.route({
        method: 'GET',
        path: '/public',
        auth: false,
        responses: {
            200: z.object({
                ok: z.boolean(),
            }),
        },
    }),
});

export const requestContextContract = defineConfig({
    ...requestContextKConfig,
    routes: {
        api: requestContextRoutes,
    },
}).api;

const typedProbePlugin = createPlugin({
    name: 'probe',
    routes: {
        ping: {
            method: 'GET',
            path: '/probe/ping',
            responses: {
                200: z.object({
                    pong: z.boolean(),
                }),
            },
        },
    },
    serve: () => ({
        router: {
            ping: () => ({
                status: 200 as const,
                body: {
                    pong: true,
                },
            }),
        },
        exports: {
            label: () => 'probe',
        },
    }),
});

const pluginTypeKTags = k.tags({
    api: 'API',
});
const pluginTypeKConfig = {
    tags: pluginTypeKTags,
};

export const pluginTypeContract = defineConfig({
    ...pluginTypeKConfig,
    plugins: [typedProbePlugin],
    routes: pluginTypeK.routes('api', {
        whichLabel: pluginTypeK.route({
            method: 'GET',
            path: '/which-label',
            responses: {
                200: z.object({
                    label: z.string(),
                }),
            },
        }),
    }),
    jobs: pluginTypeK.jobs({
        reindex: pluginTypeK.job({
            summary: 'Re-index one record',
            input: z.object({
                recordId: z.string(),
            }),
        }),
    }),
}).api;
