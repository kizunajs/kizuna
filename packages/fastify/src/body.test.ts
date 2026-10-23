import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Transform } from 'node:stream';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { Kizuna, defineConfig } from 'kizunajs';
import { fastifyAdapter } from './server.js';

interface Config {
    adapter: ReturnType<typeof fastifyAdapter>;
}

const k = new Kizuna<Config>();

const routes = k.routes({
    receiveSigned: k
        .route({
            method: 'POST',
            path: '/signed',
            rawBody: true,
            body: z.object({
                name: z.string(),
            }),
            responses: {
                200: z.object({
                    rawBody: z.string(),
                    name: z.string(),
                }),
            },
        })
        .handler(({ rawBody, body }) => ({
            status: 200,
            body: {
                rawBody,
                name: body.name,
            },
        })),
});

const api = defineConfig({
    adapter: fastifyAdapter(),
    routes: [routes],
}).api;

const listen = async (app: FastifyInstance): Promise<number> => {
    await api.mount(app);
    await app.listen({
        port: 0,
        host: '127.0.0.1',
    });
    return (app.server.address() as AddressInfo).port;
};

interface Sent {
    status: number | undefined;
    text: string;
}

/**
 * Send a body in parts, each written once the previous one has had time to
 * arrive on its own, so the server reads it as separate chunks.
 */
const sendInParts = (port: number, parts: Buffer[], headers: Record<string, string>): Promise<Sent> =>
    new Promise((resolve, reject) => {
        const outgoing = httpRequest({
            host: '127.0.0.1',
            port,
            method: 'POST',
            path: '/signed',
            headers,
            agent: false,
        });
        outgoing.on('response', (response) => {
            const received: Buffer[] = [];
            response.on('data', (chunk: Buffer) => received.push(chunk));
            response.on('end', () =>
                resolve({
                    status: response.statusCode,
                    text: Buffer.concat(received).toString('utf8'),
                })
            );
        });
        outgoing.on('error', reject);
        const writeFrom = (index: number) => {
            if (index === parts.length) {
                outgoing.end();
                return;
            }
            outgoing.write(parts[index]);
            setTimeout(() => writeFrom(index + 1), 20);
        };
        writeFrom(0);
    });

describe('Fastify: a rawBody route', () => {
    let app: FastifyInstance;
    let port: number;

    beforeAll(async () => {
        app = Fastify();
        port = await listen(app);
    });

    afterAll(async () => {
        await app.close();
    });

    it('keeps the body byte for byte when it arrives in chunks that split a character', async () => {
        const text = '{ "name" :  "Åse 🎉 Ødegård" }';
        const bytes = Buffer.from(text, 'utf8');
        const emoji = bytes.indexOf(Buffer.from('🎉', 'utf8'));
        const parts = [bytes.subarray(0, emoji + 1), bytes.subarray(emoji + 1, emoji + 3), bytes.subarray(emoji + 3)];

        const framings: Array<Record<string, string>> = [
            {
                'content-type': 'application/json',
                'content-length': String(bytes.length),
            },
            {
                'content-type': 'application/json',
                'transfer-encoding': 'chunked',
            },
        ];
        for (const headers of framings) {
            const sent = await sendInParts(port, parts, headers);
            expect(sent.status).toBe(200);
            expect(JSON.parse(sent.text)).toEqual({
                rawBody: text,
                name: 'Åse 🎉 Ødegård',
            });
        }
    });

    it('keeps a body larger than one chunk byte for byte', async () => {
        const text = `{ "name" :  "${'Æ'.repeat(200_000)}" }`;
        const response = await fetch(`http://127.0.0.1:${port}/signed`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: text,
        });
        expect(response.status).toBe(200);
        const body = (await response.json()) as { rawBody: string };
        expect(body.rawBody).toBe(text);
    });

    it('refuses a body type Fastify cannot parse without leaving the stream open', async () => {
        const uncaught: unknown[] = [];
        const record = (error: unknown) => uncaught.push(error);
        process.on('uncaughtException', record);
        try {
            const sent = await sendInParts(port, [Buffer.from('<user name="Ada" />'), Buffer.from('x'.repeat(100_000))], {
                'content-type': 'application/xml',
                'transfer-encoding': 'chunked',
            });
            expect(sent.status).toBe(415);
            await new Promise((resolve) => setTimeout(resolve, 100));
        } finally {
            process.off('uncaughtException', record);
        }
        expect(uncaught).toEqual([]);
    });

    it('refuses a body with a Content-Length it does not have', async () => {
        const text = '{ "name" :  "Ada" }';
        const sent = await sendInParts(port, [Buffer.from(text)], {
            'content-type': 'application/json',
            'content-length': String(text.length - 1),
        });
        expect(sent.status).toBe(400);
    });
});

describe('Fastify: a rawBody route over the body limit', () => {
    const bodyLimit = 1024;
    const total = 20 * 1024 * 1024;
    const chunkSize = 64 * 1024;
    const read = new Map<string, number>();
    const replies = new Map<
        string,
        {
            status: number;
            read: number;
        }
    >();
    let app: FastifyInstance;
    let port: number;

    beforeAll(async () => {
        app = Fastify({
            bodyLimit,
        });
        // Counts what the server has read from the socket, and what it had read by the time it replied.
        app.addHook('preParsing', async (request, _reply, payload) => {
            const testCase = String(request.headers['x-test-case']);
            read.set(testCase, 0);
            const counter = new Transform({
                transform(chunk: Buffer, _encoding, callback) {
                    read.set(testCase, (read.get(testCase) ?? 0) + chunk.length);
                    callback(null, chunk);
                },
            });
            payload.pipe(counter);
            return counter;
        });
        app.addHook('onSend', async (request, reply, payload) => {
            const testCase = String(request.headers['x-test-case']);
            replies.set(testCase, {
                status: reply.statusCode,
                read: read.get(testCase) ?? 0,
            });
            return payload;
        });
        port = await listen(app);
    });

    afterAll(async () => {
        await app.close();
    });

    /**
     * Write until the server answers or closes the connection. The client may
     * see the close before the answer, so the tests read the server's side.
     */
    const sendLarge = (testCase: string, headers: Record<string, string>): Promise<void> =>
        new Promise((resolve) => {
            const outgoing = httpRequest({
                host: '127.0.0.1',
                port,
                method: 'POST',
                path: '/signed',
                headers: {
                    'content-type': 'application/json',
                    'x-test-case': testCase,
                    ...headers,
                },
                agent: false,
            });
            let written = 0;
            let stopped = false;
            const filler = Buffer.alloc(chunkSize, 'a');
            const pump = () => {
                while (!stopped && written < total) {
                    written += chunkSize;
                    if (!outgoing.write(filler)) {
                        outgoing.once('drain', pump);
                        return;
                    }
                }
                if (!stopped) outgoing.end();
            };
            const stop = () => {
                stopped = true;
                resolve();
            };
            outgoing.on('response', (response) => {
                response.resume();
                stop();
            });
            outgoing.on('error', stop);
            pump();
        });

    it('answers 413 having read little more than the limit, for a chunked body', async () => {
        await sendLarge('chunked', {
            'transfer-encoding': 'chunked',
        });
        expect(replies.get('chunked')?.status).toBe(413);
        expect(replies.get('chunked')?.read).toBeLessThan(bodyLimit + 4 * chunkSize);
    });

    it('answers 413 having read little more than the limit, for a declared Content-Length', async () => {
        await sendLarge('declared', {
            'content-length': String(total),
        });
        expect(replies.get('declared')?.status).toBe(413);
        expect(replies.get('declared')?.read).toBeLessThan(bodyLimit + 4 * chunkSize);
    });
});
