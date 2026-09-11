import { z } from 'zod';
import { ProblemDetailsSchema } from '@ts-kizuna/core/schemas';
import { k } from '../k';
import { tools } from '../tools';

export const assistantRoutes = k.routes('assistant', {
    reply: {
        method: 'POST',
        path: '/assistant/reply',
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
    },
});
