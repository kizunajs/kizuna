import { Kizuna } from 'kizunajs';
import { FileSchema } from 'kizunajs/schemas';
import { z } from 'zod';

const k = new Kizuna();

export const routes = k.routes({
    listPlaces: k.route({
        method: 'GET',
        path: '/places/:id',
        pathParams: z.object({
            id: z.union([z.uuid(), z.int()]),
        }),
        query: z.object({
            near: z.union([
                z.string(),
                z.object({
                    lat: z.number(),
                    lng: z.number(),
                }),
            ]),
            ids: z.union([z.array(z.string()), z.string()]).optional(),
        }),
        headers: z.object({
            'x-workspace': z.union([
                z.string(),
                z.object({
                    id: z.string(),
                }),
            ]),
        }),
        responses: {
            204: z.void(),
        },
    }),
    uploadPhotos: k.route({
        method: 'POST',
        path: '/photos',
        contentType: 'multipart/form-data',
        body: z.object({
            photos: z.array(z.union([FileSchema, z.string()])),
        }),
        responses: {
            204: z.void(),
        },
    }),
});
