import { Kizuna } from 'kizunajs';
import { z } from 'zod';

const k = new Kizuna();

export const routes = k.routes({
    a: k.route({
        method: 'POST',
        path: '/a',
        body: z.object({
            tags: z.set(z.string()),
            counts: z.map(z.string(), z.number()),
        }),
        responses: {},
    }),
});
