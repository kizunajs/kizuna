import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { Kizuna } from '@ts-kizuna/core';
import { defineConfig } from '@ts-kizuna/core';
import { createGeneratedClient, type Client, type ClientConfig, type GeneratedRoutes } from '@ts-kizuna/fetch';
import type { Routes } from '@ts-kizuna/core';

/**
 * A client over an assembled api's routes, the same runtime the generated
 * client uses.
 */
const apiClientFor = <T extends Routes>(api: { routes: T }, config: ClientConfig): Client<T> =>
    createGeneratedClient(api.routes as unknown as GeneratedRoutes, config) as unknown as Client<T>;

import { KizunaTanstackQuery } from './proxy.js';

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

const UserSchema = z.object({
    id: z.string(),
    name: z.string(),
});

const routes = k.routes('users', {
    listUsers: k.route({
        method: 'GET',
        path: '/users',
        responses: {
            200: z.object({
                users: z.array(UserSchema),
            }),
        },
    }),
    getUser: k.route({
        method: 'GET',
        path: '/users/:id',
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
        body: z.object({
            name: z.string(),
        }),
        responses: {
            201: UserSchema,
        },
    }),
});

const contract = defineConfig({
    ...config,
    routes: {
        users: routes,
    },
}).api;

const apiClient = apiClientFor(contract, {
    baseUrl: 'http://localhost:8000',
});

const api = new KizunaTanstackQuery(apiClient);

test('a route with a required query demands input', () => {
    // @ts-expect-error searchUsers declares a required `term`
    api.users.searchUsers.queryOptions({});
});

test('path params are typed', () => {
    // @ts-expect-error `id` is a string, not a number
    api.users.getUser.queryOptions({ input: { params: { id: 1 } } });
});

test('a mutation route has no query factories', () => {
    expectTypeOf(api.users.createUser).not.toHaveProperty('queryOptions');
    expectTypeOf(api.users.listUsers).not.toHaveProperty('mutationOptions');
});

test('groups and routes both expose a partial key', () => {
    expectTypeOf(api.users.key()).toEqualTypeOf<readonly [readonly string[]]>();
    expectTypeOf(api.users.getUser.key()).toEqualTypeOf<readonly [readonly string[]]>();
});

test('a streamed route offers streamOptions with the messages as data, and no query or mutation factories', () => {
    const streamRoutes = k.routes('users', {
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
            },
        }),
    });
    const streamContract = defineConfig({
        ...config,
        routes: {
            assistant: streamRoutes,
        },
    }).api;
    const api = new KizunaTanstackQuery(
        apiClientFor(streamContract, {
            baseUrl: '',
        })
    );
    const options = api.assistant.reply.streamOptions({
        input: {
            body: {
                prompt: 'hi',
            },
        },
        refetchMode: 'append',
    });
    type Data = Awaited<ReturnType<Exclude<typeof options.queryFn, symbol>>>;
    expectTypeOf<Data[number]['event']>().toEqualTypeOf<'delta' | 'done'>();
    expectTypeOf<Data[number]['data']>().toEqualTypeOf<{ text: string } | { count: number }>();
    expectTypeOf<Data[number]['id']>().toEqualTypeOf<string | undefined>();
    expectTypeOf(api.assistant.reply).not.toHaveProperty('queryOptions');
    expectTypeOf(api.assistant.reply).not.toHaveProperty('mutationOptions');
});
