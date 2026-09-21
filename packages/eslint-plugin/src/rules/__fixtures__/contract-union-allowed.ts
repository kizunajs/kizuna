import { Kizuna } from 'kizunajs';
import { z } from 'zod';

const k = new Kizuna();

export const routes = k.routes({
    a: k.route({
        method: 'GET',
        path: '/a',
        query: z.object({
            ids: z.union([z.array(z.string()), z.string()]),
        }),
        responses: {
            200: z.discriminatedUnion('kind', [
                z.object({
                    kind: z.literal('text'),
                }),
                z.object({
                    kind: z.literal('image'),
                }),
            ]),
        },
    }),
});
