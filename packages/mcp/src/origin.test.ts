import { describe, expect, it, afterEach } from 'vitest';
import { expressAdapter } from '@kizunajs/express';
import { z } from 'zod';
import express from 'express';
import type { Server } from 'node:http';
import { Kizuna, defineConfig } from 'kizunajs';
import { mcpPlugin } from './plugin.js';
import { allowsOrigin } from './origin.js';

describe('allowsOrigin', () => {
    const listed = new Set(['https://app.example.com']);

    it('lets a request with no Origin through, as clients that run outside a browser, such as Claude Code, send none', () => {
        expect(allowsOrigin(undefined, listed)).toBe(true);
    });

    it('accepts a localhost origin on any port', () => {
        for (const origin of [
            'http://localhost',
            'http://localhost:5173',
            'https://localhost:8443',
            'http://127.0.0.1:3000',
            'http://[::1]:8080',
        ]) {
            expect(allowsOrigin(origin, listed), origin).toBe(true);
        }
    });

    it('accepts a listed origin, exactly as listed', () => {
        expect(allowsOrigin('https://app.example.com', listed)).toBe(true);
        expect(allowsOrigin('https://app.example.com:8443', listed)).toBe(false);
        expect(allowsOrigin('http://app.example.com', listed)).toBe(false);
    });

    it('refuses an origin that only looks like an allowed one', () => {
        for (const origin of [
            'http://evil.example',
            'null',
            '',
            'http://localhost.evil.com',
            'http://127.0.0.1.evil.com',
            'http://evil.com#localhost',
            'http://LOCALHOST',
            'http://localhost/',
            'http://localhost:5173/path',
            'http://user@localhost',
            'http://localhost@evil.com',
            'http://[0:0:0:0:0:0:0:1]',
            'http://127.1',
            'file://localhost',
            'ws://localhost',
            'https://app.example.com/',
            'https://APP.example.com',
            'https://app.example.com.evil.com',
        ]) {
            expect(allowsOrigin(origin, listed), origin).toBe(false);
        }
    });

    it('refuses more than one Origin', () => {
        expect(allowsOrigin(['http://localhost', 'http://evil.example'], listed)).toBe(false);
    });
});

describe('mcpPlugin: Origin', () => {
    const k = new Kizuna();
    const ran: string[] = [];

    const notesRoutes = (auth: false | 'user') =>
        k.routes({
            getNote: k
                .route({
                    method: 'GET',
                    path: '/notes/:id',
                    tool: true,
                    auth: auth as never,
                    summary: 'Get a note',
                    responses: {
                        200: z.object({
                            id: z.string(),
                        }),
                    },
                })
                .handler(({ params }) => {
                    ran.push(params.id);
                    return {
                        status: 200,
                        body: {
                            id: params.id,
                        },
                    };
                }),
        });

    const user = k.identity
        .oauth2({
            issuer: 'https://auth.example.com',
            flows: {
                authorizationCode: {
                    authorizationUrl: 'https://auth.example.com/oauth2/authorize',
                    tokenUrl: 'https://auth.example.com/oauth2/token',
                    scopes: {
                        'notes:read': 'Read notes',
                    },
                },
            },
        })
        .guard(({ oauth2, deny }) => {
            if (oauth2?.token !== 'reader')
                return deny({
                    status: 401,
                    body: {
                        detail: 'Invalid or expired token',
                    },
                });
        });

    const openApi = defineConfig({
        adapter: expressAdapter(),
        routes: [notesRoutes(false)],
        plugins: [
            mcpPlugin({
                allowedOrigins: ['https://app.example.com'],
            }),
        ],
    }).api;

    const oauthApi = defineConfig({
        adapter: expressAdapter(),
        auth: {
            identities: {
                user,
            },
        },
        routes: [notesRoutes('user')],
        plugins: [
            mcpPlugin({
                oauth: {
                    resource: 'https://api.example.com/mcp',
                    scheme: 'user',
                },
            }),
        ],
    }).api;

    let running: Server | undefined;

    afterEach(async () => {
        await new Promise<void>((resolve) => {
            if (running) running.close(() => resolve());
            else resolve();
        });
        running = undefined;
        ran.length = 0;
    });

    const start = async (api: typeof openApi | typeof oauthApi): Promise<number> => {
        const app = express();
        app.use(express.json());
        api.mount(app);
        return new Promise((resolve) => {
            const listening = app.listen(0, () => {
                running = listening;
                resolve((listening.address() as { port: number }).port);
            });
        });
    };

    const callGetNote = (port: number, headers: Record<string, string>) =>
        fetch(`http://127.0.0.1:${port}/mcp`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                accept: 'application/json, text/event-stream',
                ...headers,
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'get_note',
                    arguments: {
                        params: {
                            id: 'n1',
                        },
                    },
                },
            }),
        });

    it('answers a request with no Origin', async () => {
        const port = await start(openApi);
        const response = await callGetNote(port, {});
        expect(response.status).toBe(200);
        expect(ran).toEqual(['n1']);
    });

    it('answers a foreign Origin with 403 problem details, before anything runs', async () => {
        const port = await start(openApi);
        const response = await callGetNote(port, {
            origin: 'http://evil.example',
            host: 'evil.example',
        });
        expect(response.status).toBe(403);
        expect(response.headers.get('content-type')).toContain('application/problem+json');
        expect(((await response.json()) as { status: number }).status).toBe(403);
        expect(ran).toEqual([]);
    });

    it('answers a localhost Origin and a listed one', async () => {
        const port = await start(openApi);
        expect(
            (
                await callGetNote(port, {
                    origin: 'http://localhost:5173',
                })
            ).status
        ).toBe(200);
        expect(
            (
                await callGetNote(port, {
                    origin: 'https://app.example.com',
                })
            ).status
        ).toBe(200);
        expect(ran).toEqual(['n1', 'n1']);
    });

    it('accepts the origin of the oauth resource', async () => {
        const port = await start(oauthApi);
        const response = await callGetNote(port, {
            origin: 'https://api.example.com',
            authorization: 'Bearer reader',
        });
        expect(response.status).toBe(200);
        expect(ran).toEqual(['n1']);
    });

    it('refuses a foreign Origin even with a valid token', async () => {
        const port = await start(oauthApi);
        const response = await callGetNote(port, {
            origin: 'http://evil.example',
            authorization: 'Bearer reader',
        });
        expect(response.status).toBe(403);
        expect(response.headers.get('www-authenticate')).toBeNull();
        expect(ran).toEqual([]);
    });

    it('rejects an allowedOrigins entry that is not an origin, naming the field', () => {
        for (const origin of [
            '*',
            'null',
            'https://app.example.com/',
            'app.example.com',
            'https://*.example.com',
            'https://APP.example.com',
            'https://app.example.com:443',
            'https://bücher.example',
        ]) {
            expect(
                () =>
                    defineConfig({
                        adapter: expressAdapter(),
                        routes: [notesRoutes(false)],
                        plugins: [
                            mcpPlugin({
                                allowedOrigins: [origin],
                            }),
                        ],
                    }),
                origin
            ).toThrow(/\[kizuna\] Plugin 'mcp' has invalid options: allowedOrigins\.0: /);
        }
    });
});
