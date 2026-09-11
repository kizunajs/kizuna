import { countWords, replyWords } from '@ts-kizuna-demo/shared';
import type { Router } from '@ts-kizuna/next';
import type { contract } from '@ts-kizuna-demo/shared';

export const assistant: Router<typeof contract.routes.assistant> = {
    reply: async ({ body }) => ({
        status: 200,
        stream: async function* ({ signal }) {
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
    }),
};
