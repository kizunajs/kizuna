import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import { defineConfig } from './define-config.js';

interface Config {
    tags: typeof kTags;
}

const k = new Kizuna<Config>();

const kTags = k.tags({
    users: 'Users',
});
const config = {
    tags: kTags,
};

const routes = k.routes('users', {
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
        }),
        responses: {
            201: z.object({
                id: z.string(),
            }),
        },
    }),
});

const contract = defineConfig({
    ...config,
    routes,
}).api;

test('routes preserve literal method and path strings', () => {
    expectTypeOf(routes.getUser.method).toEqualTypeOf<'GET'>();
    expectTypeOf(routes.getUser.path).toEqualTypeOf<'/users/:id'>();
    expectTypeOf(routes.createUser.method).toEqualTypeOf<'POST'>();
    expectTypeOf(routes.createUser.path).toEqualTypeOf<'/users'>();
});

test('createUser has body, getUser does not', () => {
    expectTypeOf(routes.createUser.body).not.toBeUndefined();
    expectTypeOf(routes.getUser).not.toHaveProperty('body');
});

test('path must start with /', () => {
    k.routes('users', {
        // @ts-expect-error path must start with /
        bad: k.route({ method: 'GET', path: 'users/:id', responses: { 200: z.string() } }),
    });
});

test('contract carries the route literals', () => {
    expectTypeOf(contract.routes.getUser.method).toEqualTypeOf<'GET'>();
    expectTypeOf(contract.routes.getUser.path).toEqualTypeOf<'/users/:id'>();
});
