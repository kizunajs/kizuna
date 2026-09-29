import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { streamToolsOf, toolEvents } from './tool-events.js';
import { formatEvent } from './stream.js';
import { Kizuna } from './kizuna.js';

const toolRoutesK = new Kizuna();

const tools = toolRoutesK.routes({
    weather: {
        getForecast: toolRoutesK.route({
            method: 'POST',
            path: '/forecast',
            body: z.object({
                city: z.string(),
            }),
            responses: {
                200: z.object({
                    tempC: z.number(),
                }),
            },
            summary: 'Look up the forecast for one city',
            tool: true,
        }),
    },
    ping: toolRoutesK.route({
        method: 'GET',
        path: '/ping',
        responses: {
            200: z.object({
                ok: z.boolean(),
            }),
        },
        summary: 'Answer that the server is up',
        tool: true,
    }),
});

describe('toolEvents', () => {
    it('adds tool_call, tool_result and tool_error', () => {
        expect(Object.keys(toolEvents(tools))).toEqual(['tool_call', 'tool_result', 'tool_error']);
    });

    it('throws on a tool set with no tools in it', () => {
        expect(() => toolEvents({})).toThrow(/was given no routes/);
    });

    it('parses a call for the tool it names', () => {
        const events = toolEvents(tools);
        expect(
            events.tool_call.parse({
                id: 'call_1',
                name: 'weather.getForecast',
                input: {
                    body: {
                        city: 'Oslo',
                    },
                },
            })
        ).toEqual({
            id: 'call_1',
            name: 'weather.getForecast',
            input: {
                body: {
                    city: 'Oslo',
                },
            },
        });
    });

    it('refuses a call whose input is not the named tool own', () => {
        const events = toolEvents(tools);
        expect(
            events.tool_call.safeParse({
                id: 'call_1',
                name: 'weather.getForecast',
                input: {
                    city: 14,
                },
            }).success
        ).toBe(false);
    });

    it('refuses a call naming a tool the set does not declare', () => {
        const events = toolEvents(tools);
        expect(
            events.tool_call.safeParse({
                id: 'call_1',
                name: 'weather.getHistory',
                input: {
                    body: {
                        city: 'Oslo',
                    },
                },
            }).success
        ).toBe(false);
    });

    it('parses a call for a tool taking no arguments', () => {
        const events = toolEvents(tools);
        expect(
            events.tool_call.parse({
                id: 'call_2',
                name: 'ping',
            })
        ).toEqual({
            id: 'call_2',
            name: 'ping',
        });
    });

    it('parses a result carrying the tool own output', () => {
        const events = toolEvents(tools);
        expect(
            events.tool_result.parse({
                id: 'call_1',
                name: 'weather.getForecast',
                output: {
                    tempC: 14,
                },
            })
        ).toEqual({
            id: 'call_1',
            name: 'weather.getForecast',
            output: {
                tempC: 14,
            },
        });
    });

    it('takes any declared tool name on an error', () => {
        const events = toolEvents(tools);
        expect(
            events.tool_error.parse({
                id: 'call_1',
                name: 'ping',
                message: 'the clock is unset',
            })
        ).toEqual({
            id: 'call_1',
            name: 'ping',
            message: 'the clock is unset',
        });
    });

    it('refuses an error naming a tool the set does not declare', () => {
        const events = toolEvents(tools);
        expect(
            events.tool_error.safeParse({
                id: 'call_1',
                name: 'weather.getHistory',
                message: 'nope',
            }).success
        ).toBe(false);
    });

    it('builds a union even for a single tool', () => {
        const events = toolEvents(
            toolRoutesK.routes({
                ping: toolRoutesK.route({
                    method: 'GET',
                    path: '/ping-only',
                    responses: {
                        200: z.object({
                            ok: z.boolean(),
                        }),
                    },
                    summary: 'Answer that the server is up',
                    tool: true,
                }),
            })
        );
        expect(
            events.tool_call.parse({
                id: 'call_1',
                name: 'ping',
            })
        ).toEqual({
            id: 'call_1',
            name: 'ping',
        });
    });
});

describe('a tool answering with a status other than 200', () => {
    const events = toolEvents(
        toolRoutesK.routes({
            addReminder: toolRoutesK.route({
                method: 'POST',
                path: '/reminders',
                body: z.object({
                    text: z.string(),
                }),
                responses: {
                    201: z.object({
                        id: z.string(),
                    }),
                },
                summary: 'Add a reminder',
                tool: {
                    needsApproval: true,
                },
            }),
        })
    );

    it('carries the 201 body as the output', () => {
        expect(
            events.tool_result.safeParse({
                id: 'call_1',
                name: 'addReminder',
                output: {
                    id: 'reminder_1',
                },
            }).success
        ).toBe(true);
        expect(
            events.tool_result.safeParse({
                id: 'call_1',
                name: 'addReminder',
            }).success
        ).toBe(false);
    });

    it('lets a call say it waits for approval', () => {
        expect(
            events.tool_call.parse({
                id: 'call_1',
                name: 'addReminder',
                needsApproval: true,
                input: {
                    body: {
                        text: 'Stand up',
                    },
                },
            })
        ).toMatchObject({
            needsApproval: true,
        });
    });
});

describe('the wire a tool event produces', () => {
    it('frames a call and its result as named server-sent events', () => {
        const call = formatEvent(
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
            },
            true
        );
        const result = formatEvent(
            {
                event: 'tool_result',
                data: {
                    id: 'toolu_01',
                    name: 'weather.getForecast',
                    output: {
                        tempC: 14,
                    },
                },
            },
            true
        );

        expect(call).toBe('event: tool_call\ndata: {"id":"toolu_01","name":"weather.getForecast","input":{"body":{"city":"Oslo"}}}\n\n');
        expect(result).toBe('event: tool_result\ndata: {"id":"toolu_01","name":"weather.getForecast","output":{"tempC":14}}\n\n');
    });
});

describe('expandStreamTools', () => {
    const k = new Kizuna();

    const declared = k.routes({
        countWords: k.route({
            method: 'POST',
            path: '/word-count',
            body: z.object({
                text: z.string(),
            }),
            responses: {
                200: z.object({
                    words: z.int(),
                }),
            },
            summary: 'Count the words in a piece of text',
            tool: true,
        }),
    });

    it('folds the tool events into the stream and drops the tools field', () => {
        const routes = k.routes({
            reply: k.route({
                method: 'POST',
                path: '/reply',
                responses: {
                    200: {
                        stream: {
                            delta: z.object({
                                text: z.string(),
                            }),
                        },
                        tools: declared,
                    },
                },
            }),
        });

        const response = routes['reply']!.responses[200] as {
            stream: Record<string, z.ZodType>;
            tools?: unknown;
        };
        expect(Object.keys(response.stream)).toEqual(['delta', 'tool_call', 'tool_result', 'tool_error']);
        expect('tools' in response).toBe(false);
        expect(streamToolsOf(response)).toBe(declared);
    });

    it('throws on a named route that does not declare tool', () => {
        const undeclared = k.routes({
            countLines: k.route({
                method: 'POST',
                path: '/line-count',
                responses: {
                    200: z.object({
                        lines: z.int(),
                    }),
                },
            }),
        });
        expect(() =>
            k.routes({
                reply: k.route({
                    method: 'POST',
                    path: '/reply',
                    responses: {
                        200: {
                            stream: {
                                delta: z.object({
                                    text: z.string(),
                                }),
                            },
                            tools: undeclared,
                        },
                    },
                }),
            })
        ).toThrow(/naming "countLines", which does not declare `tool`/);
    });

    it('throws on a named route that streams', () => {
        const streaming = k.routes({
            tail: k.route({
                method: 'GET',
                path: '/tail',
                responses: {
                    200: {
                        stream: z.object({
                            line: z.string(),
                        }),
                    },
                },
                summary: 'Follow the log',
                tool: true,
            }),
        });
        expect(() =>
            k.routes({
                reply: k.route({
                    method: 'POST',
                    path: '/reply',
                    responses: {
                        200: {
                            stream: {
                                delta: z.object({
                                    text: z.string(),
                                }),
                            },
                            tools: streaming,
                        },
                    },
                }),
            })
        ).toThrow(/naming "tail", which cannot run as a tool: it streams/);
    });

    it('throws when it names a hidden route', () => {
        const hiddenTools = k.routes({
            health: k.route({
                method: 'GET',
                path: '/health',
                summary: 'Check the service',
                hidden: true,
                tool: true,
                responses: {
                    200: z.object({
                        ok: z.boolean(),
                    }),
                },
            } as never),
        });
        expect(() =>
            k.routes({
                reply: k.route({
                    method: 'POST',
                    path: '/reply',
                    responses: {
                        200: {
                            stream: {
                                delta: z.object({
                                    text: z.string(),
                                }),
                            },
                            tools: hiddenTools,
                        },
                    },
                }),
            })
        ).toThrow(/naming "health", which cannot run as a tool: it is hidden/);
    });

    it('throws when two responses name tools', () => {
        expect(() =>
            k.routes({
                reply: k.route({
                    method: 'POST',
                    path: '/reply',
                    responses: {
                        200: {
                            stream: {
                                delta: z.object({
                                    text: z.string(),
                                }),
                            },
                            tools: declared,
                        },
                        206: {
                            stream: {
                                delta: z.object({
                                    text: z.string(),
                                }),
                            },
                            tools: declared,
                        },
                    },
                }),
            })
        ).toThrow(/name them on one response/);
    });

    it('throws when the stream already names a tool event', () => {
        expect(() =>
            k.routes({
                reply: k.route({
                    method: 'POST',
                    path: '/reply',
                    responses: {
                        200: {
                            stream: {
                                tool_call: z.object({
                                    mine: z.string(),
                                }),
                            },
                            tools: declared,
                        },
                    },
                }),
            })
        ).toThrow(/already names an event "tool_call"/);
    });

    it('throws when tools sit beside a single stream schema', () => {
        expect(() =>
            k.routes({
                reply: k.route({
                    method: 'POST',
                    path: '/reply',
                    responses: {
                        200: {
                            stream: z.object({
                                text: z.string(),
                            }),
                            tools: declared,
                        },
                    },
                }),
            })
        ).toThrow(/beside a single stream schema/);
    });
});
