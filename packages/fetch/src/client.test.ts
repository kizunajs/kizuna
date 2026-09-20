import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { defineConfig } from 'kizunajs';
import { createGeneratedClient, type Client, type ClientConfig, type ContextHeaderInputs, type GeneratedRoutes } from './client.js';
import type { ApiDefinition, RequestContextSchema, Routes, SecurityScheme, TagOptions } from 'kizunajs';

/**
 * A client over an assembled api's routes. The generated client hands the same
 * runtime its own table; the fields that runtime reads are the same either way.
 */
const apiClientFor = <
    T extends Routes,
    Codes extends string = never,
    Schemes extends Record<string, SecurityScheme> = Record<string, never>,
    RequestContext extends Record<string, RequestContextSchema> = Record<string, never>,
>(
    api: ApiDefinition<T, Record<string, TagOptions>, Codes, Schemes, RequestContext>,
    config: ClientConfig &
        ({} extends ContextHeaderInputs<RequestContext>
            ? { requestContext?: ContextHeaderInputs<RequestContext> }
            : { requestContext: ContextHeaderInputs<RequestContext> })
): Client<T, Codes> => createGeneratedClient(api.routes as unknown as GeneratedRoutes, config) as unknown as Client<T, Codes>;

interface Config {
    tags: typeof kTags;
}

const k = new Kizuna<Config>();

const kTags = k.tags({
    api: 'API',
});
const config = {
    tags: kTags,
};

const contractRoutes = k.routes('api', {
    getUser: k.route({
        method: 'GET',
        path: '/users/:id',
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
                name: z.string(),
            }),
        },
    }),
    listUsers: k.route({
        method: 'GET',
        path: '/users',
        query: z.object({
            page: z.number().optional(),
        }),
        responses: {
            200: z.object({
                users: z.array(z.string()),
            }),
        },
    }),
    uploadAvatar: k.route({
        method: 'POST',
        path: '/avatar',
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
});

const contract = defineConfig({
    ...config,
    routes: contractRoutes,
}).api;

const nestedContractRoutes = k.routes('api', {
    users: {
        getUser: k.route({
            method: 'GET',
            path: '/users/:id',
            responses: {
                200: z.object({
                    id: z.string(),
                    name: z.string(),
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
                    name: z.string(),
                }),
            },
        }),
    },
    posts: {
        listPosts: k.route({
            method: 'GET',
            path: '/posts',
            responses: {
                200: z.object({
                    posts: z.array(z.string()),
                }),
            },
        }),
    },
});

const nestedContract = defineConfig({
    ...config,
    routes: nestedContractRoutes,
}).api;

const stubFetch = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    vi.fn().mockResolvedValue({
        status,
        text: () => Promise.resolve(JSON.stringify(body)),
        headers: {
            forEach: (callback: (value: string, key: string) => void) => {
                for (const [key, value] of Object.entries(headers)) callback(value, key);
            },
        },
    });

describe('KizunaClient', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('builds correct URL for GET with path params', async () => {
        const fetchMock = stubFetch(200, {
            id: '123',
            name: 'Alice',
        });
        const client = apiClientFor(contract, {
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        await client.getUser({
            params: {
                id: '123',
            },
        });

        const call = fetchMock.mock.calls[0]!;
        const [url, options] = call as [string, RequestInit & { headers: Headers }];
        expect(url).toBe('http://localhost:3000/users/123');
        expect(options.method).toBe('GET');
    });

    it('preserves baseUrl path prefix', async () => {
        const fetchMock = stubFetch(200, {
            users: [],
        });
        const client = apiClientFor(contract, {
            baseUrl: 'http://localhost:3000/api/v1',
            fetch: fetchMock,
        });

        await client.listUsers({
            query: {},
        });

        const [url] = fetchMock.mock.calls[0]! as [string];
        expect(url).toBe('http://localhost:3000/api/v1/users');
    });

    it('JSON-encodes the body and sets Content-Type', async () => {
        const fetchMock = stubFetch(201, {
            id: '1',
            name: 'Alice',
        });
        const client = apiClientFor(contract, {
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        await client.createUser({
            body: {
                name: 'Alice',
            },
        });

        const [, options] = fetchMock.mock.calls[0]! as [string, RequestInit & { headers: Headers; body: string }];
        expect(options.method).toBe('POST');
        expect(JSON.parse(options.body)).toEqual({
            name: 'Alice',
        });
        expect(options.headers.get('Content-Type')).toBe('application/json');
    });

    it('appends query parameters', async () => {
        const fetchMock = stubFetch(200, {
            users: [],
        });
        const client = apiClientFor(contract, {
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        await client.listUsers({
            query: {
                page: 2,
            },
        });

        const [url] = fetchMock.mock.calls[0]! as [string];
        expect(url).toContain('page=2');
    });

    it('returns the parsed status and body', async () => {
        const fetchMock = stubFetch(200, {
            id: '1',
            name: 'Alice',
        });
        const client = apiClientFor(contract, {
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        const result = await client.getUser({
            params: {
                id: '1',
            },
        });

        expect(result.status).toBe(200);
        expect(result.body).toEqual({
            id: '1',
            name: 'Alice',
        });
    });

    it('returns response headers from the fetch response', async () => {
        const fetchMock = stubFetch(200, { id: '1', name: 'Alice' }, { 'x-request-id': 'trace-123' });
        const client = apiClientFor(contract, {
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        const result = await client.getUser({
            params: {
                id: '1',
            },
        });

        expect(result.headers['x-request-id']).toBe('trace-123');
    });

    it('forwards baseHeaders', async () => {
        const fetchMock = stubFetch(200, {
            id: '1',
            name: 'Alice',
        });
        const client = apiClientFor(contract, {
            baseUrl: 'http://localhost:3000',
            baseHeaders: {
                Authorization: 'Bearer token123',
            },
            fetch: fetchMock,
        });

        await client.getUser({
            params: {
                id: '1',
            },
        });

        const [, options] = fetchMock.mock.calls[0]! as [string, RequestInit & { headers: Headers }];
        expect(options.headers.get('Authorization')).toBe('Bearer token123');
    });

    it('serializes multipart/form-data body as FormData and omits Content-Type', async () => {
        const fetchMock = stubFetch(200, {
            ok: true,
        });
        const client = apiClientFor(contract, {
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        const file = new File(['hello world'], 'avatar.txt', {
            type: 'text/plain',
        });
        await client.uploadAvatar({
            body: {
                file,
                userId: 'u1',
            },
        });

        const [, options] = fetchMock.mock.calls[0]! as [string, RequestInit & { headers: Headers }];
        expect(options.body).toBeInstanceOf(FormData);
        const form = options.body as FormData;
        expect(form.get('userId')).toBe('u1');
        const sent = form.get('file');
        expect(sent).toBeInstanceOf(File);
        expect(await (sent as File).text()).toBe('hello world');
        expect(options.headers.get('Content-Type')).toBeNull();
        expect(options.headers.get('content-type')).toBeNull();
    });

    it('serializes application/x-www-form-urlencoded body as URLSearchParams', async () => {
        const fetchMock = stubFetch(200, {
            ok: true,
        });
        const client = apiClientFor(contract, {
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        await client.submitForm({
            body: {
                email: 'alice@example.com',
            },
        });

        const [, options] = fetchMock.mock.calls[0]! as [string, RequestInit & { headers: Headers; body: URLSearchParams }];
        expect(options.body).toBeInstanceOf(URLSearchParams);
        expect(options.body.get('email')).toBe('alice@example.com');
        expect(options.headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
    });

    it('still JSON-encodes when contentType is undefined (regression guard)', async () => {
        const fetchMock = stubFetch(201, {
            id: '1',
            name: 'Alice',
        });
        const client = apiClientFor(contract, {
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        await client.createUser({
            body: {
                name: 'Alice',
            },
        });

        const [, options] = fetchMock.mock.calls[0]! as [string, RequestInit & { headers: Headers; body: string }];
        expect(typeof options.body).toBe('string');
        expect(options.headers.get('Content-Type')).toBe('application/json');
    });
});

describe('KizunaClient: onRequest', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('adds headers via onRequest before the fetch call', async () => {
        const fetchMock = stubFetch(200, { id: '1', name: 'Alice' });
        const client = apiClientFor(contract, {
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
            onRequest: ({ headers }) => {
                headers.set('Authorization', 'Bearer my-token');
            },
        });

        await client.getUser({ params: { id: '1' } });

        const [, options] = fetchMock.mock.calls[0]! as [string, RequestInit & { headers: Headers }];
        expect(options.headers.get('Authorization')).toBe('Bearer my-token');
    });

    it('supports async onRequest', async () => {
        const fetchMock = stubFetch(200, { id: '1', name: 'Alice' });
        const client = apiClientFor(contract, {
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
            onRequest: async ({ headers }) => {
                const token = await Promise.resolve('async-token');
                headers.set('Authorization', `Bearer ${token}`);
            },
        });

        await client.getUser({ params: { id: '1' } });

        const [, options] = fetchMock.mock.calls[0]! as [string, RequestInit & { headers: Headers }];
        expect(options.headers.get('Authorization')).toBe('Bearer async-token');
    });

    it('receives route metadata in onRequest', async () => {
        const fetchMock = stubFetch(200, { id: '1', name: 'Alice' });
        const receivedRoutes: string[] = [];
        const client = apiClientFor(contract, {
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
            onRequest: ({ route, method }) => {
                receivedRoutes.push(`${method} ${route.path}`);
            },
        });

        await client.getUser({ params: { id: '1' } });

        expect(receivedRoutes).toEqual(['GET /users/:id']);
    });

    it('merges onRequest headers with baseHeaders', async () => {
        const fetchMock = stubFetch(200, { id: '1', name: 'Alice' });
        const client = apiClientFor(contract, {
            baseUrl: 'http://localhost:3000',
            baseHeaders: { 'X-App': 'test' },
            fetch: fetchMock,
            onRequest: ({ headers }) => {
                headers.set('Authorization', 'Bearer token');
            },
        });

        await client.getUser({ params: { id: '1' } });

        const [, options] = fetchMock.mock.calls[0]! as [string, RequestInit & { headers: Headers }];
        expect(options.headers.get('X-App')).toBe('test');
        expect(options.headers.get('Authorization')).toBe('Bearer token');
    });
});

describe('KizunaClient: nested routers', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('builds correct URL for a route inside a nested router', async () => {
        const fetchMock = stubFetch(200, {
            id: '42',
            name: 'Bob',
        });
        const client = apiClientFor(nestedContract, {
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        await client.users.getUser({
            params: {
                id: '42',
            },
        });

        const [url, options] = fetchMock.mock.calls[0]! as [string, RequestInit];
        expect(url).toBe('http://localhost:3000/users/42');
        expect(options.method).toBe('GET');
    });

    it('JSON-encodes body for a POST route inside a nested router', async () => {
        const fetchMock = stubFetch(201, {
            id: '1',
            name: 'Carol',
        });
        const client = apiClientFor(nestedContract, {
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        await client.users.createUser({
            body: {
                name: 'Carol',
            },
        });

        const [, options] = fetchMock.mock.calls[0]! as [string, RequestInit & { headers: Headers; body: string }];
        expect(options.method).toBe('POST');
        expect(JSON.parse(options.body)).toEqual({
            name: 'Carol',
        });
        expect(options.headers.get('Content-Type')).toBe('application/json');
    });

    it('resolves a sibling sub-router independently', async () => {
        const fetchMock = stubFetch(200, {
            posts: ['hello', 'world'],
        });
        const client = apiClientFor(nestedContract, {
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        const result = await client.posts.listPosts();

        const [url, options] = fetchMock.mock.calls[0]! as [string, RequestInit];
        expect(url).toBe('http://localhost:3000/posts');
        expect(options.method).toBe('GET');
        expect(result.status).toBe(200);
        expect(result.body).toEqual({
            posts: ['hello', 'world'],
        });
    });
});

describe('KizunaClient: relative baseUrl', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('builds a relative URL with path params', async () => {
        const fetchMock = stubFetch(200, {
            id: '123',
            name: 'Alice',
        });
        const client = apiClientFor(contract, {
            baseUrl: '/api',
            fetch: fetchMock,
        });

        await client.getUser({
            params: {
                id: '123',
            },
        });

        const [url] = fetchMock.mock.calls[0]! as [string];
        expect(url).toBe('/api/users/123');
    });

    it('appends query params to a relative URL', async () => {
        const fetchMock = stubFetch(200, {
            users: [],
        });
        const client = apiClientFor(contract, {
            baseUrl: '/api',
            fetch: fetchMock,
        });

        await client.listUsers({
            query: {
                page: 2,
            },
        });

        const [url] = fetchMock.mock.calls[0]! as [string];
        expect(url).toBe('/api/users?page=2');
    });

    it('works with an empty baseUrl', async () => {
        const fetchMock = stubFetch(200, {
            id: '1',
            name: 'Alice',
        });
        const client = apiClientFor(contract, {
            baseUrl: '',
            fetch: fetchMock,
        });

        await client.getUser({
            params: {
                id: '1',
            },
        });

        const [url] = fetchMock.mock.calls[0]! as [string];
        expect(url).toBe('/users/1');
    });

    it('preserves a relative baseUrl path prefix with path params', async () => {
        const fetchMock = stubFetch(200, {
            id: '42',
            name: 'Bob',
        });
        const client = apiClientFor(contract, {
            baseUrl: '/api/v1',
            fetch: fetchMock,
        });

        await client.getUser({
            params: {
                id: '42',
            },
        });

        const [url] = fetchMock.mock.calls[0]! as [string];
        expect(url).toBe('/api/v1/users/42');
    });

    it('provides the correct url string in onRequest', async () => {
        const fetchMock = stubFetch(200, {
            id: '1',
            name: 'Alice',
        });
        let receivedUrl = '';
        const client = apiClientFor(contract, {
            baseUrl: '/api',
            fetch: fetchMock,
            onRequest: ({ url }) => {
                receivedUrl = url;
            },
        });

        await client.getUser({
            params: {
                id: '1',
            },
        });

        expect(receivedUrl).toBe('/api/users/1');
    });
});

describe('requestContext on the client initializer', () => {
    const analytics = k.requestContext({
        headers: z.object({
            'x-session-id': z.string().optional(),
        }),
        context: z.object({
            sessionId: z.string().nullable(),
        }),
    });

    const ctxKConfig = {
        requestContext: {
            analytics,
        },
    };
    const ctxK = new Kizuna<{
        requestContext: {
            analytics: typeof analytics;
        };
    }>();

    const ctxContract = defineConfig({
        ...ctxKConfig,
        routes: {
            users: ctxK.routes({
                listUsers: ctxK.route({
                    method: 'GET',
                    path: '/users',
                    responses: {
                        200: z.object({
                            ok: z.boolean(),
                        }),
                    },
                }),
            }),
        },
    }).api;

    it('sends requestContext values as headers on every request', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
        const ctxClient = apiClientFor(ctxContract, {
            baseUrl: 'https://api.example.com',
            fetch: fetchMock as unknown as typeof fetch,
            requestContext: {
                'x-session-id': 's1',
            },
        });
        await ctxClient.users.listUsers();
        const requestInit = (fetchMock.mock.calls[0] as unknown[])[1] as { headers: Headers };
        expect(requestInit.headers.get('x-session-id')).toBe('s1');
    });

    it('omits undefined values', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
        const ctxClient = apiClientFor(ctxContract, {
            baseUrl: 'https://api.example.com',
            fetch: fetchMock as unknown as typeof fetch,
            requestContext: {
                'x-session-id': undefined,
            },
        });
        await ctxClient.users.listUsers();
        const requestInit = (fetchMock.mock.calls[0] as unknown[])[1] as { headers: Headers };
        expect(requestInit.headers.get('x-session-id')).toBeNull();
    });
});

const activityRoutes = k.routes('api', {
    getActivity: k.route({
        method: 'GET',
        path: '/activity',
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
});

const activityContract = defineConfig({
    ...config,
    routes: activityRoutes,
}).api;

describe('discriminated union response built from named models', () => {
    it('switches over the response body and narrows the started branch', async () => {
        const client = apiClientFor(activityContract, {
            baseUrl: 'http://localhost:3000',
            fetch: stubFetch(200, {
                kind: 'started',
                at: '2026-08-04T10:00:00Z',
            }),
        });

        const result = await client.getActivity();
        expect(result.status).toBe(200);
        if (result.status !== 200) throw new Error('expected 200');

        let summary: string;
        switch (result.body.kind) {
            case 'started':
                summary = `started at ${result.body.at}`;
                break;
            case 'done':
                summary = result.body.ok ? 'finished' : 'failed';
                break;
            default: {
                const exhaustive: never = result.body;
                throw new Error(`unhandled event: ${JSON.stringify(exhaustive)}`);
            }
        }

        expect(summary).toBe('started at 2026-08-04T10:00:00Z');
    });

    it('switches over the response body and narrows the done branch', async () => {
        const client = apiClientFor(activityContract, {
            baseUrl: 'http://localhost:3000',
            fetch: stubFetch(200, {
                kind: 'done',
                ok: false,
            }),
        });

        const result = await client.getActivity();
        if (result.status !== 200) throw new Error('expected 200');

        let summary: string;
        switch (result.body.kind) {
            case 'started':
                summary = `started at ${result.body.at}`;
                break;
            case 'done':
                summary = result.body.ok ? 'finished' : 'failed';
                break;
            default: {
                const exhaustive: never = result.body;
                throw new Error(`unhandled event: ${JSON.stringify(exhaustive)}`);
            }
        }

        expect(summary).toBe('failed');
    });

    it('types the discriminator as a closed literal union, not string', async () => {
        const client = apiClientFor(activityContract, {
            baseUrl: 'http://localhost:3000',
            fetch: stubFetch(200, {
                kind: 'done',
                ok: true,
            }),
        });

        const result = await client.getActivity();
        if (result.status !== 200) throw new Error('expected 200');

        switch (result.body.kind) {
            // @ts-expect-error 'cancelled' is not one of the contract's discriminator literals
            case 'cancelled':
                throw new Error('unreachable');
            default:
                expect(result.body.kind).toBe('done');
        }
    });
});

describe('streams', () => {
    const streamRoutes = k.routes('api', {
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
                400: z.object({
                    type: z.string(),
                    title: z.string(),
                    status: z.number(),
                    detail: z.string(),
                }),
            },
        }),
        ticks: k.route({
            method: 'GET',
            path: '/ticks',
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
            responses: {
                200: {
                    stream: z.string(),
                    contentType: 'text/plain',
                },
            },
        }),
    });
    const streamContract = defineConfig({
        ...config,
        routes: streamRoutes,
    }).api;

    const streamOf = (chunks: string[]): ReadableStream<Uint8Array> => {
        const encoder = new TextEncoder();
        return new ReadableStream({
            start(controller) {
                for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
                controller.close();
            },
        });
    };

    const clientFor = (chunks: string[], status = 200, contentType = 'text/event-stream') =>
        apiClientFor(streamContract, {
            baseUrl: 'http://api',
            fetch: async () =>
                new Response(streamOf(chunks), {
                    status,
                    headers: {
                        'content-type': contentType,
                    },
                }),
        });

    const collect = async <T>(iterable: AsyncIterable<T>): Promise<T[]> => {
        const items: T[] = [];
        for await (const item of iterable) items.push(item);
        return items;
    };

    it('parses named events split across chunks, with comments dropped and id and retry kept', async () => {
        const result = await clientFor([
            'event: delta\ndata: {"te',
            'xt":"a"}\n\n: keep-alive\n\nevent: done\r\ndata: {"count":1}\r\nid: evt-1\r\nretry: 5000\r\n\r\n',
        ]).reply({
            body: {
                prompt: 'hi',
            },
        });
        expect(result.status).toBe(200);
        if (result.status !== 200) return;
        expect(await collect(result.body)).toEqual([
            {
                event: 'delta',
                data: {
                    text: 'a',
                },
            },
            {
                event: 'done',
                data: {
                    count: 1,
                },
                id: 'evt-1',
                retry: 5000,
            },
        ]);
    });

    it('joins multi-line data and discards an incomplete trailing event', async () => {
        const result = await clientFor(['data: {"tick":\ndata: 1}\n\ndata: {"tick":2}']).ticks();
        if (result.status !== 200) return;
        expect(await collect(result.body)).toEqual([
            {
                data: {
                    tick: 1,
                },
            },
        ]);
    });

    it('reads a text stream as string chunks', async () => {
        const result = await clientFor(['one\n', 'two\n'], 200, 'text/plain').lines();
        if (result.status !== 200) return;
        expect(await collect(result.body)).toEqual(['one\n', 'two\n']);
    });

    it('buffers a non-stream status as before', async () => {
        const result = await clientFor(
            ['{"type":"about:blank","title":"Bad Request","status":400,"detail":"nope"}'],
            400,
            'application/problem+json'
        ).reply({
            body: {
                prompt: 'hi',
            },
        });
        expect(result.status).toBe(400);
        if (result.status !== 400) return;
        expect(result.body.detail).toBe('nope');
    });

    it('rejects the loop when the connection ends with an error', async () => {
        const failing = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('data: {"tick":1}\n\n'));
                controller.error(new Error('terminated'));
            },
        });
        const client = apiClientFor(streamContract, {
            baseUrl: 'http://api',
            fetch: async () =>
                new Response(failing, {
                    status: 200,
                    headers: {
                        'content-type': 'text/event-stream',
                    },
                }),
        });
        const result = await client.ticks();
        if (result.status !== 200) return;
        await expect(collect(result.body)).rejects.toThrow('terminated');
    });
});
