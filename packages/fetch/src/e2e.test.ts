import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expressAdapter } from '@ts-kizuna/express';
import express from 'express';
import { z } from 'zod';
import type { Server, AddressInfo } from 'node:net';
import { Kizuna } from '@ts-kizuna/core';
import { defineConfig } from '@ts-kizuna/core';
import { ProblemDetailsSchema } from '@ts-kizuna/core/schemas';
import { KizunaClient, type Client } from '@ts-kizuna/fetch';

interface Config {
    adapter: ReturnType<typeof expressAdapter>;
    tags: typeof kTags;
}

interface SecuredKConfig {
    auth: {
        identities: {
            user: typeof userIdentity;
        };
        guardSchema: typeof securedKGuardSchema;
    };
}

const k = new Kizuna<Config>();
const securedK = new Kizuna<SecuredKConfig>();

const kTags = k.tags({
    api: 'API',
});
const config = {
    tags: kTags,
};

const contractRoutes = k.routes('api', {
    createUser: k
        .route({
            method: 'POST',
            path: '/users',
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
    getUser: k
        .route({
            method: 'GET',
            path: '/users/:id',
            responses: {
                200: z.object({
                    id: z.string(),
                    name: z.string(),
                    email: z.string(),
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
                body: user,
            };
        }),
});

const users = new Map<string, { id: string; name: string; email: string }>();

const contract = defineConfig({
    adapter: expressAdapter(),
    ...config,
    routes: contractRoutes,
}).api;

describe('end-to-end: typed client → Express server', () => {
    let server: Server;
    let client: Client<typeof contract.routes>;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());

        const api = contract;

        api.mount(app);

        await new Promise<void>((resolve) => {
            server = app.listen(0, () => resolve());
        });

        const address = server.address() as AddressInfo;
        client = new KizunaClient(contract, {
            baseUrl: `http://localhost:${address.port}`,
        });
    });

    afterAll(() => {
        server?.close();
    });

    it('creates and fetches a user with full type safety', async () => {
        const created = await client.createUser({
            body: {
                name: 'Alice',
                email: 'alice@test.com',
            },
        });
        expect(created.status).toBe(201);
        if (created.status !== 201) throw new Error('expected 201');

        expect(created.body.name).toBe('Alice');
        expect(created.body.email).toBe('alice@test.com');
        expect(created.body.id).toBeDefined();

        const fetched = await client.getUser({
            params: {
                id: created.body.id,
            },
        });
        expect(fetched.status).toBe(200);
        if (fetched.status === 200) {
            expect(fetched.body.name).toBe('Alice');
        }
    });

    it('returns typed 404 for a missing user', async () => {
        const result = await client.getUser({
            params: {
                id: 'nonexistent',
            },
        });
        expect(result.status).toBe(404);
        if (result.status === 404) {
            expect(result.body.detail).toBe('Not found');
        }
    });
});

const contractWithResponseHeadersRoutes = k.routes('api', {
    getUser: k
        .route({
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
                404: ProblemDetailsSchema,
            },
        })
        .handler(({ params, headers, res }) => {
            const requestId = headers['x-request-id'];
            if (requestId) res.setHeader('x-request-id', requestId);
            return {
                status: 200,
                body: {
                    id: params.id,
                    name: 'Alice',
                },
            };
        }),
});

const contractWithResponseHeaders = defineConfig({
    adapter: expressAdapter(),
    ...config,
    routes: contractWithResponseHeadersRoutes,
}).api;

describe('end-to-end: response headers', () => {
    let server: Server;
    let client: Client<typeof contractWithResponseHeaders.routes>;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());

        const api = contractWithResponseHeaders;

        api.mount(app);

        await new Promise<void>((resolve) => {
            server = app.listen(0, () => resolve());
        });

        const address = server.address() as AddressInfo;
        client = new KizunaClient(contractWithResponseHeaders, {
            baseUrl: `http://localhost:${address.port}`,
        });
    });

    afterAll(() => {
        server?.close();
    });

    it('client exposes response headers echoed by the server', async () => {
        const result = await client.getUser({
            params: {
                id: '1',
            },
            headers: {
                'x-request-id': 'trace-e2e-999',
            },
        });
        expect(result.status).toBe(200);
        expect(result.headers['x-request-id']).toBe('trace-e2e-999');
    });
});

const userIdentity = securedK.identity
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
                    code: 'expired_token',
                },
            });
        return {
            userId: '1',
        };
    });

const securedKGuardSchema = ProblemDetailsSchema.extend({
    code: z.enum(['expired_token', 'forbidden']).default('forbidden'),
});
const securedKConfig = {
    auth: {
        identities: {
            user: userIdentity,
        },
        guardSchema: securedKGuardSchema,
    },
};

const securedRoutes = securedK.routes({
    whoAmI: securedK
        .route({
            method: 'GET',
            path: '/who-am-i',
            auth: 'user',
            responses: {
                200: z.object({
                    userId: z.string(),
                }),
            },
        })
        .handler(({ auth }) => ({
            status: 200,
            body: {
                userId: auth.user.userId,
            },
        })),
});

const securedContract = defineConfig({
    adapter: expressAdapter(),
    ...securedKConfig,
    routes: {
        api: securedRoutes,
    },
}).api;

describe('end-to-end: typed client → secured Express route', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());

        const api = securedContract;

        api.mount(app);

        await new Promise<void>((resolve) => {
            server = app.listen(0, () => resolve());
        });
        const address = server.address() as AddressInfo;
        baseUrl = `http://localhost:${address.port}`;
    });

    afterAll(() => {
        server?.close();
    });

    it('round-trips with the credential in baseHeaders', async () => {
        const client = new KizunaClient(securedContract, {
            baseUrl,
            baseHeaders: {
                authorization: 'Bearer tok_ada',
            },
        });
        const response = await client.api.whoAmI();
        expect(response.status).toBe(200);
        if (response.status === 200) {
            expect(response.body.userId).toBe('1');
        }
    });

    it('surfaces the 401 the auth map put on the route, which it never declared', async () => {
        const client = new KizunaClient(securedContract, {
            baseUrl,
        });
        const response = await client.api.whoAmI();
        expect(response.status).toBe(401);
        if (response.status === 401) {
            expect(response.body.detail).toBe('Unauthorized');
            expect(response.body.code).toBe('expired_token');
        }
    });
});
