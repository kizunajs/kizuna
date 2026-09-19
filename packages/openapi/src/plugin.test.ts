import { describe, expect, it } from 'vitest';
import { expressAdapter } from '@ts-kizuna/express';
import { z } from 'zod';
import { Kizuna } from '@ts-kizuna/core';
import { defineConfig } from '@ts-kizuna/core';
import express from 'express';
import request from 'supertest';
import { generateOpenApi } from './generator.js';
import { openApiPlugin } from './plugin.js';

interface Config {
    tags: typeof kTags;
}

const k = new Kizuna<Config>();

const kTags = k.tags({
    api: 'API',
});
const config = {
    tags: kTags,
};

const contract = defineConfig({
    adapter: expressAdapter(),
    ...config,
    plugins: [
        openApiPlugin({
            info: {
                title: 'Demo API',
                version: '1.0.0',
            },
            docsPath: '/docs',
        }),
    ],
    routes: k.routes('api', {
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
    }),
}).api;

const serve = () => {
    const api = contract;
    const app = express();
    api.mount(app);
    return app;
};

describe('openApiPlugin', () => {
    it('serves the reference UI with the document embedded', async () => {
        const response = await request(serve()).get('/docs');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/html');
        expect(response.text).toContain('Demo API');
        expect(response.text).toContain('/users/{id}');
    });

    it('serves no document routes unless asked', async () => {
        expect((await request(serve()).get('/openapi.json')).status).toBe(404);
        expect((await request(serve()).get('/openapi.yaml')).status).toBe(404);
    });

    it('leaves the contract routes alone', async () => {
        const response = await request(serve()).get('/users/7');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            id: '7',
        });
    });

    it('keeps its own routes out of the document', () => {
        expect(Object.keys(generateOpenApi(contract)('json').paths)).toEqual(['/users/{id}']);
    });

    it('hands its options to generateOpenApi, so a build step cannot drift from what is served', async () => {
        const servedKTags = k.tags({
            api: 'API',
        });
        const servedKConfig = {
            tags: servedKTags,
        };
        const servedK = new Kizuna<{
            tags: typeof servedKTags;
        }>();
        const servedContract = defineConfig({
            adapter: expressAdapter(),
            ...servedKConfig,
            plugins: [
                openApiPlugin({
                    info: {
                        title: 'No drift',
                        version: '2.0.0',
                    },
                    jsonPath: '/openapi.json',
                }),
            ],
            routes: servedK.routes('api', {
                ping: servedK
                    .route({
                        method: 'GET',
                        path: '/ping',
                        responses: {
                            200: z.object({
                                ok: z.boolean(),
                            }),
                        },
                    })
                    .handler(() => ({
                        status: 200,
                        body: {
                            ok: true,
                        },
                    })),
            }),
        }).api;

        const app = express();
        servedContract.mount(app);

        const served = JSON.parse((await request(app).get('/openapi.json')).text);

        expect(generateOpenApi(servedContract)('json')).toEqual(served);
        expect(served.info.title).toBe('No drift');
    });

    it('says what to do when there are no options and no plugin', () => {
        const bareKTags = k.tags({
            api: 'API',
        });
        const bareKConfig = {
            tags: bareKTags,
        };
        const bareK = new Kizuna<{
            tags: typeof bareKTags;
        }>();
        const bare = defineConfig({
            ...bareKConfig,
            routes: bareK.routes('api', {
                ping: bareK.route({
                    method: 'GET',
                    path: '/ping',
                    responses: {
                        200: z.object({
                            ok: z.boolean(),
                        }),
                    },
                }),
            }),
        }).api;

        expect(() => generateOpenApi(bare)).toThrow(/Name `openApiPlugin` under `plugins`/);
    });

    it('serves the document with no UI when only a document path is given', async () => {
        const specOnlyKTags = k.tags({
            api: 'API',
        });
        const specOnlyKConfig = {
            tags: specOnlyKTags,
        };
        const specOnlyK = new Kizuna<{
            tags: typeof specOnlyKTags;
        }>();
        const specOnly = defineConfig({
            adapter: expressAdapter(),
            ...specOnlyKConfig,
            plugins: [
                openApiPlugin({
                    info: {
                        title: 'Spec only',
                        version: '1.0.0',
                    },
                    jsonPath: '/openapi.json',
                }),
            ],
            routes: specOnlyK.routes('api', {
                ping: specOnlyK
                    .route({
                        method: 'GET',
                        path: '/ping',
                        responses: {
                            200: z.object({
                                ok: z.boolean(),
                            }),
                        },
                    })
                    .handler(() => ({
                        status: 200,
                        body: {
                            ok: true,
                        },
                    })),
            }),
        }).api;

        const app = express();
        specOnly.mount(app);

        expect((await request(app).get('/openapi.json')).status).toBe(200);
        expect((await request(app).get('/docs')).status).toBe(404);
    });

    it('takes a path for each of the three', async () => {
        const customKTags = k.tags({
            api: 'API',
        });
        const customKConfig = {
            tags: customKTags,
        };
        const customK = new Kizuna<{
            tags: typeof customKTags;
        }>();
        const custom = defineConfig({
            adapter: expressAdapter(),
            ...customKConfig,
            plugins: [
                openApiPlugin({
                    info: {
                        title: 'Custom',
                        version: '1.0.0',
                    },
                    docsPath: '/reference',
                    yamlPath: '/spec.yaml',
                }),
            ],
            routes: customK.routes('api', {
                ping: customK
                    .route({
                        method: 'GET',
                        path: '/ping',
                        responses: {
                            200: z.object({
                                ok: z.boolean(),
                            }),
                        },
                    })
                    .handler(() => ({
                        status: 200,
                        body: {
                            ok: true,
                        },
                    })),
            }),
        }).api;

        const app = express();
        custom.mount(app);

        expect((await request(app).get('/reference')).status).toBe(200);
        expect((await request(app).get('/spec.yaml')).status).toBe(200);
        expect((await request(app).get('/docs')).status).toBe(404);
        expect((await request(app).get('/openapi.yaml')).status).toBe(404);
    });

    it('serves the document at the paths it is given', async () => {
        const jsonOnlyKTags = k.tags({
            api: 'API',
        });
        const jsonOnlyKConfig = {
            tags: jsonOnlyKTags,
        };
        const jsonOnlyK = new Kizuna<{
            tags: typeof jsonOnlyKTags;
        }>();
        const jsonOnly = defineConfig({
            adapter: expressAdapter(),
            ...jsonOnlyKConfig,
            plugins: [
                openApiPlugin({
                    info: {
                        title: 'Both',
                        version: '1.0.0',
                    },
                    jsonPath: '/openapi.json',
                    yamlPath: '/openapi.yaml',
                }),
            ],
            routes: jsonOnlyK.routes('api', {
                ping: jsonOnlyK
                    .route({
                        method: 'GET',
                        path: '/ping',
                        responses: {
                            200: z.object({
                                ok: z.boolean(),
                            }),
                        },
                    })
                    .handler(() => ({
                        status: 200,
                        body: {
                            ok: true,
                        },
                    })),
            }),
        }).api;

        const app = express();
        jsonOnly.mount(app);

        expect((await request(app).get('/openapi.json')).status).toBe(200);
        expect((await request(app).get('/openapi.yaml')).status).toBe(200);
    });
});
