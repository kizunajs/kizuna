import { transform } from 'sucrase';
import { Hono } from 'hono';
import * as kizunajs from 'kizunajs';
import * as schemas from 'kizunajs/schemas';
import * as zod from 'zod';
import * as hono from '@kizunajs/hono';
import * as fetchRuntime from '@kizunajs/fetch';
import { generateFetchClient } from '@kizunajs/fetch/server';

export interface Exchange {
    id: number;
    method: string;
    path: string;
    requestHeaders: [string, string][];
    requestBody?: string;
    status: number;
    responseHeaders: [string, string][];
    responseBody: string;
    streaming: boolean;
    complete: boolean;
}

export interface Sandbox {
    run: (typescript: string, onExchange: (exchange: Exchange) => void, scope?: Record<string, unknown>) => Promise<void>;
}

const modules: Record<string, unknown> = {
    kizunajs,
    'kizunajs/schemas': schemas,
    zod,
    '@kizunajs/hono': hono,
    '@kizunajs/fetch': fetchRuntime,
};

function evaluate(source: string) {
    const module: {
        exports: Record<string, unknown>;
    } = {
        exports: {},
    };
    const compiled = transform(source, {
        transforms: ['typescript', 'imports'],
    }).code;
    new Function('require', 'module', 'exports', compiled)((specifier: string) => modules[specifier], module, module.exports);
    return module.exports;
}

const origin = 'https://api.example.com';

export function createSandbox(source: string): Sandbox {
    const config = evaluate(source).default as {
        api: {
            mount: (app: Hono) => void;
        } & Parameters<typeof generateFetchClient>[0];
    };
    const app = new Hono();
    config.api.mount(app);

    const recordingFetch = (onExchange: (exchange: Exchange) => void) => {
        let nextId = 0;
        return async (input: RequestInfo | URL, init?: RequestInit) => {
            const request = new Request(input, init);
            const url = new URL(request.url);
            const exchange: Exchange = {
                id: nextId++,
                method: request.method,
                path: `${url.pathname}${url.search}`,
                requestHeaders: [...request.headers],
                requestBody: request.body ? await request.clone().text() : undefined,
                status: 0,
                responseHeaders: [],
                responseBody: '',
                streaming: false,
                complete: false,
            };

            const response = await app.fetch(request);
            exchange.status = response.status;
            exchange.responseHeaders = [...response.headers];
            exchange.streaming = response.headers.get('content-type')?.startsWith('text/event-stream') ?? false;

            if (!exchange.streaming || !response.body) {
                exchange.responseBody = await response.clone().text();
                exchange.complete = true;
                onExchange({
                    ...exchange,
                });
                return response;
            }

            const [forClient, forLog] = response.body.tee();
            onExchange({
                ...exchange,
            });
            void (async () => {
                const decoder = new TextDecoder();
                const reader = forLog.getReader();
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    exchange.responseBody += decoder.decode(value, {
                        stream: true,
                    });
                    onExchange({
                        ...exchange,
                    });
                }
                exchange.complete = true;
                onExchange({
                    ...exchange,
                });
            })();
            return new Response(forClient, response);
        };
    };

    const { createClient } = evaluate(generateFetchClient(config.api)) as {
        createClient: (options: { baseUrl: string; fetch: typeof fetch }) => unknown;
    };

    return {
        run: async (typescript, onExchange, scope = {}) => {
            const record = recordingFetch(onExchange) as typeof fetch;
            const createRecordedClient = (options: { baseUrl: string }) =>
                createClient({
                    ...options,
                    fetch: record,
                });
            const client = createRecordedClient({
                baseUrl: origin,
            });
            const compiled = transform(`return (async () => {\n${typescript}\n})();`, {
                transforms: ['typescript'],
            }).code;
            const console = {
                log: () => undefined,
            };
            await new Function('client', 'createClient', 'console', ...Object.keys(scope), compiled)(
                client,
                createRecordedClient,
                console,
                ...Object.values(scope)
            );
        },
    };
}
