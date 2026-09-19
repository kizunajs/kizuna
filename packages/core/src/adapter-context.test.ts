import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import { defineConfig } from './define-config.js';
import { HANDLER_ARG_KEYS, adapterContextOf, assembleApi, createAdapter, type AdapterRequest } from './adapter.js';

interface Config {
    tags: typeof kTags;
    auth: {
        identities: {
            user: typeof kUser;
        };
    };
    requestContext: {
        analytics: typeof kAnalytics;
    };
}

const k = new Kizuna<Config>();

const kTags = k.tags({
    api: 'API',
});
const kUser = k.identity.bearer({
    context: z.object({
        userId: z.string(),
    }),
});
const kAnalytics = k.requestContext({
    context: z.object({
        sessionId: z.string(),
    }),
});
const config = {
    tags: kTags,
    auth: {
        identities: {
            user: kUser,
        },
    },
    requestContext: {
        analytics: kAnalytics,
    },
};

const contract = defineConfig({
    ...config,
    routes: k.routes('api', {
        everything: k.route({
            method: 'POST',
            path: '/everything/:id',
            auth: 'user',
            query: z.object({
                page: z.number(),
            }),
            body: z.object({
                name: z.string(),
            }),
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        }),
    }),
}).api;

/**
 * Drive one request through the pipeline and capture exactly what the handler
 * was given.
 */
const captureHandlerArgs = async (): Promise<Record<string, unknown>> => {
    let seen: Record<string, unknown> = {};

    const adapter = createAdapter<Request, unknown, { native: string }>({
        buildHandlerContext: () => ({
            native: 'from-the-adapter',
        }),
        respond: (result) => result,
    });

    const request: AdapterRequest<Request> = {
        request: new Request('http://localhost/everything/1?page=1', {
            method: 'POST',
        }),
        method: 'POST',
        resolution: {
            kind: 'core-match',
            path: '/everything/1',
        },
        query: {
            page: '1',
        },
        headers: {
            'content-type': 'application/json',
            authorization: 'Bearer tok',
        },
        readBody: () =>
            Promise.resolve({
                name: 'Ada',
            }),
    };

    const router = {
        everything: (args: Record<string, unknown>) => {
            seen = args;
            return {
                status: 200,
                body: {
                    ok: true,
                },
            };
        },
    };

    // Through `assembleApi`, as an adapter would, so coercion plans are resolved.
    const api = assembleApi(contract, {
        router,
    });

    await adapter.handle({
        routes: api.routes,
        router: router as never,
        request,
        responseContext: {},
        schemes: contract.securitySchemes,
        guards: {
            user: () => ({
                userId: 'u1',
            }),
        },
        requestContext: {
            analytics: () => ({
                sessionId: 's1',
            }),
        },
        pluginExports: {
            probe: {},
        },
    });

    return seen;
};

describe('adapterContextOf', () => {
    it('keeps only what the adapter contributed', async () => {
        const args = await captureHandlerArgs();

        expect(adapterContextOf(args)).toEqual({
            native: 'from-the-adapter',
        });
    });

    it('names every argument the pipeline adds, so the two cannot drift apart', async () => {
        const args = await captureHandlerArgs();
        const fromKizuna = Object.keys(args).filter((key) => key !== 'native');

        expect(fromKizuna.sort()).toEqual([...HANDLER_ARG_KEYS].sort());
    });
});
