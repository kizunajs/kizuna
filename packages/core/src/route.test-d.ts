import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import { ProblemDetailsSchema } from './error-response.js';
import { HANDLER } from './types.js';

interface Config {
    tags: typeof kTags;
}

const k = new Kizuna<Config>();

const kTags = k.tags({
    users: 'Users',
});

const UserSchema = z.object({
    id: z.string(),
    name: z.string(),
});

const createUser = k
    .route({
        method: 'POST',
        path: '/users',
        body: z.object({
            name: z.string().min(1),
        }),
        responses: {
            201: UserSchema,
            409: ProblemDetailsSchema,
        },
    })
    .handler(({ body, throwError }) => {
        expectTypeOf(body).toEqualTypeOf<{ name: string }>();
        if (body.name === 'root') {
            throwError({
                status: 409,
                body: {
                    detail: 'that name is taken',
                },
            });
        }
        return {
            status: 201,
            body: {
                id: '1',
                name: body.name,
            },
        };
    });

const getUser = k
    .route({
        method: 'GET',
        path: '/users/:id',
        query: z.object({
            expand: z.boolean().optional(),
        }),
        responses: {
            200: UserSchema,
        },
    })
    .handler(({ params, query }) => {
        expectTypeOf(params).toEqualTypeOf<{ id: string }>();
        expectTypeOf(query).toEqualTypeOf<{ expand?: boolean | undefined }>();
        return {
            status: 200,
            body: {
                id: params.id,
                name: 'Ada',
            },
        };
    });

test('the route keeps its literal method and path', () => {
    expectTypeOf(createUser.method).toEqualTypeOf<'POST'>();
    expectTypeOf(getUser.path).toEqualTypeOf<'/users/:id'>();
});

test('a route carrying a handler goes into a group', () => {
    const routes = k.routes('users', {
        createUser,
        getUser,
    });

    expectTypeOf(routes.createUser[HANDLER]).toEqualTypeOf<(typeof createUser)[typeof HANDLER]>();
});

test('the handler cannot answer a status the route does not declare', () => {
    k.route({
        method: 'GET',
        path: '/users/:id',
        responses: {
            200: UserSchema,
        },
    }).handler(() => ({
        // @ts-expect-error 404 is not declared
        status: 404,
        body: {
            id: '1',
            name: 'Ada',
        },
    }));
});

test('the handler cannot return a body the response schema rejects', () => {
    k.route({
        method: 'GET',
        path: '/users/:id',
        responses: {
            200: UserSchema,
        },
    }).handler(() => ({
        status: 200,
        // @ts-expect-error name is missing from the body
        body: {
            id: '1',
        },
    }));
});

test('the handler cannot read a path parameter the path does not carry', () => {
    k.route({
        method: 'GET',
        path: '/users/:id',
        responses: {
            200: UserSchema,
        },
    }).handler(({ params }) => {
        // @ts-expect-error the path declares id, not slug
        void params.slug;
        return {
            status: 200,
            body: {
                id: params.id,
                name: 'Ada',
            },
        };
    });
});

test('the handler cannot read a body the route does not declare', () => {
    k.route({
        method: 'GET',
        path: '/users',
        responses: {
            200: UserSchema,
        },
    }).handler(({ body }) => {
        expectTypeOf(body).toEqualTypeOf<undefined>();
        return {
            status: 200,
            body: {
                id: '1',
                name: 'Ada',
            },
        };
    });
});

test('throwError cannot answer a status the route does not declare', () => {
    k.route({
        method: 'GET',
        path: '/users/:id',
        responses: {
            200: UserSchema,
        },
    }).handler(({ params, throwError }) => {
        throwError({
            // @ts-expect-error 404 is not declared
            status: 404,
            body: {
                id: params.id,
                name: 'Ada',
            },
        });
        return {
            status: 200,
            body: {
                id: params.id,
                name: 'Ada',
            },
        };
    });
});

test('pathParams has to match the path', () => {
    k.route({
        method: 'GET',
        path: '/users/:id',
        // @ts-expect-error pathParams declares slug, which the path does not carry
        pathParams: z.object({
            slug: z.string(),
        }),
        responses: {
            200: UserSchema,
        },
    });
});

test('a request header declared as an object is refused', () => {
    k.route({
        method: 'GET',
        path: '/users',
        // @ts-expect-error a header holds one value
        headers: z.object({
            'x-filter': z.object({
                name: z.string(),
            }),
        }),
        responses: {
            200: UserSchema,
        },
    });
});

test('a request header may be a scalar, a date, or a list of scalars', () => {
    k.route({
        method: 'GET',
        path: '/users',
        headers: z.object({
            'x-tenant': z.uuid(),
            'x-page': z.int(),
            'if-modified-since': z.date().optional(),
            'x-tag': z.array(z.string()).optional(),
        }),
        responses: {
            200: UserSchema,
        },
    });
});

test('a response header declared as a date or a list is refused', () => {
    k.route({
        method: 'GET',
        path: '/users/:id',
        responses: {
            200: {
                body: UserSchema,
                // @ts-expect-error a client has no type to read a date header into
                headers: z.object({
                    'x-reset': z.date(),
                }),
            },
        },
    });
    k.route({
        method: 'GET',
        path: '/users/:id',
        responses: {
            200: {
                body: UserSchema,
                // @ts-expect-error a response header is one value
                headers: z.object({
                    'x-tag': z.array(z.string()),
                }),
            },
        },
    });
});

test('a response header may be a string, number, boolean, bigint, or enum', () => {
    k.route({
        method: 'GET',
        path: '/users/:id',
        responses: {
            200: {
                body: UserSchema,
                headers: z.object({
                    'x-request-id': z.uuid().optional(),
                    'x-rate-limit-remaining': z.int(),
                    'x-cached': z.boolean(),
                    'x-sequence': z.bigint(),
                    'x-plan': z.enum(['free', 'pro']),
                }),
            },
        },
    });
});
