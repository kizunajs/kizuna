import { Kizuna } from 'kizunajs';
import { z } from 'zod';

const k = new Kizuna();

const Circle = z.object({
    radius: z.number(),
});

export const routes = k.routes({
    a: k.route({
        method: 'POST',
        path: '/a',
        body: z.union([
            Circle,
            z.object({
                side: z.number(),
            }),
        ]),
        responses: {},
    }),
});
