import { Kizuna } from 'kizunajs';
import { z } from 'zod';

const k = new Kizuna();

export const routes = k.routes({
    listUsers: k.route({
        method: 'GET',
        path: '/users',
        query: z.object({
            cursor: z.string().nullable(),
            search: z.string().nullable().optional(),
            role: z.string().nullish(),
        }),
        headers: z.object({
            'x-request-id': z.string().nullable(),
        }),
        responses: {
            200: z.object({
                nextCursor: z.string().nullable(),
            }),
        },
    }),
    uploadAvatar: k.route({
        method: 'POST',
        path: '/avatar',
        contentType: 'multipart/form-data',
        body: z.object({
            caption: z.string().nullable(),
        }),
        responses: {
            204: z.void(),
        },
    }),
    updateUser: k.route({
        method: 'PATCH',
        path: '/users/:id',
        body: z.object({
            last_name: z.string().nullable(),
        }),
        responses: {
            204: z.void(),
        },
    }),
});
