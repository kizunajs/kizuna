import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { QueryClient, skipToken } from '@tanstack/query-core';
import { Kizuna } from '@ts-kizuna/core';
import { defineConfig } from '@ts-kizuna/core';
import { KizunaTanstackQuery } from './proxy.js';
import { NonStreamResponseError, UndeclaredResponseError, isNonStreamResponseError, isUndeclaredResponseError } from './errors.js';

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
        auth: 'user',
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
    checkUser: k.route({
        method: 'HEAD',
        path: '/users/:id',
        responses: {
            200: z.object({}),
        },
    }),
});

const contract = defineConfig({
    ...config,
    routes: {
        users: routes,
    },
}).api;

const ok = { status: 200, body: { id: '1', name: 'Ada' }, headers: {} };

/**
 * A stand-in for the fetch client: the same nested shape, with every route a spy
 * resolving whatever the test needs.
 */
const buildClient = (result: unknown = ok) => {
    const route = () => vi.fn().mockResolvedValue(result);
    return {
        users: {
            listUsers: route(),
            getUser: route(),
            searchUsers: route(),
            createUser: route(),
            checkUser: route(),
        },
    };
};
const buildApi = (client: ReturnType<typeof buildClient>) => new KizunaTanstackQuery(contract, client as any);

const runQueryFn = (options: { queryFn: unknown }, context: Record<string, unknown> = {}) =>
    (options.queryFn as (context: unknown) => Promise<unknown>)({ signal: undefined, ...context });

describe('keys', () => {
    it('builds a full query key from the dotted route path and the input', () => {
        const api = buildApi(buildClient());

        expect(api.users.getUser.queryKey({ input: { params: { id: '1' } } })).toEqual([
            ['users', 'getUser'],
            { input: { params: { id: '1' } }, type: 'query' },
        ]);
    });

    it('omits input from the key when there is none', () => {
        const api = buildApi(buildClient());

        expect(api.users.listUsers.queryKey()).toEqual([['users', 'listUsers'], { type: 'query' }]);
    });

    it('distinguishes infinite keys from query keys', () => {
        const api = buildApi(buildClient());

        expect(api.users.searchUsers.infiniteKey()).toEqual([['users', 'searchUsers'], { type: 'infinite' }]);
    });

    it('gives groups and routes a partial key that prefixes their operations', () => {
        const api = buildApi(buildClient());

        expect(api.users.key()).toEqual([['users']]);
        expect(api.users.getUser.key()).toEqual([['users', 'getUser']]);
        expect(api.key()).toEqual([[]]);
    });

    it('keeps fetchOptions out of the key, so a fresh signal is not a cache miss', () => {
        const api = buildApi(buildClient());
        const controller = new AbortController();

        const key = api.users.getUser.queryOptions({
            input: {
                params: { id: '1' },
                fetchOptions: { signal: controller.signal },
            },
        }).queryKey;

        expect(key).toEqual([['users', 'getUser'], { input: { params: { id: '1' } }, type: 'query' }]);
    });

    it('drops the input entirely when fetchOptions was all of it', () => {
        const api = buildApi(buildClient());

        const key = api.users.listUsers.queryOptions({
            input: { fetchOptions: { cache: 'no-store' } },
        }).queryKey;

        expect(key).toEqual([['users', 'listUsers'], { type: 'query' }]);
    });

    it('gives a mutation its own full key', () => {
        const api = buildApi(buildClient());

        expect(api.users.createUser.mutationKey()).toEqual([['users', 'createUser']]);
    });
});

describe('query and mutation split', () => {
    it('gives GET routes query factories', () => {
        const api = buildApi(buildClient());

        expect(api.users.listUsers).toHaveProperty('queryOptions');
        expect(api.users.listUsers).toHaveProperty('infiniteOptions');
        expect(api.users.listUsers).not.toHaveProperty('mutationOptions');
    });

    it('treats HEAD as a query', () => {
        const api = buildApi(buildClient());

        expect(api.users.checkUser).toHaveProperty('queryOptions');
    });

    it('gives other methods mutation factories', () => {
        const api = buildApi(buildClient());

        expect(api.users.createUser).toHaveProperty('mutationOptions');
        expect(api.users.createUser).not.toHaveProperty('queryOptions');
    });
});

describe('declared statuses', () => {
    it('returns a declared status as data', async () => {
        const api = buildApi(buildClient({ status: 404, body: { title: 'Not found' }, headers: {} }));

        const result = await runQueryFn(api.users.getUser.queryOptions({ input: { params: { id: '1' } } }));

        expect(result).toEqual({ status: 404, body: { title: 'Not found' }, headers: {} });
    });

    it('throws on a status the contract does not declare', async () => {
        const api = buildApi(buildClient({ status: 500, body: { message: 'boom' }, headers: { 'x-trace': 'abc' } }));

        const promise = runQueryFn(api.users.getUser.queryOptions({ input: { params: { id: '1' } } }));

        await expect(promise).rejects.toBeInstanceOf(UndeclaredResponseError);
        await expect(promise).rejects.toMatchObject({
            status: 500,
            body: { message: 'boom' },
            headers: { 'x-trace': 'abc' },
        });
    });

    it('names the route in the thrown message', async () => {
        const api = buildApi(buildClient({ status: 503, body: undefined, headers: {} }));

        await expect(runQueryFn(api.users.getUser.queryOptions({ input: { params: { id: '1' } } }))).rejects.toThrow(
            'users.getUser responded 503, which its contract does not declare.'
        );
    });

    it('treats the 401 the auth map added as declared, on a route that never declared it', async () => {
        const guardedKUser = k.identity.bearer({
            context: z.object({
                userId: z.string(),
            }),
        });
        const guardedKConfig = {
            identities: {
                user: guardedKUser,
            },
        };
        const guardedK = new Kizuna<{
            identities: {
                user: typeof guardedKUser;
            };
        }>();
        const guardedContract = defineConfig({
            ...guardedKConfig,
            routes: {
                users: guardedK.routes({
                    getUser: guardedK.route({
                        method: 'GET',
                        path: '/users/:id',
                        auth: 'user',
                        responses: {
                            200: UserSchema,
                        },
                    }),
                }),
            },
        }).api;
        const api = new KizunaTanstackQuery(guardedContract, {
            users: {
                getUser: vi.fn().mockResolvedValue({ status: 401, body: { detail: 'Unauthorized' }, headers: {} }),
            },
        } as never);

        const result = await runQueryFn(api.users.getUser.queryOptions({ input: { params: { id: '1' } } }));

        expect(result).toMatchObject({ status: 401 });
    });

    it('treats the automatic 400 as declared when the route has a query schema', async () => {
        const api = buildApi(buildClient({ status: 400, body: { errors: [] }, headers: {} }));

        const result = await runQueryFn(api.users.searchUsers.queryOptions({ input: { query: { term: 'ada' } } }));

        expect(result).toMatchObject({ status: 400 });
    });

    it('treats the automatic 400 as declared when the route has a body schema', async () => {
        const api = buildApi(buildClient({ status: 400, body: { errors: [] }, headers: {} }));
        const options = api.users.createUser.mutationOptions();

        const result = await options.mutationFn({ body: { name: '' } });

        expect(result).toMatchObject({ status: 400 });
    });

    it('throws a 400 on a route declaring neither body nor query', async () => {
        const api = buildApi(buildClient({ status: 400, body: {}, headers: {} }));

        await expect(runQueryFn(api.users.getUser.queryOptions({ input: { params: { id: '1' } } }))).rejects.toBeInstanceOf(
            UndeclaredResponseError
        );
    });

    it('narrows the thrown error with isUndeclaredResponseError', async () => {
        const api = buildApi(buildClient({ status: 500, body: null, headers: {} }));

        try {
            await runQueryFn(api.users.getUser.queryOptions({ input: { params: { id: '1' } } }));
            expect.unreachable('should have thrown');
        } catch (error) {
            expect(isUndeclaredResponseError(error)).toBe(true);
        }
    });

    it('does not treat an ordinary error as an undeclared response', () => {
        expect(isUndeclaredResponseError(new Error('nope'))).toBe(false);
    });
});

describe('calling the client', () => {
    it('passes the input straight through', async () => {
        const client = buildClient();
        const api = buildApi(client);

        await runQueryFn(api.users.getUser.queryOptions({ input: { params: { id: '7' } } }));

        expect(client.users.getUser).toHaveBeenCalledWith({ params: { id: '7' } });
    });

    it("forwards TanStack's signal into fetchOptions", async () => {
        const client = buildClient();
        const api = buildApi(client);
        const controller = new AbortController();

        await runQueryFn(api.users.getUser.queryOptions({ input: { params: { id: '1' } } }), { signal: controller.signal });

        expect(client.users.getUser).toHaveBeenCalledWith({
            params: { id: '1' },
            fetchOptions: { signal: controller.signal },
        });
    });

    it("leaves a caller's own signal alone", async () => {
        const client = buildClient();
        const api = buildApi(client);
        const own = new AbortController();
        const tanstack = new AbortController();

        await runQueryFn(
            api.users.getUser.queryOptions({
                input: {
                    params: { id: '1' },
                    fetchOptions: { signal: own.signal },
                },
            }),
            { signal: tanstack.signal }
        );

        expect(client.users.getUser).toHaveBeenCalledWith({
            params: { id: '1' },
            fetchOptions: { signal: own.signal },
        });
    });

    it('passes mutation variables as the call arguments', async () => {
        const client = buildClient({ status: 201, body: { id: '1', name: 'Ada' }, headers: {} });
        const api = buildApi(client);

        await api.users.createUser.mutationOptions().mutationFn({ body: { name: 'Ada' } });

        expect(client.users.createUser).toHaveBeenCalledWith({ body: { name: 'Ada' } });
    });

    it('exposes call as a direct route call', async () => {
        const client = buildClient();
        const api = buildApi(client);

        await api.users.getUser.call({ params: { id: '3' } });

        expect(client.users.getUser).toHaveBeenCalledWith({ params: { id: '3' } });
    });

    it('runs the page-param function for infinite queries', async () => {
        const client = buildClient({ status: 200, body: { users: [], nextCursor: null }, headers: {} });
        const api = buildApi(client);

        const options = api.users.searchUsers.infiniteOptions({
            input: (cursor: number | undefined) => ({ query: { term: 'ada', cursor } }),
            initialPageParam: undefined,
            getNextPageParam: () => null,
        });

        await runQueryFn(options, { pageParam: 20 });

        expect(client.users.searchUsers).toHaveBeenCalledWith({ query: { term: 'ada', cursor: 20 } });
    });
});

describe('skipToken', () => {
    it('disables the query and keeps the input out of the key', () => {
        const api = buildApi(buildClient());

        const options = api.users.getUser.queryOptions({ input: skipToken });

        expect(options.queryFn).toBe(skipToken);
        expect(options.queryKey).toEqual([['users', 'getUser'], { type: 'query' }]);
    });

    it('disables an infinite query', () => {
        const api = buildApi(buildClient());

        const options = api.users.searchUsers.infiniteOptions({
            input: skipToken,
            initialPageParam: undefined,
            getNextPageParam: () => null,
        });

        expect(options.queryFn).toBe(skipToken);
    });
});

describe('passthrough', () => {
    it('keeps the caller options and drops input', () => {
        const api = buildApi(buildClient());

        const options = api.users.getUser.queryOptions({
            input: { params: { id: '1' } },
            staleTime: 60_000,
            retry: 3,
        });

        expect(options).toMatchObject({ staleTime: 60_000, retry: 3 });
        expect(options).not.toHaveProperty('input');
    });

    it('keeps the caller options on a mutation', () => {
        const api = buildApi(buildClient());
        const onSuccess = () => {};

        expect(api.users.createUser.mutationOptions({ onSuccess })).toMatchObject({ onSuccess });
    });
});

describe('name collisions', () => {
    it('lets a route named like a factory win over it', () => {
        const collidingRoutes = k.routes('users', {
            key: k.route({
                method: 'GET',
                path: '/key',
                responses: {
                    200: z.object({ value: z.string() }),
                },
            }),
        });
        const collidingContract = defineConfig({
            ...config,
            routes: {
                users: collidingRoutes,
            },
        }).api;
        const client = { users: { key: vi.fn().mockResolvedValue(ok) } };
        const api = new KizunaTanstackQuery(collidingContract, client as any);

        expect(api.users.key).toHaveProperty('queryOptions');
    });
});

describe('streams', () => {
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
                    },
                },
                404: z.object({
                    detail: z.string(),
                }),
            },
        }),
    });
    const streamContract = defineConfig({
        ...config,
        routes: {
            assistant: streamRoutes,
        },
    }).api;
    const messages = [
        { event: 'delta', data: { text: 'a' } },
        { event: 'delta', data: { text: 'b' } },
    ];
    const streamedBody = async function* () {
        for (const message of messages) yield message;
    };
    const buildStreamApi = (result: unknown) =>
        new KizunaTanstackQuery(streamContract, {
            assistant: {
                reply: vi.fn().mockResolvedValue(result),
            },
        } as any);
    const input = {
        body: {
            prompt: 'hi',
        },
    };

    it('offers streamOptions and keys typed stream, and nothing for the cache to hold', () => {
        const api = buildStreamApi({ status: 200, body: streamedBody(), headers: {} });
        expect(api.assistant.reply.streamKey({ input })).toEqual([['assistant', 'reply'], { input, type: 'stream' }]);
        expect(api.assistant.reply.key()).toEqual([['assistant', 'reply']]);
        expect('queryOptions' in api.assistant.reply).toBe(false);
        expect('mutationOptions' in api.assistant.reply).toBe(false);
    });

    it('accumulates the messages as data through TanStack streamedQuery', async () => {
        const api = buildStreamApi({ status: 200, body: streamedBody(), headers: {} });
        const queryClient = new QueryClient();
        const data = await queryClient.fetchQuery(api.assistant.reply.streamOptions({ input }));
        expect(data).toEqual(messages);
    });

    it('rejects with NonStreamResponseError when the route answers a status that does not stream', async () => {
        const api = buildStreamApi({ status: 404, body: { detail: 'gone' }, headers: {} });
        const queryClient = new QueryClient();
        const error = await queryClient
            .fetchQuery(api.assistant.reply.streamOptions({ input, retry: false }))
            .catch((caught: unknown) => caught);
        expect(isNonStreamResponseError(error)).toBe(true);
        expect((error as NonStreamResponseError).status).toBe(404);
    });

    it('honours skipToken', () => {
        const api = buildStreamApi({ status: 200, body: streamedBody(), headers: {} });
        const options = api.assistant.reply.streamOptions({ input: skipToken });
        expect(options.queryFn).toBe(skipToken);
        expect(options.queryKey).toEqual([['assistant', 'reply'], { type: 'stream' }]);
    });
});
