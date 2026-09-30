import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server, AddressInfo } from 'node:net';
import { apiContract } from './api.fixture.js';
import { securedContract } from './secured.fixture.js';
import { createClient, type Client } from './generated/api.js';
import { createClient as createSecuredClient } from './generated/secured.js';

describe('end-to-end: typed client → Express server', () => {
    let server: Server;
    let client: Client;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());

        const api = apiContract;

        api.mount(app);

        await new Promise<void>((resolve) => {
            server = app.listen(0, () => resolve());
        });

        const address = server.address() as AddressInfo;
        client = createClient({
            baseUrl: `http://localhost:${address.port}`,
        });
    });

    afterAll(() => {
        server?.close();
    });

    it('creates and fetches a user with full type safety', async () => {
        const created = await client.users.createUser({
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

        const fetched = await client.users.getUser({
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
        const result = await client.users.getUser({
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

describe('end-to-end: response headers', () => {
    let server: Server;
    let client: Client;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());

        const api = apiContract;

        api.mount(app);

        await new Promise<void>((resolve) => {
            server = app.listen(0, () => resolve());
        });

        const address = server.address() as AddressInfo;
        client = createClient({
            baseUrl: `http://localhost:${address.port}`,
        });
    });

    afterAll(() => {
        server?.close();
    });

    it('client exposes response headers echoed by the server', async () => {
        const result = await client.tracing.echoRequestId({
            headers: {
                'x-request-id': 'trace-e2e-999',
            },
        });
        expect(result.status).toBe(200);
        expect(result.headers['x-request-id']).toBe('trace-e2e-999');
    });
});

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
        const client = createSecuredClient({
            baseUrl,
            baseHeaders: {
                authorization: 'Bearer tok_ada',
            },
        });
        const response = await client.account.whoAmI();
        expect(response.status).toBe(200);
        if (response.status === 200) {
            expect(response.body.userId).toBe('1');
        }
    });

    it('surfaces the 401 the auth map put on the route, which it never declared', async () => {
        const client = createSecuredClient({
            baseUrl,
        });
        const response = await client.account.whoAmI();
        expect(response.status).toBe(401);
        if (response.status === 401) {
            expect(response.body.detail).toBe('Unauthorized');
            expect(response.body.code).toBe('expired_token');
        }
    });
});
