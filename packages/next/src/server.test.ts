import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from '@ts-kizuna/core';
import { defineConfig } from '@ts-kizuna/core';
import { ProblemDetailsSchema } from '@ts-kizuna/core/schemas';
import { nextAdapter, NextRequest, NextResponse, type NextApi } from './server.js';
import { readTestBody, streamedResponse, testAdapterFeatures } from '../../core/src/adapter-testing/index.js';

interface Config {
    adapter: typeof nextAdapter;
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
    getUser: k
        .route({
            method: 'GET',
            path: '/users/:id',
            responses: {
                200: z.object({
                    id: z.string(),
                    name: z.string(),
                }),
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
            body: z.object({
                name: z.string().min(1),
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
            const user: User = {
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
});

const contract = defineConfig({
    adapter: nextAdapter,
    ...config,
    routes: contractRoutes,
}).api;

interface User {
    id: string;
    name: string;
    email: string;
}
const users = new Map<string, User>();

const api = contract;

const { DELETE } = api.mount({
    basePath: '/api',
});

const makeRequest = (method: string, path: string, body?: unknown): NextRequest => {
    const url = `http://localhost:3000${path}`;
    const init: ConstructorParameters<typeof NextRequest>[1] = {
        method,
    };
    if (body !== undefined) {
        init.body = JSON.stringify(body);
        init.headers = {
            'content-type': 'application/json',
        };
    }
    return new NextRequest(url, init);
};

describe('Next.js handler', () => {
    beforeEach(() => {
        users.clear();
    });

    it('returns 405 with Allow header on method mismatch', async () => {
        const response = await DELETE(makeRequest('DELETE', '/api/users/123'));
        expect(response.status).toBe(405);
        expect(response.headers.get('allow')).toBe('GET, HEAD');
        const body = await response.json();
        expect(body.allowed).toEqual(['GET', 'HEAD']);
    });

    it('routes onError hook overrides the default 500', async () => {
        const throwingRoutes = k.routes('api', {
            boom: k
                .route({
                    method: 'GET',
                    path: '/boom',
                    responses: {
                        200: z.object({
                            ok: z.boolean(),
                        }),
                    },
                })
                .handler(() => {
                    throw new Error('handler exploded');
                }),
        });
        const { api: throwingApi } = defineConfig({
            ...config,
            adapter: nextAdapter,
            routes: throwingRoutes,
        });
        const { GET: boomGET } = throwingApi.mount({
            basePath: '/api',
            onError: () =>
                new NextResponse(JSON.stringify({ caught: true }), {
                    status: 503,
                    headers: {
                        'content-type': 'application/json',
                    },
                }),
        });
        const response = await boomGET(makeRequest('GET', '/api/boom'));
        expect(response.status).toBe(503);
        const body = await response.json();
        expect(body.caught).toBe(true);
    });
});

describe('Next.js handler: alternate content types', () => {
    const uploadRoutes = k.routes('api', {
        uploadAvatar: k
            .route({
                method: 'POST',
                path: '/avatar',
                contentType: 'multipart/form-data',
                body: z.object({
                    file: z.instanceof(File),
                    userId: z.string(),
                }),
                responses: {
                    200: z.object({
                        size: z.number(),
                        contents: z.string(),
                        userId: z.string(),
                    }),
                },
            })
            .handler(async ({ body }) => {
                const contents = await body.file.text();
                return {
                    status: 200,
                    body: {
                        size: contents.length,
                        contents,
                        userId: body.userId,
                    },
                };
            }),
        submitForm: k
            .route({
                method: 'POST',
                path: '/form',
                contentType: 'application/x-www-form-urlencoded',
                body: z.object({
                    name: z.string(),
                    age: z.string(),
                }),
                responses: {
                    200: z.object({
                        name: z.string(),
                        age: z.string(),
                    }),
                },
            })
            .handler(({ body }) => {
                return {
                    status: 200,
                    body: {
                        name: body.name,
                        age: body.age,
                    },
                };
            }),
    });
    const uploadContract = defineConfig({
        adapter: nextAdapter,
        ...config,
        routes: uploadRoutes,
    }).api;
    const uploadApi = uploadContract;

    const { POST: uploadPOST } = uploadApi.mount({
        basePath: '/api',
    });

    it('parses multipart/form-data and validates File fields', async () => {
        const form = new FormData();
        form.append('file', new File(['hello world'], 'avatar.txt'));
        form.append('userId', 'u1');
        const request = new NextRequest('http://localhost:3000/api/avatar', {
            method: 'POST',
            body: form,
        });

        const response = await uploadPOST(request);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.size).toBe(11);
        expect(body.contents).toBe('hello world');
        expect(body.userId).toBe('u1');
    });

    it('parses application/x-www-form-urlencoded bodies', async () => {
        const request = new NextRequest('http://localhost:3000/api/form', {
            method: 'POST',
            body: 'name=Alice&age=30',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
            },
        });

        const response = await uploadPOST(request);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({
            name: 'Alice',
            age: '30',
        });
    });
});

describe('Next.js handler: requestMiddleware', () => {
    let handlerRan = false;

    const middlewareContractRoutes = k.routes('api', {
        getResource: k
            .route({
                method: 'GET',
                path: '/resources/:id',
                responses: {
                    200: z.object({
                        id: z.string(),
                        userId: z.string(),
                    }),
                },
            })
            .handler(({ params, request }) => {
                handlerRan = true;
                return {
                    status: 200,
                    body: {
                        id: params.id,
                        userId: (request as any).userId,
                    },
                };
            }),
    });

    const middlewareContract = defineConfig({
        adapter: nextAdapter,
        ...config,
        routes: middlewareContractRoutes,
    }).api;

    it('runs requestMiddleware before the handler with the matched route', async () => {
        const routesSeen: Array<{ path: string; method: string }> = [];

        const middlewareApi = middlewareContract;

        const { GET: middlewareGET } = middlewareApi.mount({
            basePath: '/api',
            requestMiddleware: [
                async (request, route) => {
                    routesSeen.push(route);
                    (request as any).userId = 'user-42';
                },
            ],
        });

        const response = await middlewareGET(makeRequest('GET', '/api/resources/7'));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.id).toBe('7');
        expect(body.userId).toBe('user-42');
        expect(routesSeen).toEqual([
            {
                path: '/resources/:id',
                method: 'GET',
            },
        ]);
    });

    it('short-circuits when middleware returns a Response', async () => {
        handlerRan = false;

        const middlewareApi = middlewareContract;

        const { GET: middlewareGET } = middlewareApi.mount({
            basePath: '/api',
            requestMiddleware: [
                async () => {
                    return new Response(JSON.stringify({ message: 'Forbidden' }), {
                        status: 403,
                        headers: {
                            'content-type': 'application/json',
                        },
                    });
                },
            ],
        });

        const response = await middlewareGET(makeRequest('GET', '/api/resources/1'));
        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.message).toBe('Forbidden');
        expect(handlerRan).toBe(false);
    });

    it('runs middleware functions in order and stops at the first Response', async () => {
        const order: number[] = [];

        const middlewareApi = middlewareContract;

        const { GET: middlewareGET } = middlewareApi.mount({
            basePath: '/api',
            requestMiddleware: [
                async () => {
                    order.push(1);
                },
                async () => {
                    order.push(2);
                    return new Response(null, { status: 401 });
                },
                async () => {
                    order.push(3);
                },
            ],
        });

        const response = await middlewareGET(makeRequest('GET', '/api/resources/1'));
        expect(response.status).toBe(401);
        expect(order).toEqual([1, 2]);
    });

    it('skips middleware for unmatched routes and returns 404', async () => {
        let middlewareCalled = false;

        const middlewareApi = middlewareContract;

        const { GET: middlewareGET } = middlewareApi.mount({
            basePath: '/api',
            requestMiddleware: [
                async () => {
                    middlewareCalled = true;
                },
            ],
        });

        const response = await middlewareGET(makeRequest('GET', '/api/unknown'));
        expect(response.status).toBe(404);
        expect(middlewareCalled).toBe(false);
    });
});

testAdapterFeatures({
    name: 'next',
    createApi: (input) => defineConfig({ ...(input as { routes: never }), adapter: nextAdapter }).api as unknown as NextApi,
    mount: (api, { responseValidation }) => {
        const handlers = api.mount({
            basePath: '/api',
            responseValidation,
        });
        return {
            stream: async ({ method, path, body, headers }) => {
                const handler = handlers[method];
                if (!handler) throw new Error(`next: no handler exported for ${method}`);
                const controller = new AbortController();
                const response = await handler(
                    new NextRequest(`http://localhost:3000/api${path}`, {
                        method,
                        body,
                        headers,
                        signal: controller.signal,
                    })
                );
                return streamedResponse(response, controller);
            },
            request: async ({ method, path, body, headers }) => {
                const handler = handlers[method];
                if (!handler) throw new Error(`next: no handler exported for ${method}`);
                const response = await handler(
                    new NextRequest(`http://localhost:3000/api${path}`, {
                        method,
                        body,
                        headers,
                    })
                );
                const text = await response.text();
                return {
                    status: response.status,
                    headers: response.headers,
                    body: readTestBody(text),
                    text,
                };
            },
        };
    },
});
