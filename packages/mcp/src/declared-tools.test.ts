import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from '@ts-kizuna/core';
import { assembleApi, TOOLS_META } from '@ts-kizuna/core/adapter';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createMcpServer } from './mcp-server.js';

const k = new Kizuna();

const routes = k.routes({
    health: {
        method: 'GET',
        path: '/health',
        responses: {
            200: z.object({
                ok: z.boolean(),
            }),
        },
    },
});

const tools = k.tools({
    weather: {
        getForecast: {
            title: 'Weather forecast',
            description: 'Look up the forecast for one city',
            input: z.object({
                city: z.string(),
            }),
            output: z.object({
                tempC: z.number(),
            }),
            annotations: {
                readOnlyHint: true,
            },
        },
    },
    countWords: {
        description: 'Count the words in a piece of text',
        input: z.object({
            text: z.string(),
        }),
        output: z.object({
            words: z.int(),
        }),
    },
    reindex: {
        description: 'Rebuild the search index',
    },
});

const contract = k.contract({
    routes,
    tools,
});

/**
 * Plain functions. None of them is reachable over HTTP, and none of them goes
 * through a route to get its input.
 */
const toolHandlers = {
    weather: {
        getForecast: ({ input }: { input: { city: string } }) => ({
            tempC: input.city === 'Oslo' ? 14 : 20,
        }),
    },
    countWords: ({ input }: { input: { text: string } }) => ({
        words: input.text.split(/\s+/).filter(Boolean).length,
    }),
    reindex: () => undefined,
};

const buildApi = () =>
    Object.assign(
        assembleApi(contract, {
            router: {
                health: () => ({
                    status: 200,
                    body: {
                        ok: true,
                    },
                }),
            },
        }),
        {
            [TOOLS_META]: {
                tools: contract.tools!,
                handlers: toolHandlers as Record<string, unknown>,
            },
        }
    );

const connect = async (options?: NonNullable<Parameters<typeof createMcpServer>[1]>['options']) => {
    const server = createMcpServer(buildApi() as Parameters<typeof createMcpServer>[0], {
        name: 'Test API',
        version: '1.0.0',
        options: {
            publishRoutes: {
                '*': true,
            },
            ...options,
        },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({
        name: 'test-client',
        version: '1.0.0',
    });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return {
        client,
        close: async () => {
            await client.close();
            await server.close();
        },
    };
};

describe('declared tools over MCP', () => {
    it('publishes every declared tool, beside the routes that opted in', async () => {
        const { client, close } = await connect();
        const { tools: listed } = await client.listTools();
        const names = listed.map((tool) => tool.name);

        expect(names).toContain('health');
        expect(names).toContain('weather_get_forecast');
        expect(names).toContain('count_words');
        await close();
    });

    it('leaves out a tool hideTools names', async () => {
        const { client, close } = await connect({
            hideTools: ['countWords'],
        });
        const { tools: listed } = await client.listTools();
        const names = listed.map((tool) => tool.name);

        expect(names).toContain('weather_get_forecast');
        expect(names).not.toContain('count_words');
        await close();
    });

    it('advertises the tool own schemas, with no HTTP envelope', async () => {
        const { client, close } = await connect();
        const { tools: listed } = await client.listTools();
        const forecast = listed.find((tool) => tool.name === 'weather_get_forecast')!;

        expect(forecast.title).toBe('Weather forecast');
        expect(forecast.inputSchema).toMatchObject({
            type: 'object',
            properties: {
                city: {
                    type: 'string',
                },
            },
        });
        // A route-tool advertises { status, body }; a declared tool advertises its own output.
        expect(forecast.outputSchema).toMatchObject({
            type: 'object',
            properties: {
                tempC: {
                    type: 'number',
                },
            },
        });
        expect(forecast.annotations).toMatchObject({
            readOnlyHint: true,
        });
        await close();
    });

    it('runs the plain handler and answers with its bare output', async () => {
        const { client, close } = await connect();

        const result = await client.callTool({
            name: 'weather_get_forecast',
            arguments: {
                city: 'Oslo',
            },
        });

        expect(result.isError).toBe(false);
        expect(result.structuredContent).toEqual({
            tempC: 14,
        });
        await close();
    });

    it('refuses arguments the input schema does not accept', async () => {
        const { client, close } = await connect();

        const result = await client.callTool({
            name: 'count_words',
            arguments: {
                text: 42,
            },
        });

        expect(result.isError).toBe(true);
        await close();
    });

    it('keeps a tool with no output out of structuredContent', async () => {
        const { client, close } = await connect();

        const result = await client.callTool({
            name: 'reindex',
            arguments: {},
        });

        expect(result.isError).toBe(false);
        expect(result.structuredContent).toBeUndefined();
        await close();
    });

    it('onlyReadOnly keeps the tools that say they are read only', async () => {
        const { client, close } = await connect({
            onlyReadOnly: true,
        });
        const { tools: listed } = await client.listTools();
        const names = listed.map((tool) => tool.name);

        expect(names).toContain('weather_get_forecast');
        expect(names).not.toContain('count_words');
        await close();
    });
});
