import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import { defineConfig, type ConfigOf } from './config.js';

const k = new Kizuna();

const usersRoutes = k.routes('users', {
    getUser: {
        method: 'GET',
        path: '/users/:id',
        responses: {
            200: z.object({
                name: z.string(),
            }),
        },
    },
});

const healthRoutes = k.routes('health', {
    ping: {
        method: 'GET',
        path: '/health',
        responses: {
            200: z.object({
                ok: z.boolean(),
            }),
        },
    },
});

const contract = k.contract({
    routes: {
        users: usersRoutes,
        health: healthRoutes,
    },
});

const config = defineConfig({
    contract,
});

type Config = ConfigOf<typeof config>;

/**
 * What a router would name instead of `typeof contract.routes.users`.
 */
type GroupAt<Name extends keyof Config['routes']> = Config['routes'][Name];

describe('naming a route group through the config', () => {
    it('resolves to the same group as reaching through the contract', () => {
        expectTypeOf<GroupAt<'users'>>().toEqualTypeOf<(typeof contract)['routes']['users']>();
        expectTypeOf<GroupAt<'health'>>().toEqualTypeOf<(typeof contract)['routes']['health']>();
    });

    it('keeps each route shape intact through the lookup', () => {
        expectTypeOf<GroupAt<'users'>['getUser']['method']>().toEqualTypeOf<'GET'>();
        expectTypeOf<GroupAt<'users'>['getUser']['path']>().toEqualTypeOf<'/users/:id'>();
    });

    it('offers the group names as completions', () => {
        expectTypeOf<keyof Config['routes']>().toEqualTypeOf<'users' | 'health'>();
    });
});
