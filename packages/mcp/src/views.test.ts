import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna, defineConfig, defineView } from 'kizunajs';
import { assembleApi } from 'kizunajs/adapter';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createMcpServer } from './mcp-server.js';

const k = new Kizuna();

const userView = defineView({
    uri: 'ui://users/user',
    name: 'User',
    description: 'One user, editable',
    html: () => '<!doctype html><title>User</title>',
    csp: {
        frameDomains: ['https://example.com'],
    },
    prefersBorder: true,
});

const UserSchema = z.object({
    id: z.string(),
    name: z.string(),
});

const routes = k.routes('api', {
    getUser: k.route({
        method: 'GET',
        path: '/users/:id',
        summary: 'Get a user',
        tool: {
            ui: userView,
        },
        responses: {
            200: UserSchema,
        },
    }),
    listUsers: k.route({
        method: 'GET',
        path: '/users',
        summary: 'List users',
        tool: {
            ui: userView,
        },
        responses: {
            200: z.array(UserSchema),
        },
    }),
    createPreview: k.route({
        method: 'POST',
        path: '/preview',
        summary: 'Mint a preview token',
        tool: {
            visibility: ['app'],
        },
        responses: {
            200: z.object({
                token: z.string(),
            }),
        },
    }),
    publishUser: k.route({
        method: 'POST',
        path: '/users/:id/publish',
        summary: 'Publish a user',
        tool: {
            needsApproval: true,
        },
        responses: {
            200: z.object({
                ok: z.boolean(),
            }),
        },
    }),
    health: k.route({
        method: 'GET',
        path: '/health',
        summary: 'Check health',
        tool: true,
        responses: {
            200: z.object({
                ok: z.boolean(),
            }),
        },
    }),
});

const api = assembleApi(
    defineConfig({
        routes,
    }).api,
    {
        router: {
            publishUser: () => ({
                status: 200,
                body: {
                    ok: true,
                },
            }),
        },
    }
);

const connect = async () => {
    const server = createMcpServer(api);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({
        name: 'test-client',
        version: '1.0.0',
    });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return client;
};

describe('MCP views', () => {
    it('links a tool to its view and says who may call it', async () => {
        const client = await connect();
        const { tools } = await client.listTools();
        const meta = Object.fromEntries(tools.map((tool) => [tool.name, tool._meta]));

        expect(meta['get_user']).toEqual({
            ui: {
                resourceUri: 'ui://users/user',
            },
        });
        expect(meta['create_preview']).toEqual({
            ui: {
                visibility: ['app'],
            },
        });
        expect(meta['health']).toBeUndefined();
    });

    it('serves each view once, as an MCP Apps resource', async () => {
        const client = await connect();
        const { resources } = await client.listResources();

        expect(resources).toEqual([
            {
                uri: 'ui://users/user',
                name: 'User',
                description: 'One user, editable',
                mimeType: 'text/html;profile=mcp-app',
                _meta: {
                    ui: {
                        csp: {
                            frameDomains: ['https://example.com'],
                        },
                        prefersBorder: true,
                    },
                },
            },
        ]);

        const { contents } = await client.readResource({
            uri: 'ui://users/user',
        });
        expect(contents).toEqual([
            {
                uri: 'ui://users/user',
                mimeType: 'text/html;profile=mcp-app',
                text: '<!doctype html><title>User</title>',
                _meta: {
                    ui: {
                        csp: {
                            frameDomains: ['https://example.com'],
                        },
                        prefersBorder: true,
                    },
                },
            },
        ]);
    });

    it('runs a call that needs approval when it arrives with the approval, as a view sends it after its own confirm', async () => {
        const client = await connect();
        const result = await client.request({
            method: 'tools/call',
            params: {
                name: 'publish_user',
                arguments: {
                    params: {
                        id: '1',
                    },
                },
                inputResponses: {
                    approved: {
                        action: 'accept',
                        content: {
                            approved: true,
                        },
                    },
                },
            },
        });
        expect(result.structuredContent).toEqual({
            status: 200,
            body: {
                ok: true,
            },
        });
    });

    it('advertises the MCP Apps extension', async () => {
        const client = await connect();
        expect(client.getServerCapabilities()?.extensions).toEqual({
            'io.modelcontextprotocol/ui': {
                mimeTypes: ['text/html;profile=mcp-app'],
            },
        });
    });
});

describe('defineConfig: views', () => {
    it('throws when two views share a uri', () => {
        const other = defineView({
            uri: 'ui://users/user',
            name: 'Other',
            html: () => '',
        });
        expect(() =>
            defineConfig({
                routes: k.routes('api', {
                    first: k.route({
                        method: 'GET',
                        path: '/first',
                        summary: 'First',
                        tool: {
                            ui: userView,
                        },
                        responses: {
                            204: z.void(),
                        },
                    }),
                    second: k.route({
                        method: 'GET',
                        path: '/second',
                        summary: 'Second',
                        tool: {
                            ui: other,
                        },
                        responses: {
                            204: z.void(),
                        },
                    }),
                }),
            })
        ).toThrow("Two different views share the uri 'ui://users/user'");
    });

    it('throws on a tool only a view may call when there is no view', () => {
        expect(() =>
            defineConfig({
                routes: k.routes('api', {
                    createPreview: k.route({
                        method: 'POST',
                        path: '/preview',
                        summary: 'Mint a preview token',
                        tool: {
                            visibility: ['app'],
                        },
                        responses: {
                            204: z.void(),
                        },
                    }),
                }),
            })
        ).toThrow("Route 'createPreview' is a tool only a view may call");
    });

    it('throws on an empty visibility', () => {
        expect(() =>
            defineConfig({
                routes: k.routes('api', {
                    health: k.route({
                        method: 'GET',
                        path: '/health',
                        summary: 'Check health',
                        tool: {
                            visibility: [],
                        },
                        responses: {
                            204: z.void(),
                        },
                    }),
                }),
            })
        ).toThrow("Route 'health' declares an empty `visibility`");
    });
});
