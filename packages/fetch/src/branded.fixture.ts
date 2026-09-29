import { z } from 'zod';
import { Kizuna, defineConfig } from 'kizunajs';

const k = new Kizuna();

export const CenterId = Kizuna.brand('CenterId', z.string());

const CenterSchema = Kizuna.model({
    title: 'Center',
    schema: z.object({
        id: CenterId,
        name: z.string(),
        parentId: CenterId.nullable(),
    }),
});

const routes = k.routes('centers', {
    getCenter: k.route({
        method: 'GET',
        path: '/centers/:centerId',
        pathParams: z.object({
            centerId: CenterId,
        }),
        responses: {
            200: CenterSchema,
        },
    }),
    listCenters: k.route({
        method: 'GET',
        path: '/centers',
        query: z.object({
            parentId: CenterId.optional(),
        }),
        responses: {
            200: z.array(CenterSchema),
        },
    }),
    moveCenter: k.route({
        method: 'POST',
        path: '/centers/:centerId/move',
        pathParams: z.object({
            centerId: CenterId,
        }),
        headers: z.object({
            'x-actor-center': CenterId,
        }),
        body: z.object({
            parentId: CenterId,
        }),
        responses: {
            200: CenterSchema,
        },
    }),
});

export const brandedContract = defineConfig({
    routes: {
        centers: routes,
    },
}).api;
