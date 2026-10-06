import { expressAdapter } from '@kizunajs/express';
import { z } from 'zod';
import { Kizuna, defineConfig } from 'kizunajs';
import { ProblemDetailsSchema } from 'kizunajs/schemas';

interface Config {
    adapter: ReturnType<typeof expressAdapter>;
    groups: typeof kGroups;
    requestContext: {
        analytics: typeof analyticsContext;
    };
    auth: {
        identities: {
            user: typeof userIdentity;
        };
    };
}

const k = new Kizuna<Config>();

const kGroups = k.groups({
    api: 'API',
});

const analyticsContext = k.requestContext({
    headers: z.object({
        'x-session-id': z.string().optional(),
    }),
    context: z.object({
        sessionId: z.string().nullable(),
    }),
});

const userIdentity = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
    })
    .guard(({ bearer, deny }) => {
        if (bearer?.token !== 'tok_ada')
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

const UserId = Kizuna.brand('UserId', z.string());

const CenterId = Kizuna.brand('CenterId', z.string());

const CenterSchema = Kizuna.model({
    title: 'Center',
    schema: z.object({
        id: CenterId,
        name: z.string(),
        parentId: CenterId.nullable(),
    }),
});

export const MissingRelationSchema = ProblemDetailsSchema.extend({
    missingRelation: z.string(),
});

const users = new Map<string, { id: string; name: string; email: string }>();

const routes = k.routes({
    users: {
        getUser: k
            .route({
                method: 'GET',
                path: '/users/:id',
                auth: false,
                responses: {
                    200: {
                        body: z.object({
                            id: z.string(),
                            name: z.string(),
                        }),
                        headers: z.object({
                            'x-request-id': z.string().optional(),
                        }),
                    },
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
                auth: false,
                body: z.object({
                    name: z.string(),
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
                const id = String(users.size + 1);
                const user = {
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
        listUsers: k.route({
            method: 'GET',
            path: '/users',
            auth: false,
            query: z.object({
                page: z.number().optional(),
            }),
            responses: {
                200: z.object({
                    users: z.array(z.string()),
                }),
            },
        }),
    },
    posts: {
        listPosts: k.route({
            method: 'GET',
            path: '/posts',
            auth: false,
            responses: {
                200: z.object({
                    posts: z.array(z.string()),
                }),
            },
        }),
    },
    forms: {
        uploadAvatar: k.route({
            method: 'POST',
            path: '/avatar',
            auth: false,
            contentType: 'multipart/form-data',
            body: z.object({
                file: z.instanceof(File),
                userId: z.string(),
            }),
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        }),
        submitForm: k.route({
            method: 'POST',
            path: '/form',
            auth: false,
            contentType: 'application/x-www-form-urlencoded',
            body: z.object({
                email: z.string(),
            }),
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        }),
    },
    headers: {
        optional: k.route({
            method: 'GET',
            path: '/optional-headers',
            auth: false,
            headers: z.object({
                'accept-language': z.string().optional(),
            }),
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        }),
        required: k.route({
            method: 'GET',
            path: '/required-headers',
            auth: false,
            headers: z.object({
                'x-tenant': z.string(),
            }),
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        }),
    },
    tracing: {
        echoRequestId: k
            .route({
                method: 'GET',
                path: '/tracing/echo',
                auth: false,
                responses: {
                    200: {
                        body: z.object({
                            ok: z.boolean(),
                        }),
                        headers: z.object({
                            'x-request-id': z.string().optional(),
                        }),
                    },
                },
            })
            .handler(({ headers, res }) => {
                const requestId = headers['x-request-id'];
                if (requestId) res.setHeader('x-request-id', requestId);
                return {
                    status: 200,
                    body: {
                        ok: true,
                    },
                };
            }),
    },
    payloads: {
        typedQuery: k.route({
            method: 'GET',
            path: '/typed',
            auth: false,
            query: z.object({
                page: z.number().int().min(1).default(1),
                from: z.date(),
                cursor: z.bigint(),
                search: z.string(),
                transformed: z.string().transform((value) => value.length),
            }),
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        }),
        nestedTyped: k.route({
            method: 'POST',
            path: '/nested',
            auth: false,
            body: z.object({
                filters: z.object({
                    price: z.number(),
                    createdAt: z.date(),
                    tags: z.array(
                        z.object({
                            weight: z.number(),
                            name: z.string(),
                        })
                    ),
                }),
                scores: z.array(z.number()),
                pair: z.tuple([z.number(), z.string()]),
            }),
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        }),
        discriminatedTyped: k.route({
            method: 'POST',
            path: '/discriminated',
            auth: false,
            body: z.discriminatedUnion('kind', [
                z.object({
                    kind: z.literal('count'),
                    count: z.number(),
                }),
                z.object({
                    kind: z.literal('name'),
                    name: z.string(),
                }),
            ]),
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        }),
        arrayOfDiscriminatedTyped: k.route({
            method: 'POST',
            path: '/array-of-discriminated',
            auth: false,
            body: z.object({
                events: z.array(
                    z.discriminatedUnion('kind', [
                        z.object({
                            kind: z.literal('view'),
                            viewedAt: z.number(),
                        }),
                        z.object({
                            kind: z.literal('purchase'),
                            amount: z.number(),
                            currency: z.string(),
                        }),
                    ])
                ),
            }),
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        }),
        nestedDiscriminatedTyped: k.route({
            method: 'POST',
            path: '/nested-discriminated',
            auth: false,
            body: z.object({
                wrapper: z.object({
                    strategy: z.discriminatedUnion('kind', [
                        z.object({
                            kind: z.literal('linear'),
                            slope: z.number(),
                        }),
                        z.object({
                            kind: z.literal('exponential'),
                            base: z.number(),
                        }),
                    ]),
                }),
            }),
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        }),
    },
    items: {
        deleteItem: k.route({
            method: 'DELETE',
            path: '/items/:id',
            auth: false,
            body: z.void(),
            responses: {
                200: z.object({
                    success: z.boolean(),
                }),
            },
        }),
    },
    events: {
        getUserEvents: k.route({
            method: 'GET',
            path: '/users/:userId/events/:eventId',
            auth: false,
            pathParams: z.object({
                userId: UserId,
                eventId: z.string(),
            }),
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        }),
        listEventsByYear: k.route({
            method: 'GET',
            path: '/events/:year',
            auth: false,
            pathParams: z.object({
                year: z.number(),
            }),
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        }),
    },
    centers: {
        getCenter: k.route({
            method: 'GET',
            path: '/centers/:centerId',
            auth: false,
            pathParams: z.object({
                centerId: CenterId,
            }),
            responses: {
                200: CenterSchema,
            },
        }),
        listCenters: k.route({
            method: 'GET',
            path: '/centers',
            auth: false,
            query: z.object({
                parentId: CenterId.optional(),
            }),
            responses: {
                200: z.array(CenterSchema),
            },
        }),
        moveCenter: k.route({
            method: 'POST',
            path: '/centers/:centerId/move',
            auth: false,
            pathParams: z.object({
                centerId: CenterId,
            }),
            headers: z.object({
                'x-actor-center': CenterId,
            }),
            body: z.object({
                parentId: CenterId,
            }),
            responses: {
                200: CenterSchema,
            },
        }),
    },
    activity: {
        getActivity: k.route({
            method: 'GET',
            path: '/activity',
            auth: false,
            responses: {
                200: Kizuna.model({
                    title: 'UserActivityEvent',
                    schema: z.discriminatedUnion('kind', [
                        Kizuna.model({
                            title: 'UserActivityEventStarted',
                            schema: z.object({
                                kind: z.literal('started'),
                                at: z.string(),
                            }),
                        }),
                        Kizuna.model({
                            title: 'UserActivityEventDone',
                            schema: z.object({
                                kind: z.literal('done'),
                                ok: z.boolean(),
                            }),
                        }),
                    ]),
                }),
            },
        }),
    },
    streams: {
        reply: k.route({
            method: 'POST',
            path: '/reply',
            auth: false,
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
                400: z.object({
                    type: z.string(),
                    title: z.string(),
                    status: z.number(),
                    detail: z.string(),
                }),
                404: ProblemDetailsSchema,
            },
        }),
        ticks: k.route({
            method: 'GET',
            path: '/ticks',
            auth: false,
            responses: {
                200: {
                    stream: z.object({
                        tick: z.int(),
                    }),
                },
            },
        }),
        lines: k.route({
            method: 'GET',
            path: '/lines',
            auth: false,
            responses: {
                200: {
                    stream: z.string(),
                    contentType: 'text/plain',
                },
            },
        }),
        bytes: k.route({
            method: 'GET',
            path: '/bytes',
            auth: false,
            responses: {
                200: {
                    stream: z.instanceof(Uint8Array),
                    contentType: 'application/octet-stream',
                },
            },
        }),
    },
    account: {
        whoAmI: k.route({
            method: 'GET',
            path: '/who-am-i',
            auth: 'user',
            responses: {
                200: z.object({
                    userId: z.string(),
                }),
            },
        }),
        declaresIts403: k.route({
            method: 'GET',
            path: '/declares-its-403',
            auth: 'user',
            responses: {
                200: z.object({
                    userId: z.string(),
                }),
                403: MissingRelationSchema,
            },
        }),
    },
    status: {
        health: k.route({
            method: 'GET',
            path: '/health',
            auth: false,
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        }),
    },
});

export const apiContract = defineConfig({
    adapter: expressAdapter(),
    groups: kGroups,
    requestContext: {
        analytics: analyticsContext,
    },
    auth: {
        identities: {
            user: userIdentity,
        },
    },
    routes: [routes],
}).api;
