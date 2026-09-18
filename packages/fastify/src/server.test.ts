import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { z } from 'zod';
import { Kizuna } from '@ts-kizuna/core';
import type { AddressInfo } from 'node:net';
import { KizunaServer, fastifyAdapter, type FastifyApi } from './server.js';
import { fetchStream, readTestBody, testAdapterFeatures } from '../../core/src/adapter-testing/index.js';

const k = new Kizuna({
    tags: Kizuna.tags({
        api: 'API',
    }),
});

describe('Fastify: handler context', () => {
    it('provides the Fastify request and reply objects', async () => {
        const contextApp = Fastify();
        const contextRoutes = k.routes('api', {
            echo: {
                method: 'GET',
                path: '/echo',
                responses: {
                    200: z.object({
                        url: z.string(),
                    }),
                },
            },
        });
        const contextContract = k.contract({
            routes: contextRoutes,
        });
        const contextApi = new KizunaServer(contextContract).api({
            router: {
                echo: ({ request }) => ({
                    status: 200,
                    body: {
                        url: request.url,
                    },
                }),
            },
        });
        await contextApi.mount(contextApp);
        await contextApp.ready();

        const response = await contextApp.inject({
            method: 'GET',
            url: '/echo',
        });
        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.url).toContain('/echo');
    });
});

testAdapterFeatures({
    name: 'fastify',
    initServerApi: (contract, options) =>
        new Kizuna({
            adapter: fastifyAdapter,
        }).api({
            contract,
            ...(options as object),
        }) as unknown as FastifyApi,
    mount: async (api, { responseValidation }) => {
        const app = Fastify();
        await api.mount(app, {
            responseValidation,
        });
        await app.ready();
        let listening = false;
        const baseUrl = async (): Promise<string> => {
            if (!listening) {
                await app.listen({
                    port: 0,
                    host: '127.0.0.1',
                });
                listening = true;
            }
            return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
        };
        return {
            close: () => app.close(),
            stream: async (mountRequest) => fetchStream(await baseUrl(), mountRequest),
            request: async ({ method, path, body, headers }) => {
                const response = await app.inject({
                    method,
                    url: path,
                    payload: body,
                    headers,
                });
                return {
                    status: response.statusCode,
                    headers: new Headers(response.headers as Record<string, string>),
                    body: readTestBody(response.body),
                    text: response.body,
                };
            },
        };
    },
});
