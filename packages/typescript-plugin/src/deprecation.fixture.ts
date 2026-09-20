import { z } from 'zod';
import { Kizuna } from '../../core/src/index.js';
import { defineConfig } from '../../core/src/index.js';
import { createGeneratedClient, type Client, type ClientConfig, type GeneratedRoutes } from '../../fetch/src/client.js';
import type { Routes } from '../../core/src/types.js';

/**
 * A client over an assembled api's routes, the same runtime the generated
 * client uses.
 */
const apiClientFor = <T extends Routes>(api: { routes: T }, config: ClientConfig): Client<T> =>
    createGeneratedClient(api.routes as unknown as GeneratedRoutes, config) as unknown as Client<T>;

interface Config {
    tags: typeof tags;
}

const k = new Kizuna<Config>();

const Paginated = <ItemSchema extends z.ZodType>(itemSchema: ItemSchema) =>
    z.object({
        items: z.array(itemSchema),
        total: z.number(),
    });

const UserSchema = z.object({
    id: z.string(),
    email: z.string().meta({
        deprecated: 'use email_address instead',
    }),
    email_address: z.string(),
});

export const tags = k.tags({
    api: {
        title: 'API',
    },
});

const config = {
    tags,
};

const routes = k.routes('api', {
    oldRoute: k.route({
        method: 'GET',
        path: '/old',
        deprecated: 'use newRoute instead',
        responses: {
            200: z.object({
                ok: z.boolean(),
            }),
        },
    }),
    newRoute: k.route({
        method: 'GET',
        path: '/new',
        responses: {
            200: z.object({
                ok: z.boolean(),
            }),
        },
    }),
    detailedRoute: k.route({
        method: 'GET',
        path: '/detailed',
        deprecated: {
            message: 'use newRoute instead',
            date: '2026-03-01',
        },
        responses: {
            200: z.object({
                ok: z.boolean(),
            }),
        },
    }),
    datedRoute: k.route({
        method: 'GET',
        path: '/dated',
        deprecated: {
            date: '2026-03-01',
        },
        responses: {
            200: z.object({
                ok: z.boolean(),
            }),
        },
    }),
    getUser: k.route({
        method: 'GET',
        path: '/users/:id',
        responses: {
            200: UserSchema,
        },
    }),
    listUsersPaginated: k.route({
        method: 'GET',
        path: '/users/paginated',
        responses: {
            200: Paginated(UserSchema),
        },
    }),
});

export const contract = defineConfig({
    ...config,
    routes,
}).api;

export const client = apiClientFor(contract, {
    baseUrl: 'http://localhost:3000',
});

export const legacy = {
    /**
     * @deprecated use fresh instead
     */
    oldField: 'value',
    fresh: 'value',
};

/**
 * @deprecated use newHelper instead
 */
export const oldHelper = (): void => {};

export const usage = async (): Promise<void> => {
    console.log(legacy.oldField);
    console.log(legacy.fresh);
    oldHelper();

    await client.oldRoute();
    await client.newRoute();
    await client.detailedRoute();
    await client.datedRoute();

    const userResponse = await client.getUser({
        params: {
            id: '1',
        },
    });
    if (userResponse.status === 200) {
        console.log(userResponse.body.email);
        console.log(userResponse.body.email_address);
    }

    const pageResponse = await client.listUsersPaginated();
    if (pageResponse.status === 200) {
        console.log(pageResponse.body.items[0]?.email);
    }
};
