import { Kizuna } from '@ts-kizuna/core';
import { z } from 'zod';

const k = new Kizuna();

export const routes = k.routes({
    a: k.route({
        method: 'GET',
        path: '/a',
        query: z.object({
            page: z.coerce.number(),
        }),
        responses: {},
    }),
});
