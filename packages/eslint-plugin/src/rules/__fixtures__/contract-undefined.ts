import { Kizuna } from 'kizunajs';
import { z } from 'zod';

const k = new Kizuna();

export const routes = k.routes({
    deleteUser: k.route({
        method: 'DELETE',
        path: '/users/:id',
        responses: {
            204: z.undefined(),
        },
    }),
});
