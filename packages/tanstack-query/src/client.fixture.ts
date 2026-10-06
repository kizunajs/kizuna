import { z } from 'zod';
import { Kizuna, defineConfig } from 'kizunajs';

interface Config {
    groups: typeof kGroups;
    auth: {
        identities: {
            user: typeof user;
        };
    };
}

const k = new Kizuna<Config>();

const kGroups = k.groups({
    users: 'Users',
});

const user = k.identity.bearer({
    context: z.object({
        userId: z.string(),
    }),
});

const UserSchema = z.object({
    id: z.string(),
    name: z.string(),
});

export const contract = defineConfig({
    groups: kGroups,
    auth: {
        identities: {
            user,
        },
    },
    routes: [
        k.routes.users({
            listUsers: k.route({
                method: 'GET',
                path: '/users',
                auth: false,
                responses: {
                    200: z.object({
                        users: z.array(UserSchema),
                    }),
                },
            }),
            getUser: k.route({
                method: 'GET',
                path: '/users/:id',
                auth: false,
                responses: {
                    200: UserSchema,
                    404: z.object({
                        title: z.string(),
                    }),
                },
            }),
            searchUsers: k.route({
                method: 'GET',
                path: '/users/search',
                auth: false,
                query: z.object({
                    term: z.string(),
                    cursor: z.number().optional(),
                }),
                responses: {
                    200: z.object({
                        users: z.array(UserSchema),
                        nextCursor: z.number().nullable(),
                    }),
                },
            }),
            createUser: k.route({
                method: 'POST',
                path: '/users',
                auth: false,
                body: z.object({
                    name: z.string(),
                }),
                responses: {
                    201: UserSchema,
                },
            }),
            checkUser: k.route({
                method: 'HEAD',
                path: '/users/:id',
                auth: false,
                responses: {
                    200: z.object({}),
                },
            }),
        }),
        k.routes({
            guarded: {
                getUser: k.route({
                    method: 'GET',
                    path: '/guarded/users/:id',
                    auth: 'user',
                    responses: {
                        200: UserSchema,
                    },
                }),
            },
        }),
        k.routes({
            collisions: {
                key: k.route({
                    method: 'GET',
                    path: '/key',
                    auth: false,
                    responses: {
                        200: z.object({
                            value: z.string(),
                        }),
                    },
                }),
            },
        }),
        k.routes({
            assistant: {
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
                        404: z.object({
                            detail: z.string(),
                        }),
                    },
                }),
            },
        }),
    ],
}).api;
