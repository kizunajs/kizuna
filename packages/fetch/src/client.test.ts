import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from './generated/api.js';

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
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        await client.users.getUser({
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
        const client = createClient({
            baseUrl: 'http://localhost:3000/api/v1',
            fetch: fetchMock,
        });

        await client.users.listUsers({
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
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        await client.users.createUser({
            body: {
                name: 'Alice',
                email: 'alice@example.com',
            },
        });

        const [, options] = fetchMock.mock.calls[0]! as [string, RequestInit & { headers: Headers; body: string }];
        expect(options.method).toBe('POST');
        expect(JSON.parse(options.body)).toEqual({
            name: 'Alice',
            email: 'alice@example.com',
        });
        expect(options.headers.get('Content-Type')).toBe('application/json');
    });

    it('sends a bigint in a JSON body as a string of its digits', async () => {
        const fetchMock = stubFetch(200, {
            ok: true,
            bytesUsed: '9007199254740993',
        });
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        await client.payloads.nestedTyped({
            body: {
                filters: {
                    price: 99,
                    createdAt: '2026-01-01T00:00:00.000Z',
                    tags: [],
                },
                scores: [],
                pair: [1, 'two'],
                quota: 9007199254740993n,
            },
        });

        const [, options] = fetchMock.mock.calls[0]! as [string, RequestInit & { body: string }];
        expect(options.body).toContain('"quota":"9007199254740993"');
    });

    it('reads a binary body as the bytes the server sent', async () => {
        const badge = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            fetch: () =>
                Promise.resolve(
                    new Response(badge, {
                        headers: {
                            'content-type': 'application/octet-stream',
                        },
                    })
                ),
        });

        const result = await client.downloads.badge();

        expect(result.body).toEqual(badge);
    });

    it('appends query parameters', async () => {
        const fetchMock = stubFetch(200, {
            users: [],
        });
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        await client.users.listUsers({
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
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        const result = await client.users.getUser({
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
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        const result = await client.users.getUser({
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
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            baseHeaders: {
                Authorization: 'Bearer token123',
            },
            fetch: fetchMock,
        });

        await client.users.getUser({
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
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        const file = new File(['hello world'], 'avatar.txt', {
            type: 'text/plain',
        });
        await client.forms.uploadAvatar({
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

    it('sends a file given as bytes as a file part', async () => {
        const fetchMock = stubFetch(200, {
            ok: true,
        });
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        await client.forms.uploadAvatar({
            body: {
                file: new Uint8Array([137, 80, 78, 71]),
                userId: '1',
            },
        });

        const [, options] = fetchMock.mock.calls[0]! as [string, RequestInit & { body: FormData }];
        const file = options.body.get('file');
        expect(file).toBeInstanceOf(Blob);
        expect(new Uint8Array(await (file as Blob).arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
    });

    it('sends a FormData body as it is', async () => {
        const fetchMock = stubFetch(200, {
            ok: true,
        });
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });
        const formData = new FormData();
        formData.append('userId', '1');

        await client.forms.uploadAvatar({
            body: formData,
        });

        const [, options] = fetchMock.mock.calls[0]! as [string, RequestInit & { body: FormData }];
        expect(options.body).toBe(formData);
    });

    it('sends a bigint form field as its digits', async () => {
        const fetchMock = stubFetch(200, {
            ok: true,
        });
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        await client.forms.uploadAvatar({
            body: {
                file: new File(['avatar'], 'avatar.png'),
                userId: '1',
                bytesLimit: 9007199254740993n,
            },
        });

        const [, options] = fetchMock.mock.calls[0]! as [string, RequestInit & { body: FormData }];
        expect(options.body.get('bytesLimit')).toBe('9007199254740993');
    });

    it('serializes application/x-www-form-urlencoded body as URLSearchParams', async () => {
        const fetchMock = stubFetch(200, {
            ok: true,
        });
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        await client.forms.submitForm({
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
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        await client.users.createUser({
            body: {
                name: 'Alice',
                email: 'alice@example.com',
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
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
            onRequest: ({ headers }) => {
                headers.set('Authorization', 'Bearer my-token');
            },
        });

        await client.users.getUser({ params: { id: '1' } });

        const [, options] = fetchMock.mock.calls[0]! as [string, RequestInit & { headers: Headers }];
        expect(options.headers.get('Authorization')).toBe('Bearer my-token');
    });

    it('supports async onRequest', async () => {
        const fetchMock = stubFetch(200, { id: '1', name: 'Alice' });
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
            onRequest: async ({ headers }) => {
                const token = await Promise.resolve('async-token');
                headers.set('Authorization', `Bearer ${token}`);
            },
        });

        await client.users.getUser({ params: { id: '1' } });

        const [, options] = fetchMock.mock.calls[0]! as [string, RequestInit & { headers: Headers }];
        expect(options.headers.get('Authorization')).toBe('Bearer async-token');
    });

    it('receives route metadata in onRequest', async () => {
        const fetchMock = stubFetch(200, { id: '1', name: 'Alice' });
        const receivedRoutes: string[] = [];
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
            onRequest: ({ route, method }) => {
                receivedRoutes.push(`${method} ${route.path}`);
            },
        });

        await client.users.getUser({ params: { id: '1' } });

        expect(receivedRoutes).toEqual(['GET /users/:id']);
    });

    it('merges onRequest headers with baseHeaders', async () => {
        const fetchMock = stubFetch(200, { id: '1', name: 'Alice' });
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            baseHeaders: { 'X-App': 'test' },
            fetch: fetchMock,
            onRequest: ({ headers }) => {
                headers.set('Authorization', 'Bearer token');
            },
        });

        await client.users.getUser({ params: { id: '1' } });

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
        const client = createClient({
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
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
        });

        await client.users.createUser({
            body: {
                name: 'Carol',
                email: 'carol@example.com',
            },
        });

        const [, options] = fetchMock.mock.calls[0]! as [string, RequestInit & { headers: Headers; body: string }];
        expect(options.method).toBe('POST');
        expect(JSON.parse(options.body)).toEqual({
            name: 'Carol',
            email: 'carol@example.com',
        });
        expect(options.headers.get('Content-Type')).toBe('application/json');
    });

    it('resolves a sibling sub-router independently', async () => {
        const fetchMock = stubFetch(200, {
            posts: ['hello', 'world'],
        });
        const client = createClient({
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
        const client = createClient({
            baseUrl: '/api',
            fetch: fetchMock,
        });

        await client.users.getUser({
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
        const client = createClient({
            baseUrl: '/api',
            fetch: fetchMock,
        });

        await client.users.listUsers({
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
        const client = createClient({
            baseUrl: '',
            fetch: fetchMock,
        });

        await client.users.getUser({
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
        const client = createClient({
            baseUrl: '/api/v1',
            fetch: fetchMock,
        });

        await client.users.getUser({
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
        const client = createClient({
            baseUrl: '/api',
            fetch: fetchMock,
            onRequest: ({ url }) => {
                receivedUrl = url;
            },
        });

        await client.users.getUser({
            params: {
                id: '1',
            },
        });

        expect(receivedUrl).toBe('/api/users/1');
    });
});

describe('requestContext on the client initializer', () => {
    it('sends requestContext values as headers on every request', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
        const ctxClient = createClient({
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
        const ctxClient = createClient({
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

describe('discriminated union response built from named models', () => {
    it('switches over the response body and narrows the started branch', async () => {
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            fetch: stubFetch(200, {
                kind: 'started',
                at: '2026-08-04T10:00:00Z',
            }),
        });

        const result = await client.activity.getActivity();
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
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            fetch: stubFetch(200, {
                kind: 'done',
                ok: false,
            }),
        });

        const result = await client.activity.getActivity();
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
        const client = createClient({
            baseUrl: 'http://localhost:3000',
            fetch: stubFetch(200, {
                kind: 'done',
                ok: true,
            }),
        });

        const result = await client.activity.getActivity();
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
        createClient({
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
        ]).streams.reply({
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
        const result = await clientFor(['data: {"tick":\ndata: 1}\n\ndata: {"tick":2}']).streams.ticks();
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
        const result = await clientFor(['one\n', 'two\n'], 200, 'text/plain').streams.lines();
        if (result.status !== 200) return;
        expect(await collect(result.body)).toEqual(['one\n', 'two\n']);
    });

    it('reads a binary stream as byte chunks', async () => {
        const result = await clientFor(['ab'], 200, 'application/octet-stream').streams.bytes();
        if (result.status !== 200) return;
        expect(await collect(result.body)).toEqual([new TextEncoder().encode('ab')]);
    });

    it('buffers a non-stream status as before', async () => {
        const result = await clientFor(
            ['{"type":"about:blank","title":"Bad Request","status":400,"detail":"nope"}'],
            400,
            'application/problem+json'
        ).streams.reply({
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
        const client = createClient({
            baseUrl: 'http://api',
            fetch: async () =>
                new Response(failing, {
                    status: 200,
                    headers: {
                        'content-type': 'text/event-stream',
                    },
                }),
        });
        const result = await client.streams.ticks();
        if (result.status !== 200) return;
        await expect(collect(result.body)).rejects.toThrow('terminated');
    });
});

describe('what a wrapper reads off a method', () => {
    const client = createClient({
        baseUrl: 'http://api',
    });

    it('names the method it sends and whether its response streams', () => {
        expect(client.streams.ticks['~route']).toMatchObject({
            method: 'GET',
            path: '/ticks',
            streams: true,
        });
        expect(
            createClient({
                baseUrl: 'http://api',
            }).users.createUser['~route']
        ).toMatchObject({
            method: 'POST',
            streams: false,
        });
    });

    it('keeps it out of the method keys', () => {
        expect(Object.keys(client.streams.ticks)).toEqual([]);
    });
});

describe('headers', () => {
    it('leaves out a header whose value is undefined', async () => {
        const fetchMock = stubFetch(200, {
            id: '1',
            name: 'Alice',
        });
        const client = createClient({
            baseUrl: 'http://api',
            fetch: fetchMock,
        });

        await client.users.getUser({
            params: {
                id: '1',
            },
            headers: {
                'x-trace': undefined as unknown as string,
            },
        });

        const [, options] = fetchMock.mock.calls[0]! as [string, RequestInit & { headers: Headers }];
        expect(options.headers.has('x-trace')).toBe(false);
    });

    it('lets a call override a base header whatever its case', async () => {
        const fetchMock = stubFetch(201, {
            id: '1',
            name: 'Alice',
        });
        const client = createClient({
            baseUrl: 'http://api',
            fetch: fetchMock,
            baseHeaders: {
                'content-type': 'application/vnd.base+json',
            },
        });

        await client.users.createUser({
            body: {
                name: 'Alice',
                email: 'alice@example.com',
            },
            headers: {
                'Content-Type': 'application/vnd.call+json',
            },
        });

        const [, options] = fetchMock.mock.calls[0]! as [string, RequestInit & { headers: Headers }];
        expect(options.headers.get('content-type')).toBe('application/vnd.call+json');
    });
});

describe('retry', () => {
    const unavailable = (retryAfter?: string) =>
        new Response(null, {
            status: 503,
            headers:
                retryAfter === undefined
                    ? {}
                    : {
                          'retry-after': retryAfter,
                      },
        });

    const user = () =>
        new Response(
            JSON.stringify({
                id: '1',
                name: 'Alice',
            }),
            {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                },
            }
        );

    const clientWith = (fetchMock: typeof fetch, retry?: Parameters<typeof createClient>[0]['retry']) =>
        createClient({
            baseUrl: 'http://localhost:3000',
            fetch: fetchMock,
            retry,
        });

    const getUser = (client: ReturnType<typeof createClient>) =>
        client.users.getUser({
            params: {
                id: '1',
            },
        });

    it('sends once when retry is not configured', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(unavailable('0'));
        const result = await getUser(clientWith(fetchMock));
        expect(result.status).toBe(503);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('waits what Retry-After asks and sends again', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(unavailable('0')).mockResolvedValueOnce(user());
        const result = await getUser(clientWith(fetchMock, {}));
        expect(result.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('reads Retry-After as an HTTP-date', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(unavailable(new Date(Date.now() - 1000).toUTCString()))
            .mockResolvedValueOnce(user());
        const result = await getUser(clientWith(fetchMock, {}));
        expect(result.status).toBe(200);
    });

    it('hands the response back when Retry-After asks for longer than the maximum delay', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(unavailable('120')).mockResolvedValueOnce(user());
        const result = await getUser(
            clientWith(fetchMock, {
                maximumDelay: 1000,
            })
        );
        expect(result.status).toBe(503);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('stops after the maximum attempts', async () => {
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(unavailable()));
        const result = await getUser(
            clientWith(fetchMock, {
                maximumAttempts: 3,
                initialDelay: 0,
            })
        );
        expect(result.status).toBe(503);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('retries a network error', async () => {
        const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(user());
        const result = await getUser(
            clientWith(fetchMock, {
                initialDelay: 0,
            })
        );
        expect(result.status).toBe(200);
    });

    it('never retries a cancelled request', async () => {
        const controller = new AbortController();
        controller.abort();
        const fetchMock = vi.fn().mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'));
        await expect(
            clientWith(fetchMock, {}).users.getUser({
                params: {
                    id: '1',
                },
                fetchOptions: {
                    signal: controller.signal,
                },
            })
        ).rejects.toThrow('aborted');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('never retries a POST', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(unavailable('0'));
        const result = await clientWith(fetchMock, {}).users.createUser({
            body: {
                name: 'Alice',
                email: 'alice@example.com',
            },
        });
        expect(result.status).toBe(503);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe('reconnect', () => {
    const encoder = new TextEncoder();

    const droppedAfter = (chunks: string[]): ReadableStream<Uint8Array> => {
        const pending = [...chunks];
        return new ReadableStream({
            pull(controller) {
                const chunk = pending.shift();
                if (chunk === undefined) controller.error(new TypeError('network connection was lost'));
                else controller.enqueue(encoder.encode(chunk));
            },
        });
    };

    const endingAfter = (chunks: string[]): ReadableStream<Uint8Array> =>
        new ReadableStream({
            start(controller) {
                for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
                controller.close();
            },
        });

    const events = (body: ReadableStream<Uint8Array>, status = 200) =>
        new Response(status === 204 ? null : body, {
            status,
            headers: {
                'content-type': 'text/event-stream',
            },
        });

    const collect = async <T>(iterable: AsyncIterable<T>): Promise<T[]> => {
        const items: T[] = [];
        for await (const item of iterable) items.push(item);
        return items;
    };

    const ticksOf = async (fetchMock: typeof fetch, reconnect: Parameters<typeof createClient>[0]['reconnect']) => {
        const result = await createClient({
            baseUrl: 'http://api',
            fetch: fetchMock,
            reconnect,
        }).streams.ticks();
        if (result.status !== 200) throw new Error('expected a stream');
        return collect(result.body);
    };

    it('resumes a dropped stream from the last event it received', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(events(droppedAfter(['data: {"tick":1}\nid: 1\n\ndata: {"tick":2}\nid: 2\n\n'])))
            .mockResolvedValueOnce(events(endingAfter(['data: {"tick":3}\nid: 3\n\n'])));
        const ticks = await ticksOf(fetchMock, {
            reconnectionTime: 0,
        });
        expect(ticks.map((message) => message.data.tick)).toEqual([1, 2, 3]);
        const [, reopened] = fetchMock.mock.calls[1]! as [string, RequestInit & { headers: Headers }];
        expect(reopened.headers.get('Last-Event-ID')).toBe('2');
    });

    it('waits the reconnection time a retry field sets', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(events(droppedAfter(['retry: 0\ndata: {"tick":1}\n\n'])))
            .mockResolvedValueOnce(events(endingAfter([])));
        const ticks = await ticksOf(fetchMock, {
            reconnectionTime: 60_000,
        });
        expect(ticks).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('ends when the server answers 204 to a reconnection', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(events(droppedAfter(['data: {"tick":1}\n\n'])))
            .mockResolvedValueOnce(events(endingAfter([]), 204));
        const ticks = await ticksOf(fetchMock, {
            reconnectionTime: 0,
        });
        expect(ticks).toHaveLength(1);
    });

    it('does not reconnect a stream the server ended', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(events(endingAfter(['data: {"tick":1}\n\n'])));
        await ticksOf(fetchMock, {
            reconnectionTime: 0,
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('fails once the reconnections run out', async () => {
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(events(droppedAfter([]))));
        await expect(
            ticksOf(fetchMock, {
                reconnectionTime: 0,
                maximumAttempts: 2,
            })
        ).rejects.toThrow('network connection was lost');
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('never reconnects a POST', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(events(droppedAfter(['event: delta\ndata: {"text":"a"}\n\n'])));
        const result = await createClient({
            baseUrl: 'http://api',
            fetch: fetchMock,
            reconnect: {
                reconnectionTime: 0,
            },
        }).streams.reply({
            body: {
                prompt: 'hi',
            },
        });
        if (result.status !== 200) throw new Error('expected a stream');
        await expect(collect(result.body)).rejects.toThrow('network connection was lost');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
