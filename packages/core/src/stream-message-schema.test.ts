import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import { readToolCalls } from './tool-records.js';
import { streamMessageSchema } from './stream-message-schema.js';
import type { StreamMessageOf } from './stream.js';

const k = new Kizuna();

const assistantTools = k.routes({
    weather: {
        getForecast: k.route({
            method: 'POST',
            path: '/forecast',
            body: z.object({
                city: z.string(),
            }),
            responses: {
                200: z.object({
                    temperature: z.number(),
                }),
            },
            summary: 'Look up the forecast for one city',
            tool: true,
        }),
    },
});

const replyRoute = k.route({
    method: 'POST',
    path: '/assistant/reply',
    body: z.object({
        prompt: z.string(),
    }),
    responses: {
        200: {
            stream: {
                delta: z.object({
                    text: z.string(),
                }),
                done: z.object({
                    outputTokens: z.int(),
                }),
            },
            tools: assistantTools,
        },
    },
});

const assistantRoutes = k.routes({
    reply: replyRoute,
});

describe('streamMessageSchema', () => {
    it('reads a message of each event the stream declares, with its id', () => {
        const schema = streamMessageSchema(assistantRoutes.reply);

        expect(
            schema.parse({
                event: 'delta',
                data: {
                    text: 'Tomorrow in Oslo',
                },
                id: '4',
            })
        ).toEqual({
            event: 'delta',
            data: {
                text: 'Tomorrow in Oslo',
            },
            id: '4',
        });
    });

    it('refuses an event the stream does not declare', () => {
        const schema = streamMessageSchema(assistantRoutes.reply);

        expect(
            schema.safeParse({
                event: 'thinking',
                data: {
                    text: 'Hmm',
                },
            }).success
        ).toBe(false);
    });

    it('reads the tool events its tools add, after k.routes and before it', () => {
        const message = {
            event: 'tool_call',
            data: {
                id: 'toolu_01',
                name: 'weather.getForecast',
                input: {
                    body: {
                        city: 'Oslo',
                    },
                },
            },
        };

        expect(streamMessageSchema(assistantRoutes.reply).parse(message)).toEqual(message);
        expect(streamMessageSchema(replyRoute).parse(message)).toEqual(message);
    });

    it('hands saved messages to readToolCalls as they came over the wire', () => {
        const saved = [
            {
                event: 'tool_call',
                data: {
                    id: 'toolu_01',
                    name: 'weather.getForecast',
                    input: {
                        body: {
                            city: 'Oslo',
                        },
                    },
                },
                id: '1',
            },
            {
                event: 'tool_result',
                data: {
                    id: 'toolu_01',
                    name: 'weather.getForecast',
                    output: {
                        temperature: 14,
                    },
                },
                id: '2',
            },
        ];

        const messages = z.array(streamMessageSchema(assistantRoutes.reply)).parse(saved);

        expect(readToolCalls(messages)).toEqual([
            {
                id: 'toolu_01',
                name: 'weather.getForecast',
                state: 'done',
                input: {
                    body: {
                        city: 'Oslo',
                    },
                },
                output: {
                    temperature: 14,
                },
                message: undefined,
            },
        ]);
    });

    it('reads a stream with one unnamed schema as data alone', () => {
        const watchNotifications = k.route({
            method: 'GET',
            path: '/notifications/stream',
            responses: {
                200: {
                    stream: z.object({
                        title: z.string(),
                    }),
                },
            },
        });

        expect(
            streamMessageSchema(watchNotifications).parse({
                data: {
                    title: 'Invoice paid',
                },
                id: 'n_1',
                retry: 3000,
            })
        ).toEqual({
            data: {
                title: 'Invoice paid',
            },
            id: 'n_1',
            retry: 3000,
        });
    });

    it('reads the status it is given when a route streams on two', () => {
        const exportNotes = k.route({
            method: 'GET',
            path: '/notes/export',
            responses: {
                200: {
                    stream: {
                        note: z.object({
                            text: z.string(),
                        }),
                    },
                },
                206: {
                    stream: {
                        page: z.object({
                            from: z.int(),
                        }),
                    },
                },
            },
        });

        expect(() => streamMessageSchema(exportNotes)).toThrow(/streams on 200 and 206/);
        expect(
            streamMessageSchema(exportNotes, 206).parse({
                event: 'page',
                data: {
                    from: 20,
                },
            })
        ).toEqual({
            event: 'page',
            data: {
                from: 20,
            },
        });
    });

    it('throws on a route that does not stream', () => {
        const getNote = k.route({
            method: 'GET',
            path: '/notes/:id',
            responses: {
                200: z.object({
                    text: z.string(),
                }),
            },
        });

        expect(() => streamMessageSchema(getNote as never)).toThrow(/does not stream/);
    });

    it('throws on a stream of raw chunks, which has no messages', () => {
        const downloadNotes = k.route({
            method: 'GET',
            path: '/notes/download',
            responses: {
                200: {
                    stream: z.string(),
                    contentType: 'text/plain',
                },
            },
        });

        expect(() => streamMessageSchema(downloadNotes)).toThrow(/raw chunks/);
    });

    it('infers the message type the clients read', () => {
        const schema = streamMessageSchema(assistantRoutes.reply);

        expectTypeOf<z.infer<typeof schema>>().toEqualTypeOf<StreamMessageOf<(typeof replyRoute)['responses'][200]>>();
    });
});
