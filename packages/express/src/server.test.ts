import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { expressAdapter, type ExpressApi } from './server.js';
import { fetchStream, readTestBody, testAdapterFeatures } from '../../core/src/adapter-testing/index.js';
import { Kizuna, defineConfig } from 'kizunajs';

testAdapterFeatures({
    name: 'express',
    createApi: (input) => defineConfig({ ...(input as { routes: never }), adapter: expressAdapter() }).api as unknown as ExpressApi,
    mount: (api, { responseValidation, formatError }) => {
        const app = express();
        api.mount(app, {
            responseValidation,
            formatError,
        });
        let server: Server | undefined;
        const baseUrl = async (): Promise<string> => {
            if (!server) {
                const started = createServer(app);
                await new Promise<void>((resolve) => started.listen(0, '127.0.0.1', resolve));
                server = started;
            }
            return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        };
        return {
            close: async () => {
                const started = server;
                if (!started) return;
                started.closeAllConnections();
                await new Promise<void>((resolve) => started.close(() => resolve()));
            },
            stream: async (mountRequest) => fetchStream(await baseUrl(), mountRequest),
            request: async ({ method, path, body, headers }) => {
                let call = request(app)[method.toLowerCase() as 'get'](path).buffer(true);
                for (const [name, value] of Object.entries(headers)) call = call.set(name, value);
                const response = body === undefined ? await call : await call.send(body);
                // supertest leaves `.text` unset for non-text bodies, so fall back to the buffered body.
                const text = response.text ?? (Buffer.isBuffer(response.body) ? response.body.toString('binary') : '');
                return {
                    status: response.status,
                    headers: new Headers(response.headers as Record<string, string>),
                    body: readTestBody(text),
                    text,
                };
            },
        };
    },
});

interface Config {
    adapter: ReturnType<typeof expressAdapter>;
}

const k = new Kizuna<Config>();

/**
 * Express reads a falsy value, `'route'` and `'router'` passed to `next` as
 * routing signals, so kizuna wraps these and passes the rest on as they are.
 */
const signalValues = {
    null: null,
    undefined: undefined,
    zero: 0,
    empty: '',
    false: false,
    route: 'route',
    router: 'router',
};

const plainObject = {
    reason: 'not an Error',
};

const thrownValues = {
    ...signalValues,
    object: plainObject,
};

const throwingRoutes = k.routes({
    throwValue: k
        .route({
            method: 'GET',
            path: '/thrown/:kind',
            pathParams: z.object({
                kind: z.enum(['null', 'undefined', 'zero', 'empty', 'false', 'route', 'router', 'object']),
            }),
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        })
        .handler(({ params }) => {
            throw thrownValues[params.kind];
        }),
});

describe('Express: a handler throwing something other than an Error', () => {
    const mountThrowing = () => {
        const seen: unknown[] = [];
        const app = express();
        defineConfig({
            adapter: expressAdapter(),
            routes: [throwingRoutes],
        }).api.mount(app);
        app.use((_req: Request, res: Response) => {
            res.status(418).send('fell through to the next middleware');
        });
        app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
            seen.push(error);
            res.status(500).send('error handler');
        });
        return {
            app,
            seen,
        };
    };

    it('reaches the error handler as an Error carrying the value, for what Express reads as a signal', async () => {
        for (const [kind, value] of Object.entries(signalValues)) {
            const { app, seen } = mountThrowing();
            const response = await request(app).get(`/thrown/${kind}`);
            expect(response.status, kind).toBe(500);
            expect(seen, kind).toHaveLength(1);
            expect(seen[0], kind).toBeInstanceOf(Error);
            expect((seen[0] as Error).cause, kind).toBe(value);
        }
    });

    it('reaches the error handler untouched for any other value', async () => {
        const { app, seen } = mountThrowing();
        const response = await request(app).get('/thrown/object');
        expect(response.status).toBe(500);
        expect(seen).toEqual([plainObject]);
        expect(seen[0]).toBe(plainObject);
    });
});

describe('Express: exact paths under a prefix', () => {
    const userRoutes = k.routes({
        getUser: k
            .route({
                method: 'GET',
                path: '/users/:id',
                responses: {
                    200: z.object({
                        id: z.string(),
                    }),
                },
            })
            .handler(({ params }) => ({
                status: 200,
                body: {
                    id: params.id,
                },
            })),
    });

    it('matches the rest of the path exactly when the app mounts the api on a router of its own', async () => {
        const app = express();
        const adminRouter = express.Router();
        defineConfig({
            adapter: expressAdapter(),
            routes: [userRoutes],
        }).api.mount(adminRouter);
        app.use('/admin', adminRouter);

        expect((await request(app).get('/admin/users/1')).status).toBe(200);
        expect((await request(app).head('/admin/users/1')).status).toBe(200);
        expect((await request(app).get('/admin/users/1/')).status).toBe(404);
        expect((await request(app).get('/admin/Users/1')).status).toBe(404);
    });
});
