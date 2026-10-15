import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineAdapter, routerFromRoutes, type AdapterRequest, type AdapterResult, type GuardMap } from './adapter.js';
import { Kizuna } from './kizuna.js';
import { defineConfig } from './define-config.js';
import { readToolCalls } from './tool-records.js';
import type { ToolRunCall, ToolRunOptions, ToolRunResult } from './tool-runner.js';

interface Config {
    auth: {
        identities: {
            user: typeof user;
        };
    };
}

const k = new Kizuna<Config>();

const user = k.identity.bearer({
    context: z.object({
        userId: z.string(),
    }),
});

let logged: unknown[] = [];

const toolRoutes = k.routes({
    notes: {
        search: k
            .route({
                method: 'GET',
                path: '/notes',
                auth: 'user',
                query: z.object({
                    term: z.string().min(1),
                    limit: z.int().default(10),
                }),
                responses: {
                    200: z.object({
                        owner: z.string(),
                        term: z.string(),
                        limit: z.int(),
                    }),
                },
                summary: 'Search the signed-in user notes',
                tool: true,
            })
            .handler(({ query, auth }) => ({
                status: 200,
                body: {
                    owner: auth.user.userId,
                    term: query.term,
                    limit: query.limit,
                },
            })),
    },
    reminders: {
        add: k
            .route({
                method: 'POST',
                path: '/reminders',
                auth: 'user',
                body: z.object({
                    text: z.string(),
                    minutes: z.int(),
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
            })
            .handler(({ body }) => {
                logged.push(body);
                return {
                    status: 201,
                    body: {
                        id: 'reminder_1',
                    },
                };
            }),
    },
});

interface ReplyBody {
    call: ToolRunCall;
    options?: ToolRunOptions;
}

let results: ToolRunResult[] = [];

const assistantRoutes = k.routes({
    reply: k
        .route({
            method: 'POST',
            path: '/reply',
            auth: false,
            body: z.custom<ReplyBody>(),
            responses: {
                200: {
                    stream: {
                        done: z.object({
                            ok: z.boolean(),
                        }),
                    },
                    tools: toolRoutes,
                },
            },
        })
        .handler(({ body, tools }) => ({
            status: 200,
            body: async function* () {
                const result = yield* tools.run(body.call, body.options);
                results.push(result);
                yield {
                    event: 'done',
                    data: {
                        ok: true,
                    },
                };
            },
        })),
});

const api = defineConfig({
    auth: {
        identities: {
            user,
        },
    },
    routes: [toolRoutes, assistantRoutes],
}).api;

const guards: GuardMap<Record<string, never>> = {
    user: ({ bearer, deny }) => {
        if ((bearer as { token: string } | null)?.token !== 'tok_ada') {
            return deny({
                status: 401,
                body: {
                    detail: 'Sign in first',
                },
            });
        }
        return {
            userId: 'ada',
        };
    },
};

interface StreamedMessage {
    event: string;
    data: unknown;
}

/**
 * Stream a reply that runs one call, and collect what it yielded.
 */
const reply = async (body: ReplyBody, headers: Record<string, string> = {}): Promise<StreamedMessage[]> => {
    logged = [];
    results = [];
    const outcomes: AdapterResult[] = [];
    const adapter = defineAdapter<null, void, Record<string, never>>({
        buildHandlerContext: () => ({}),
        respond: (result) => {
            outcomes.push(result);
        },
    });
    const request: AdapterRequest<null> = {
        request: null,
        method: 'POST',
        resolution: {
            kind: 'core-match',
            path: '/reply',
        },
        query: {},
        headers: {
            'content-type': 'application/json',
            ...headers,
        },
        readBody: () => body,
    };
    await adapter.handle({
        routes: api.routes,
        router: routerFromRoutes(api.routes) as never,
        request,
        responseContext: {},
        guards,
        schemes: api.securitySchemes,
    });
    const outcome = outcomes[0];
    if (outcome?.kind !== 'success') throw new Error(`Expected a stream, got ${outcome?.kind}`);
    const messages: StreamedMessage[] = [];
    const stream = (outcome.body as (context: { signal: AbortSignal }) => AsyncIterable<StreamedMessage>)({
        signal: new AbortController().signal,
    });
    for await (const message of stream) messages.push(message);
    return messages;
};

const signedIn = {
    authorization: 'Bearer tok_ada',
};

describe('tools.run', () => {
    it('runs a call as the person streaming, and returns what the model reads', async () => {
        const messages = await reply(
            {
                call: {
                    id: 'call_1',
                    name: 'notes_search',
                    input: {
                        query: {
                            term: 'launch',
                        },
                    },
                },
            },
            signedIn
        );

        expect(messages).toEqual([
            {
                event: 'tool_call',
                data: {
                    id: 'call_1',
                    name: 'notes.search',
                    input: {
                        query: {
                            term: 'launch',
                            limit: 10,
                        },
                    },
                },
            },
            {
                event: 'tool_result',
                data: {
                    id: 'call_1',
                    name: 'notes.search',
                    output: {
                        owner: 'ada',
                        term: 'launch',
                        limit: 10,
                    },
                },
            },
            {
                event: 'done',
                data: {
                    ok: true,
                },
            },
        ]);
        expect(results[0]).toEqual({
            call: {
                id: 'call_1',
                name: 'notes_search',
                input: {
                    query: {
                        term: 'launch',
                    },
                },
            },
            state: 'done',
            status: 200,
            body: {
                owner: 'ada',
                term: 'launch',
                limit: 10,
            },
            content: '{"status":200,"body":{"owner":"ada","term":"launch","limit":10}}',
            isError: false,
        });
    });

    it('takes the dotted key as well as the published name', async () => {
        await reply(
            {
                call: {
                    id: 'call_1',
                    name: 'notes.search',
                    input: {
                        query: {
                            term: 'launch',
                        },
                    },
                },
            },
            signedIn
        );
        expect(results[0]?.state).toBe('done');
    });

    it('reports the guard refusing the caller as a failed call', async () => {
        const messages = await reply({
            call: {
                id: 'call_1',
                name: 'notes_search',
                input: {
                    query: {
                        term: 'launch',
                    },
                },
            },
        });

        expect(messages[1]).toEqual({
            event: 'tool_error',
            data: {
                id: 'call_1',
                name: 'notes.search',
                message: 'Sign in first',
            },
        });
        expect(results[0]).toMatchObject({
            state: 'failed',
            status: 401,
            isError: true,
        });
    });

    it('refuses input the route would refuse, without a call event', async () => {
        const messages = await reply(
            {
                call: {
                    id: 'call_1',
                    name: 'notes_search',
                    input: {
                        query: {
                            term: '',
                        },
                    },
                },
            },
            signedIn
        );

        expect(messages[0]).toEqual({
            event: 'tool_error',
            data: {
                id: 'call_1',
                name: 'notes.search',
                message: 'Invalid query parameters',
            },
        });
        expect(results[0]).toMatchObject({
            state: 'failed',
            status: 400,
        });
    });

    it('answers a name outside the response tools with a 404 and no events', async () => {
        const messages = await reply(
            {
                call: {
                    id: 'call_1',
                    name: 'billing_refund',
                },
            },
            signedIn
        );

        expect(messages.map((message) => message.event)).toEqual(['done']);
        expect(results[0]).toMatchObject({
            state: 'failed',
            status: 404,
        });
    });

    it('carries a 201 body as the result output', async () => {
        await reply(
            {
                call: {
                    id: 'call_1',
                    name: 'reminders_add',
                    input: {
                        body: {
                            text: 'Stand up',
                            minutes: 30,
                        },
                    },
                },
                options: {
                    approved: true,
                },
            },
            signedIn
        );

        expect(results[0]).toMatchObject({
            state: 'done',
            status: 201,
            body: {
                id: 'reminder_1',
            },
        });
        expect(logged).toEqual([
            {
                text: 'Stand up',
                minutes: 30,
            },
        ]);
    });
});

describe('a route that asks before it runs', () => {
    const addReminder = {
        id: 'call_1',
        name: 'reminders_add',
        input: {
            body: {
                text: 'Stand up',
                minutes: 30,
            },
        },
    };

    it('waits for an answer, and runs nothing', async () => {
        const messages = await reply(
            {
                call: addReminder,
            },
            signedIn
        );

        expect(messages[0]).toEqual({
            event: 'tool_call',
            data: {
                id: 'call_1',
                name: 'reminders.add',
                needsApproval: true,
                input: {
                    body: {
                        text: 'Stand up',
                        minutes: 30,
                    },
                },
            },
        });
        expect(results[0]).toMatchObject({
            state: 'needs-approval',
        });
        expect(logged).toEqual([]);
        expect(readToolCalls(messages)[0]?.state).toBe('needs-approval');
    });

    it('leaves the handler uncalled when the person declines', async () => {
        const messages = await reply(
            {
                call: addReminder,
                options: {
                    approved: false,
                },
            },
            signedIn
        );

        expect(messages.map((message) => message.event)).toEqual(['tool_call', 'tool_error', 'done']);
        expect(results[0]).toMatchObject({
            state: 'declined',
            content: 'Declined, so nothing ran.',
            isError: true,
        });
        expect(logged).toEqual([]);
    });

    it('runs the call the client sent back, named as the model knows it', async () => {
        const [asked] = readToolCalls(
            await reply(
                {
                    call: addReminder,
                },
                signedIn
            )
        );

        await reply(
            {
                call: asked!,
                options: {
                    approved: true,
                },
            },
            signedIn
        );

        expect(logged).toEqual([
            {
                text: 'Stand up',
                minutes: 30,
            },
        ]);
        expect(results[0]?.call).toEqual({
            id: 'call_1',
            name: 'reminders_add',
            input: {
                body: {
                    text: 'Stand up',
                    minutes: 30,
                },
            },
        });
    });

    it('sends the call without the question once the person agreed', async () => {
        const messages = await reply(
            {
                call: addReminder,
                options: {
                    approved: true,
                },
            },
            signedIn
        );

        expect(messages[0]?.data).not.toHaveProperty('needsApproval');
        expect(readToolCalls(messages)[0]?.state).toBe('done');
    });
});

describe('tools.definitions', () => {
    it('describes each route by the name a model calls, with its input as JSON Schema', async () => {
        let definitions: unknown;
        const probe = k.routes({
            probe: k
                .route({
                    method: 'GET',
                    path: '/probe',
                    auth: false,
                    responses: {
                        200: {
                            stream: {
                                done: z.object({
                                    ok: z.boolean(),
                                }),
                            },
                            tools: toolRoutes,
                        },
                    },
                })
                .handler(({ tools }) => {
                    definitions = tools.definitions;
                    return {
                        status: 200,
                        body: async function* () {},
                    };
                }),
        });
        const adapter = defineAdapter<null, void, Record<string, never>>({
            buildHandlerContext: () => ({}),
            respond: () => undefined,
        });
        await adapter.handle({
            routes: probe,
            router: routerFromRoutes(probe) as never,
            request: {
                request: null,
                method: 'GET',
                resolution: {
                    kind: 'core-match',
                    path: '/probe',
                },
                query: {},
                headers: {},
                readBody: () => undefined,
            },
            responseContext: {},
        });

        expect(definitions).toEqual([
            {
                name: 'notes_search',
                key: 'notes.search',
                description: 'Search the signed-in user notes\n\nHTTP: GET /notes\nRequires: user',
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'object',
                            properties: {
                                term: {
                                    type: 'string',
                                    minLength: 1,
                                },
                                limit: {
                                    type: 'integer',
                                    default: 10,
                                    minimum: -9007199254740991,
                                    maximum: 9007199254740991,
                                },
                            },
                            required: ['term'],
                        },
                    },
                    required: ['query'],
                },
            },
            {
                name: 'reminders_add',
                key: 'reminders.add',
                description: 'Add a reminder\n\nHTTP: POST /reminders\nRequires: user',
                inputSchema: {
                    type: 'object',
                    properties: {
                        body: {
                            type: 'object',
                            properties: {
                                text: {
                                    type: 'string',
                                },
                                minutes: {
                                    type: 'integer',
                                    minimum: -9007199254740991,
                                    maximum: 9007199254740991,
                                },
                            },
                            required: ['text', 'minutes'],
                        },
                    },
                    required: ['body'],
                },
            },
        ]);
    });
});
