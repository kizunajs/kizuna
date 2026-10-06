import { describe, expect, it } from 'vitest';
import { expressAdapter } from '@kizunajs/express';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { defineConfig } from 'kizunajs';
import express from 'express';
import request from 'supertest';
import { generateOpenApi } from './generator.js';
import { openApiPlugin } from './plugin.js';

interface Config {
    groups: typeof kGroups;
}

const k = new Kizuna<Config>();

const kGroups = k.groups({
    api: 'API',
});
const config = {
    groups: kGroups,
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
    routes: [
        k.routes({
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
    ],
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
        const servedKGroups = k.groups({
            api: 'API',
        });
        const servedKConfig = {
            groups: servedKGroups,
        };
        const servedK = new Kizuna<{
            groups: typeof servedKGroups;
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
            routes: [
                servedK.routes({
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
            ],
        }).api;

        const app = express();
        servedContract.mount(app);

        const served = JSON.parse((await request(app).get('/openapi.json')).text);

        expect(generateOpenApi(servedContract)('json')).toEqual(served);
        expect(served.info.title).toBe('No drift');
    });

    it('says what to do when there are no options and no plugin', () => {
        const bareKGroups = k.groups({
            api: 'API',
        });
        const bareKConfig = {
            groups: bareKGroups,
        };
        const bareK = new Kizuna<{
            groups: typeof bareKGroups;
        }>();
        const bare = defineConfig({
            ...bareKConfig,
            routes: [
                bareK.routes({
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
            ],
        }).api;

        expect(() => generateOpenApi(bare)).toThrow(/Name `openApiPlugin` under `plugins`/);
    });

    it('serves the document with no UI when only a document path is given', async () => {
        const specOnlyKGroups = k.groups({
            api: 'API',
        });
        const specOnlyKConfig = {
            groups: specOnlyKGroups,
        };
        const specOnlyK = new Kizuna<{
            groups: typeof specOnlyKGroups;
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
            routes: [
                specOnlyK.routes({
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
            ],
        }).api;

        const app = express();
        specOnly.mount(app);

        expect((await request(app).get('/openapi.json')).status).toBe(200);
        expect((await request(app).get('/docs')).status).toBe(404);
    });

    it('takes a path for each of the three', async () => {
        const customKGroups = k.groups({
            api: 'API',
        });
        const customKConfig = {
            groups: customKGroups,
        };
        const customK = new Kizuna<{
            groups: typeof customKGroups;
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
            routes: [
                customK.routes({
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
            ],
        }).api;

        const app = express();
        custom.mount(app);

        expect((await request(app).get('/reference')).status).toBe(200);
        expect((await request(app).get('/spec.yaml')).status).toBe(200);
        expect((await request(app).get('/docs')).status).toBe(404);
        expect((await request(app).get('/openapi.yaml')).status).toBe(404);
    });

    it('serves the document at the paths it is given', async () => {
        const jsonOnlyKGroups = k.groups({
            api: 'API',
        });
        const jsonOnlyKConfig = {
            groups: jsonOnlyKGroups,
        };
        const jsonOnlyK = new Kizuna<{
            groups: typeof jsonOnlyKGroups;
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
            routes: [
                jsonOnlyK.routes({
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
            ],
        }).api;

        const app = express();
        jsonOnly.mount(app);

        expect((await request(app).get('/openapi.json')).status).toBe(200);
        expect((await request(app).get('/openapi.yaml')).status).toBe(200);
    });
});
