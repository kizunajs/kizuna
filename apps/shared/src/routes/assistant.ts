import { countWords, replyWords } from '../assistant';
import { z } from 'zod';
import { ProblemDetailsSchema } from '@ts-kizuna/core/schemas';
import { k } from '../k';
import { tools } from '../tools';

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
                    tools,
                },
                400: ProblemDetailsSchema,
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
});
