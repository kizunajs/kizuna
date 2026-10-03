import { describe, expect, it, afterEach } from 'vitest';
import { expressAdapter } from '@kizunajs/express';
import { z } from 'zod';
import express from 'express';
import type { Server } from 'node:http';
import { Kizuna } from 'kizunajs';
import { defineConfig } from 'kizunajs';
import { definePlugin } from 'kizunajs/plugin';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { mcpPlugin } from './plugin.js';

interface Config {
    tags: typeof kTags;
    plugins: [ReturnType<typeof mcpPlugin>, ReturnType<typeof greetingPlugin>];
}

const k = new Kizuna<Config>();

const kTags = k.tags({
    api: 'API',
});
const config = {
    tags: kTags,
};

const greetingPlugin = definePlugin({
    slug: 'greeting',
    setup: () => ({
        exports: {
            greet: (name: string) => `Hello, ${name}`,
        },
    }),
});

const deleted: string[] = [];

const routes = k.routes('api', {
    deleteUser: k
        .route({
            method: 'DELETE',
            path: '/users/:id',
            summary: 'Delete a user',
            tool: {
                needsApproval: true,
            },
            responses: {
                200: z.object({
                    deleted: z.string(),
                }),
            },
        })
        .handler(({ params }) => {
            deleted.push(params.id);
            return {
                status: 200,
                body: {
                    deleted: params.id,
                },
            };
        }),
    greetUser: k
        .route({
            method: 'GET',
            path: '/greetings/:name',
            tool: true,
            summary: 'Greet someone through a plugin',
            responses: {
                200: z.object({
                    greeting: z.string(),
                }),
            },
        })
        .handler(({ params, plugins }) => ({
            status: 200,
            body: {
                greeting: plugins.greeting.greet(params.name),
            },
        })),
    getUser: k
        .route({
            method: 'GET',
            path: '/users/:id',
            tool: true,
            summary: 'Get a user by id',
            responses: {
                200: z.object({
                    id: z.string(),
                    name: z.string(),
                }),
            },
        })
        .handler(({ params }) => ({
            status: 200,
            body: {
                id: params.id,
                name: 'Ada',
            },
        })),
});

const contract = defineConfig({
    adapter: expressAdapter(),
    ...config,
    plugins: [
        mcpPlugin({
            name: 'Test API',
        }),
        greetingPlugin(),
    ],
    routes,
}).api;

const api = contract;

const start = async (): Promise<{ port: number; server: Server }> => {
    const app = express();
    app.use(express.json());
    api.mount(app);
    return new Promise((resolve) => {
        const listening = app.listen(0, () => {
            resolve({
                port: (listening.address() as { port: number }).port,
                server: listening,
            });
        });
    });
};

describe('mcpPlugin', () => {
    let running: Server | undefined;
    let client: Client | undefined;

    afterEach(async () => {
        await client?.close();
        await new Promise<void>((resolve) => {
            if (running) running.close(() => resolve());
            else resolve();
        });
        running = undefined;
        client = undefined;
    });

    const connect = async () => {
        const started = await start();
        running = started.server;
        const connected = new Client({
            name: 'test-client',
            version: '1.0.0',
        });
        await connected.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${started.port}/mcp`)));
        client = connected;
        return connected;
    };

    it('serves MCP from api.mount, with no endpoint wired by hand', async () => {
        const connected = await connect();
        const { tools } = await connected.listTools();
        expect(tools.map((tool) => tool.name)).toContain('get_user');
    });

    it('calls a tool, which runs the contract handler', async () => {
        const connected = await connect();
        const result = await connected.callTool({
            name: 'get_user',
            arguments: {
                params: {
                    id: '42',
                },
            },
        });

        const content = result.content as Array<{ text: string }>;
        const parsed = JSON.parse(content[0]!.text);
        expect(parsed.status).toBe(200);
        expect(parsed.body).toEqual({
            id: '42',
            name: 'Ada',
        });
    });

    it('hands a tool call the plugins an HTTP request gets', async () => {
        const connected = await connect();
        const result = await connected.callTool({
            name: 'greet_user',
            arguments: {
                params: {
                    name: 'Ada',
                },
            },
        });

        const content = result.content as Array<{ text: string }>;
        expect(JSON.parse(content[0]!.text)).toEqual({
            status: 200,
            body: {
                greeting: 'Hello, Ada',
            },
        });
    });

    const connectAnswering = async (approved: boolean | 'decline') => {
        const started = await start();
        running = started.server;
        const connected = new Client(
            {
                name: 'test-client',
                version: '1.0.0',
            },
            {
                capabilities: {
                    elicitation: {},
                },
                versionNegotiation: {
                    mode: 'auto',
                },
            }
        );
        connected.setRequestHandler('elicitation/create', async () =>
            approved === 'decline'
                ? {
                      action: 'decline' as const,
                  }
                : {
                      action: 'accept' as const,
                      content: {
                          approved,
                      },
                  }
        );
        await connected.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${started.port}/mcp`)));
        client = connected;
        return connected;
    };

    const deleteUser = (connected: Client) =>
        connected.callTool({
            name: 'delete_user',
            arguments: {
                params: {
                    id: '7',
                },
            },
        });

    it('runs a call that needs approval once the person approves', async () => {
        deleted.length = 0;
        const result = await deleteUser(await connectAnswering(true));
        expect(result.isError).toBeFalsy();
        expect(deleted).toEqual(['7']);
    });

    it('runs nothing when the person declines, and asks only once', async () => {
        deleted.length = 0;
        const result = await deleteUser(await connectAnswering('decline'));
        expect(result.isError).toBe(true);
        expect((result.content as Array<{ text: string }>)[0]!.text).toBe('Declined, so nothing ran.');
        expect(deleted).toEqual([]);
    });

    it('runs nothing when the person answers no', async () => {
        deleted.length = 0;
        const result = await deleteUser(await connectAnswering(false));
        expect(result.isError).toBe(true);
        expect(deleted).toEqual([]);
    });

    /**
     * One tool call with no session first, the 2025 protocol a per-request
     * bridge such as `mcp-remote` speaks. The server has no way to ask it
     * anything.
     */
    const bareCall = async (meta?: Record<string, unknown>) => {
        const started = await start();
        running = started.server;
        const response = await fetch(`http://127.0.0.1:${started.port}/mcp`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                accept: 'application/json, text/event-stream',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'delete_user',
                    arguments: {
                        params: {
                            id: '7',
                        },
                    },
                    ...(meta === undefined
                        ? {}
                        : {
                              _meta: meta,
                          }),
                },
            }),
        });
        const text = await response.text();
        const data = text.split('\n').find((line) => line.startsWith('data: '));
        return JSON.parse(data === undefined ? text : data.slice(6)).result as { isError?: boolean; content: Array<{ text: string }> };
    };

    it('refuses a call that needs approval when the client cannot ask, and says so', async () => {
        deleted.length = 0;
        const result = await bareCall();
        expect(result.isError).toBe(true);
        expect(result.content[0]!.text).toBe(
            '"Delete a user" needs the person\'s approval, and this client cannot ask for it, so nothing ran. Ask the person to do it themselves, where they confirm first.'
        );
        expect(deleted).toEqual([]);
    });

    it('runs a call a view sends after the person confirmed in it', async () => {
        deleted.length = 0;
        const result = await bareCall({
            'io.kizunajs/approved': true,
        });
        expect(result.isError).toBeFalsy();
        expect(deleted).toEqual(['7']);
    });

    it('leaves the endpoint out of the contract, so clients never see it', () => {
        expect(Object.keys(contract.routes)).toEqual(['deleteUser', 'greetUser', 'getUser']);
    });

    it('still serves the contract routes over HTTP', async () => {
        const started = await start();
        running = started.server;
        const response = await fetch(`http://127.0.0.1:${started.port}/users/7`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            id: '7',
            name: 'Ada',
        });
    });
});

const selective = k.routes('api', {
    listUsers: k
        .route({
            method: 'GET',
            path: '/users',
            tool: true,
            summary: 'List users',
            responses: {
                200: z.array(z.string()),
            },
        })
        .handler(() => ({
            status: 200,
            body: ['Ada'],
        })),
    health: k
        .route({
            method: 'GET',
            path: '/health',
            summary: 'Health check',
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
});

const selectiveContract = defineConfig({
    adapter: expressAdapter(),
    ...config,
    routes: selective,
    plugins: [
        mcpPlugin({
            name: 'Selective API',
        }),
    ],
}).api;

describe('mcpPlugin: the routes that publish', () => {
    let running: Server | undefined;
    let client: Client | undefined;

    afterEach(async () => {
        await client?.close();
        await new Promise<void>((resolve) => {
            if (running) running.close(() => resolve());
            else resolve();
        });
        running = undefined;
        client = undefined;
    });

    it('serves only the routes the declaration exposes', async () => {
        const selectiveApi = selectiveContract;

        const app = express();
        app.use(express.json());
        selectiveApi.mount(app);
        const started = await new Promise<{ port: number; server: Server }>((resolve) => {
            const listening = app.listen(0, () => {
                resolve({
                    port: (listening.address() as { port: number }).port,
                    server: listening,
                });
            });
        });
        running = started.server;

        const connected = new Client({
            name: 'test-client',
            version: '1.0.0',
        });
        await connected.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${started.port}/mcp`)));
        client = connected;

        const { tools } = await connected.listTools();
        expect(tools.map((tool) => tool.name)).toEqual(['list_users']);
    });

    it('still serves an excluded route over HTTP', async () => {
        const selectiveApi = selectiveContract;

        const app = express();
        app.use(express.json());
        selectiveApi.mount(app);
        const started = await new Promise<{ port: number; server: Server }>((resolve) => {
            const listening = app.listen(0, () => {
                resolve({
                    port: (listening.address() as { port: number }).port,
                    server: listening,
                });
            });
        });
        running = started.server;

        const response = await fetch(`http://127.0.0.1:${started.port}/health`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            ok: true,
        });
    });

    it('rejects options its schema does not accept, naming the field', () => {
        expect(() =>
            defineConfig({
                adapter: expressAdapter(),
                ...config,
                plugins: [
                    mcpPlugin({
                        path: 'mcp' as never,
                    }),
                ],
                routes,
            })
        ).toThrow(/\[kizuna\] Plugin 'mcp' has invalid options: path: must start with \//);
    });
});
