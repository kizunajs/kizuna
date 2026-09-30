import { countWords, noteCallFor, replyFor, replyWords } from '../assistant';
import { z } from 'zod';
import { ToolAnswerSchema } from 'kizunajs/schemas';
import { k } from '../k';
import { assistantTools } from './assistant-tools';
import { noteRoutes } from './notes';

export const assistantRoutes = k.routes('assistant', {
    reply: k
        .route({
            method: 'POST',
            path: '/assistant/reply',
            auth: false,
            body: z.object({
                prompt: z.string().min(1),
            }),
            responses: {
                200: {
                    stream: {
                        delta: z.object({
                            text: z.string(),
                        }),
                        done: z.object({
                            inputTokens: z.int(),
                            outputTokens: z.int(),
                        }),
                    },
                    tools: assistantTools,
                },
            },
            summary: 'Stream an assistant reply, exercises a server-sent events response',
        })
        .handler(async ({ body }) => ({
            status: 200,
            body: async function* ({ signal }) {
                let outputTokens = 0;
                for await (const word of replyWords(body.prompt, signal)) {
                    outputTokens += 1;
                    yield {
                        event: 'delta',
                        data: {
                            text: word,
                        },
                    };
                }
                yield {
                    event: 'done',
                    data: {
                        inputTokens: countWords(body.prompt),
                        outputTokens,
                    },
                };
            },
        })),
    chat: k
        .route({
            method: 'POST',
            path: '/assistant/chat',
            auth: 'user',
            body: z.object({
                prompt: z.string().min(1),
                answer: ToolAnswerSchema.optional(),
            }),
            responses: {
                200: {
                    stream: {
                        delta: z.object({
                            text: z.string(),
                        }),
                    },
                    tools: {
                        notes: noteRoutes,
                    },
                },
            },
            summary: 'Chat with an assistant that keeps notes for the signed-in user, exercises tools on a stream',
        })
        .handler(({ body, tools }) => ({
            status: 200,
            body: async function* () {
                // An answer runs the call the person saw, not a new one.
                const call = body.answer?.call ?? noteCallFor(body.prompt);
                const result = yield* tools.run(call, body.answer);
                if (result.state === 'needs-approval') return;
                yield {
                    event: 'delta',
                    data: {
                        text: replyFor(result),
                    },
                };
            },
        })),
});
