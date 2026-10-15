import { describe, expect, it } from 'vitest';
import { expressAdapter } from '@kizunajs/express';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { defineConfig } from 'kizunajs';
import { definePlugin, route } from 'kizunajs/plugin';

interface Config {
    plugins: [ReturnType<typeof probePlugin>];
    adapter: ReturnType<typeof expressAdapter>;
    groups: typeof kGroups;
}

const k = new Kizuna<Config>();

const probePlugin = definePlugin({
    slug: 'probe',
    options: z.object({
        label: z.string(),
    }),
    setup: ({ options }) => ({
        routes: {
            ping: route({
                method: 'GET',
                path: '/probe/ping',
                responses: {
                    200: z.object({
                        pong: z.boolean(),
                    }),
                },
            }).handler(() => ({
                status: 200,
                body: {
                    pong: true,
                },
            })),
        },
        exports: {
            queue: (id: string) => `${options.label}:${id}`,
        },
    }),
});

const kGroups = k.groups({
    api: 'API',
});
const config = {
    groups: kGroups,
};

const routes = k.routes({
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
    adapter: expressAdapter(),
    ...config,
    plugins: [
        probePlugin({
            label: 'probed',
        }),
    ],
    routes: [routes],
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
        const collidingPlugin = definePlugin({
            slug: 'collide',
            setup: () => ({
                routes: {
                    clash: route({
                        method: 'POST',
                        path: '/users/:id/index',
                        responses: {
                            200: z.object({
                                from: z.string(),
                            }),
                        },
                    }).handler(() => ({
                        status: 200,
                        body: {
                            from: 'plugin',
                        },
                    })),
                },
            }),
        });

        const collidingKGroups = k.groups({
            api: 'API',
        });
        const collidingKConfig = {
            groups: collidingKGroups,
        };
        // ApiDefinition time, because the plugins are on the kizuna instance that built it.
        expect(
            () =>
                defineConfig({
                    ...collidingKConfig,
                    plugins: [collidingPlugin()],
                    routes: [routes],
                }).api
        ).toThrow(/collides with/);
    });
});
