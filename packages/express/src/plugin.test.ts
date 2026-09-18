import { describe, expect, it } from 'vitest';
import { expressAdapter } from '@ts-kizuna/express';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { Kizuna } from '@ts-kizuna/core';
import { defineConfig } from '@ts-kizuna/core';
import { createPlugin } from '@ts-kizuna/core/adapter';

interface Config {
    plugins: [ReturnType<typeof probePlugin>];
    adapter: typeof expressAdapter;
    tags: typeof kTags;
}

const k = new Kizuna<Config>();

const probePlugin = (settings: { label: string }) =>
    createPlugin({
        name: 'probe',
        routes: {
            ping: {
                method: 'GET',
                path: '/probe/ping',
                responses: {
                    200: z.object({
                        pong: z.boolean(),
                    }),
                },
            },
        },
        serve: () => ({
            router: {
                ping: () => ({
                    status: 200 as const,
                    body: {
                        pong: true,
                    },
                }),
            },
            exports: {
                queue: (id: string) => `${settings.label}:${id}`,
            },
        }),
    });

const kTags = k.tags({
    api: 'API',
});
const config = {
    tags: kTags,
};

const routes = k.routes('api', {
    indexUser: k
        .route({
            method: 'POST',
            path: '/users/:id/index',
            responses: {
                200: z.object({
                    queued: z.string(),
                }),
            },
        })
        .handler(({ params, plugins }) => ({
            status: 200,
            body: {
                queued: plugins.probe.queue(params.id),
            },
        })),
});

const contract = defineConfig({
    adapter: expressAdapter,
    ...config,
    plugins: [probePlugin({ label: 'probed' })],
    routes,
}).api;

const serve = () => {
    const api = contract;
    const app = express();
    app.use(express.json());
    api.mount(app);
    return app;
};

describe('plugin lane', () => {
    it('serves a plugin route through api.mount', async () => {
        const response = await request(serve()).get('/probe/ping');
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            pong: true,
        });
    });

    it('hands a plugin export to every handler under plugins', async () => {
        const response = await request(serve()).post('/users/42/index');
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            queued: 'probed:42',
        });
    });

    it('keeps plugin routes out of contract.routes', () => {
        expect(Object.keys(contract.routes)).toEqual(['indexUser']);
    });

    it('reports a path a plugin and the contract both claim', () => {
        const collidingPlugin = createPlugin({
            name: 'collide',
            serve: () => ({
                router: {
                    clash: () => ({
                        status: 200 as const,
                        body: {
                            from: 'plugin',
                        },
                    }),
                },
            }),
            routes: {
                clash: {
                    method: 'POST',
                    path: '/users/:id/index',
                    responses: {
                        200: z.object({
                            from: z.string(),
                        }),
                    },
                },
            },
        });

        const collidingKTags = k.tags({
            api: 'API',
        });
        const collidingKConfig = {
            tags: collidingKTags,
        };
        const collidingK = new Kizuna<{
            tags: typeof collidingKTags;
        }>();
        // Contract time, because the plugins are on the kizuna instance that built it.
        expect(
            () =>
                defineConfig({
                    ...collidingKConfig,
                    plugins: [collidingPlugin],
                    routes,
                }).api
        ).toThrow(/collides with/);
    });
});
