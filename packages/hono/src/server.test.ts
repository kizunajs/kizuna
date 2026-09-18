import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import { Kizuna } from '@ts-kizuna/core';
import { defineConfig } from '@ts-kizuna/core';
import { honoAdapter, type HonoApi } from './server.js';
import { readTestBody, streamedResponse, testAdapterFeatures } from '../../core/src/adapter-testing/index.js';

interface Config {
    adapter: typeof honoAdapter;
    tags: typeof kTags;
}

const k = new Kizuna<Config>();

const kTags = k.tags({
    api: 'API',
});
const config = {
    tags: kTags,
};

describe('Hono: handler context', () => {
    it('provides the Hono Context object as c', async () => {
        const contextApp = new Hono();
        const contextRoutes = k.routes('api', {
            echo: k
                .route({
                    method: 'GET',
                    path: '/echo',
                    responses: {
                        200: z.object({
                            url: z.string(),
                        }),
                    },
                })
                .handler(({ c }) => ({
                    status: 200,
                    body: {
                        url: c.req.url,
                    },
                })),
        });
        const contextContract = defineConfig({
            adapter: honoAdapter,
            ...config,
            routes: contextRoutes,
        }).api;
        const contextApi = contextContract;
        contextApi.mount(contextApp);

        const response = await contextApp.request('/echo');
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.url).toContain('/echo');
    });
});

testAdapterFeatures({
    name: 'hono',
    createApi: (input) => defineConfig({ ...(input as { routes: never }), adapter: honoAdapter }).api as unknown as HonoApi,
    mount: (api, { responseValidation }) => {
        const app = new Hono();
        api.mount(app, {
            responseValidation,
        });
        return {
            stream: async ({ method, path, body, headers }) => {
                const controller = new AbortController();
                const response = await app.request(path, {
                    method,
                    body,
                    headers,
                    signal: controller.signal,
                });
                return streamedResponse(response, controller);
            },
            request: async ({ method, path, body, headers }) => {
                const response = await app.request(path, {
                    method,
                    body,
                    headers,
                });
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
