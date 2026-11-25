import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { checkBodyHeaders, ContentTooLargeError, readBodyText, readBodyBytes } from './body-limit.js';
import { defineConfig } from './define-config.js';
import { Kizuna } from './kizuna.js';
import type { RouteDefinition } from './types.js';

const k = new Kizuna();

const createTask = {
    method: 'POST',
    path: '/tasks',
    bodyLimit: 8,
    body: z.object({
        title: z.string(),
    }),
    responses: {},
} as unknown as RouteDefinition;

const streamOf = (...chunks: string[]): ReadableStream<Uint8Array> =>
    new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
            controller.close();
        },
    });

describe('readBodyBytes', () => {
    it('reads a body at the limit', async () => {
        const bytes = await readBodyBytes(streamOf('1234', '5678'), 8);
        expect(new TextDecoder().decode(bytes)).toBe('12345678');
    });

    it('stops at the first byte past the limit', async () => {
        await expect(readBodyBytes(streamOf('1234', '56789'), 8)).rejects.toBeInstanceOf(ContentTooLargeError);
    });

    it('counts the bytes it reads, whatever Content-Length says', async () => {
        const request = new Request('http://localhost/tasks', {
            method: 'POST',
            headers: {
                'content-length': '4',
            },
            body: streamOf('1234', '56789'),
            duplex: 'half',
        } as RequestInit);
        await expect(readBodyText(request, 8)).rejects.toBeInstanceOf(ContentTooLargeError);
    });
});

describe('checkBodyHeaders', () => {
    it('refuses a Content-Length over the limit before reading', () => {
        expect(
            checkBodyHeaders(
                createTask,
                {
                    'content-length': '9',
                },
                8
            )
        ).toEqual({
            kind: 'content-too-large',
            limit: 8,
        });
    });

    it('refuses a compressed body', () => {
        expect(
            checkBodyHeaders(
                createTask,
                {
                    'content-encoding': 'gzip',
                },
                8
            )
        ).toEqual({
            kind: 'unsupported-content-coding',
            coding: 'gzip',
        });
    });

    it('takes an identity coding and a Content-Length at the limit', () => {
        expect(
            checkBodyHeaders(
                createTask,
                {
                    'content-encoding': 'identity',
                    'content-length': '8',
                },
                8
            )
        ).toBeUndefined();
    });
});

describe('defineConfig bodyLimit', () => {
    const routesWith = (bodyLimit?: number) =>
        k.routes({
            createTask: k
                .route({
                    method: 'POST',
                    path: '/tasks',
                    auth: false,
                    ...(bodyLimit === undefined
                        ? {}
                        : {
                              bodyLimit,
                          }),
                    body: z.object({
                        title: z.string(),
                    }),
                    responses: {
                        204: z.void(),
                    },
                })
                .handler(() => ({
                    status: 204,
                })),
        });

    it('refuses a limit that is not a whole number of bytes above zero', () => {
        expect(() =>
            defineConfig({
                routes: [routesWith(0)],
            })
        ).toThrow("Route 'createTask' sets `bodyLimit` to 0.");
        expect(() =>
            defineConfig({
                routes: [routesWith()],
                bodyLimit: 1.5,
            })
        ).toThrow('The config sets `bodyLimit` to 1.5.');
    });
});
