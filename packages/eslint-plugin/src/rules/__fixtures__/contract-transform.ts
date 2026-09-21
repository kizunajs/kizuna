import { Kizuna } from 'kizunajs';
import { z } from 'zod';

const k = new Kizuna();

export const routes = k.routes({
    a: k.route({
        method: 'POST',
        path: '/a',
        body: z.object({
            slug: z.string().transform((value) => value.toLowerCase()),
        }),
        responses: {
            200: z.object({
                length: z.string().transform((value) => value.length),
            }),
        },
    }),
});
