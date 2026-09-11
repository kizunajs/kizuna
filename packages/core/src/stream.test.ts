import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import { BinarySchema } from './binary.js';
import { ProblemDetailsSchema } from './error-response.js';
import { encodeStream, formatEvent, streamMode } from './stream.js';
import type { RouteDefinition } from './types.js';

const k = new Kizuna({
    tags: Kizuna.tags({
        api: 'API',
    }),
});

const decoder = new TextDecoder();

const readAll = async (stream: ReadableStream<Uint8Array>): Promise<string> => {
    const reader = stream.getReader();
    let text = '';
    for (;;) {
        const { done, value } = await reader.read();
        if (done) return text;
        text += decoder.decode(value, {
            stream: true,
        });
    }
};

const eventsRoute: RouteDefinition = {
    method: 'GET',
    path: '/events',
    responses: {
        200: {
            stream: {
                delta: z.object({
                    text: z.string(),
                }),
                done: z.object({
                    count: z.int(),
                }),
            },
        },
    },
};

describe('formatEvent', () => {
    it('frames a named event with data, id, and retry', () => {
        expect(
            formatEvent(
                {
                    event: 'delta',
                    data: {
                        text: 'a',
                    },
                    id: 'evt-1',
                    retry: 5000,
                },
                true
            )
        ).toBe('event: delta\ndata: {"text":"a"}\nid: evt-1\nretry: 5000\n\n');
    });

    it('writes an unnamed event as data alone', () => {
        expect(
            formatEvent(
                {
                    data: 1,
                },
                false
            )
        ).toBe('data: 1\n\n');
    });

    it('splits a comment on line breaks so each line is a comment', () => {
        expect(
            formatEvent(
                {
                    comment: 'first\nsecond',
                },
                false
            )
        ).toBe(': first\n: second\n\n');
    });

    it('refuses an id with a line break or NUL', () => {
        expect(() =>
            formatEvent(
                {
                    data: 1,
                    id: 'a\nb',
                },
                false
            )
        ).toThrow(/line break or NUL/);
    });

    it('refuses a retry that is not a whole number of milliseconds', () => {
        expect(() =>
            formatEvent(
                {
                    data: 1,
                    retry: 1.5,
                },
                false
            )
        ).toThrow(/whole number/);
    });
});

describe('streamMode', () => {
    it('defaults to server-sent events', () => {
        expect(
            streamMode({
                stream: z.string(),
            })
        ).toBe('events');
    });

    it('reads text/* as raw text chunks and anything else as bytes', () => {
        expect(
            streamMode({
                stream: z.string(),
                contentType: 'text/csv; charset=utf-8',
            })
        ).toBe('text');
        expect(
            streamMode({
                stream: BinarySchema,
                contentType: 'application/zip',
            })
        ).toBe('binary');
    });
});

describe('encodeStream', () => {
    it('pulls events from a generator function and frames each one', async () => {
        const stream = encodeStream(
            {
                routeKey: 'watch',
                route: eventsRoute,
                status: 200,
                stream: async function* () {
                    yield {
                        event: 'delta',
                        data: {
                            text: 'a',
                        },
                    };
                    yield {
                        comment: 'keep-alive',
                    };
                    yield {
                        event: 'done',
                        data: {
                            count: 1,
                        },
                    };
                },
            },
            {
                signal: new AbortController().signal,
            }
        );
        expect(await readAll(stream)).toBe('event: delta\ndata: {"text":"a"}\n\n: keep-alive\n\nevent: done\ndata: {"count":1}\n\n');
    });

    it('hands the generator the signal', async () => {
        const controller = new AbortController();
        let received: AbortSignal | undefined;
        const stream = encodeStream(
            {
                routeKey: 'watch',
                route: eventsRoute,
                status: 200,
                stream: async function* ({ signal }: { signal: AbortSignal }) {
                    received = signal;
                    yield {
                        event: 'done',
                        data: {
                            count: 0,
                        },
                    };
                },
            },
            {
                signal: controller.signal,
            }
        );
        await readAll(stream);
        expect(received).toBe(controller.signal);
    });

    it('runs the generator’s finally block when the signal aborts', async () => {
        const controller = new AbortController();
        let finished = false;
        const stream = encodeStream(
            {
                routeKey: 'watch',
                route: eventsRoute,
                status: 200,
                stream: async function* () {
                    try {
                        yield {
                            event: 'delta',
                            data: {
                                text: 'a',
                            },
                        };
                        yield {
                            event: 'delta',
                            data: {
                                text: 'b',
                            },
                        };
                    } finally {
                        finished = true;
                    }
                },
            },
            {
                signal: controller.signal,
            }
        );
        const reader = stream.getReader();
        await reader.read();
        controller.abort();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(finished).toBe(true);
    });

    it('errors the stream and reports when the generator throws', async () => {
        const seen: unknown[] = [];
        const stream = encodeStream(
            {
                routeKey: 'watch',
                route: eventsRoute,
                status: 200,
                stream: async function* () {
                    yield {
                        event: 'delta',
                        data: {
                            text: 'a',
                        },
                    };
                    throw new Error('boom');
                },
            },
            {
                signal: new AbortController().signal,
                onError: (error) => seen.push(error),
            }
        );
        await expect(readAll(stream)).rejects.toThrow('boom');
        expect(seen).toHaveLength(1);
    });

    it('refuses an event the stream does not declare', async () => {
        const stream = encodeStream(
            {
                routeKey: 'watch',
                route: eventsRoute,
                status: 200,
                stream: async function* () {
                    yield {
                        event: 'nope',
                        data: {},
                    };
                },
            },
            {
                signal: new AbortController().signal,
            }
        );
        await expect(readAll(stream)).rejects.toThrow(/does not declare/);
    });

    it('validates each message when asked', async () => {
        const stream = encodeStream(
            {
                routeKey: 'watch',
                route: eventsRoute,
                status: 200,
                stream: async function* () {
                    yield {
                        event: 'delta',
                        data: {
                            text: 42,
                        },
                    };
                },
            },
            {
                signal: new AbortController().signal,
                validate: true,
            }
        );
        await expect(readAll(stream)).rejects.toThrow(/validation failed/);
    });

    it('writes text chunks as they are', async () => {
        const stream = encodeStream(
            {
                routeKey: 'lines',
                route: {
                    method: 'GET',
                    path: '/lines',
                    responses: {
                        200: {
                            stream: z.string(),
                            contentType: 'text/plain',
                        },
                    },
                },
                status: 200,
                stream: async function* () {
                    yield 'one\n';
                    yield 'two\n';
                },
            },
            {
                signal: new AbortController().signal,
            }
        );
        expect(await readAll(stream)).toBe('one\ntwo\n');
    });

    it('passes a ReadableStream of bytes through', async () => {
        const upstream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array([1, 2]));
                controller.enqueue(new Uint8Array([3]));
                controller.close();
            },
        });
        const stream = encodeStream(
            {
                routeKey: 'bytes',
                route: {
                    method: 'GET',
                    path: '/bytes',
                    responses: {
                        200: {
                            stream: BinarySchema,
                            contentType: 'application/octet-stream',
                        },
                    },
                },
                status: 200,
                stream: upstream,
            },
            {
                signal: new AbortController().signal,
            }
        );
        const chunks: number[] = [];
        const reader = stream.getReader();
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(...value);
        }
        expect(chunks).toEqual([1, 2, 3]);
    });

    it('refuses a stream that is neither a function nor an async iterable', () => {
        expect(() =>
            encodeStream(
                {
                    routeKey: 'watch',
                    route: eventsRoute,
                    status: 200,
                    stream: {
                        text: 'x',
                    },
                },
                {
                    signal: new AbortController().signal,
                }
            )
        ).toThrow(/async generator function or an async iterable/);
    });
});

describe('k.routes stream validation', () => {
    const define = (route: Record<string, unknown>) =>
        k.routes('api', {
            watch: route,
        } as never);

    it('accepts a named event stream and an unnamed one', () => {
        expect(() =>
            define({
                method: 'GET',
                path: '/a',
                responses: {
                    200: {
                        stream: {
                            delta: z.object({
                                text: z.string(),
                            }),
                        },
                    },
                    202: {
                        stream: z.string(),
                    },
                },
            })
        ).not.toThrow();
    });

    it('refuses a stream on an error status', () => {
        expect(() =>
            define({
                method: 'GET',
                path: '/a',
                responses: {
                    404: {
                        stream: ProblemDetailsSchema,
                    },
                },
            })
        ).toThrow(/only a 2xx status can stream/);
    });

    it('refuses a stream beside a body', () => {
        expect(() =>
            define({
                method: 'GET',
                path: '/a',
                responses: {
                    200: {
                        stream: z.string(),
                        body: z.string(),
                    },
                },
            })
        ).toThrow(/beside a body/);
    });

    it('refuses a stream on a HEAD route', () => {
        expect(() =>
            define({
                method: 'HEAD',
                path: '/a',
                responses: {
                    200: {
                        stream: z.string(),
                    },
                },
            })
        ).toThrow(/HEAD response has no content/);
    });

    it('refuses a JSON content type', () => {
        expect(() =>
            define({
                method: 'GET',
                path: '/a',
                responses: {
                    200: {
                        stream: z.string(),
                        contentType: 'application/json',
                    },
                },
            })
        ).toThrow(/JSON messages stream as text\/event-stream/);
    });

    it('requires z.string() for text/* and BinarySchema for binary content types', () => {
        expect(() =>
            define({
                method: 'GET',
                path: '/a',
                responses: {
                    200: {
                        stream: z.object({}),
                        contentType: 'text/plain',
                    },
                },
            })
        ).toThrow(/must be z.string\(\)/);
        expect(() =>
            define({
                method: 'GET',
                path: '/a',
                responses: {
                    200: {
                        stream: z.string(),
                        contentType: 'application/zip',
                    },
                },
            })
        ).toThrow(/must be BinarySchema/);
    });

    it('refuses named events on a raw content type, an empty record, and a bad event name', () => {
        expect(() =>
            define({
                method: 'GET',
                path: '/a',
                responses: {
                    200: {
                        stream: {
                            line: z.string(),
                        },
                        contentType: 'text/plain',
                    },
                },
            })
        ).toThrow(/Named events need text\/event-stream/);
        expect(() =>
            define({
                method: 'GET',
                path: '/a',
                responses: {
                    200: {
                        stream: {},
                    },
                },
            })
        ).toThrow(/with no events/);
        expect(() =>
            define({
                method: 'GET',
                path: '/a',
                responses: {
                    200: {
                        stream: {
                            'two\nlines': z.string(),
                        },
                    },
                },
            })
        ).toThrow(/line break/);
    });
});
