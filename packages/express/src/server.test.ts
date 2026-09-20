import express from 'express';
import request from 'supertest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expressAdapter, type ExpressApi } from './server.js';
import { fetchStream, readTestBody, testAdapterFeatures } from '../../core/src/adapter-testing/index.js';
import { defineConfig } from 'kizunajs';

testAdapterFeatures({
    name: 'express',
    createApi: (input) => defineConfig({ ...(input as { routes: never }), adapter: expressAdapter() }).api as unknown as ExpressApi,
    mount: (api, { responseValidation }) => {
        const app = express();
        app.use(express.json());
        api.mount(app, {
            responseValidation,
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
