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
