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

const chartsRoutes = k.routes('charts', {
    plotSignups: {
        method: 'GET',
        path: '/charts/signups',
        responses: {
            200: z.object({
                points: z.array(z.int()),
            }),
        },
    },
});

const contract = k.contract({
    routes: {
        users: usersRoutes,
    },
});

const chartsContract = k.contract({
    routes: {
        charts: chartsRoutes,
    },
});

describe('ConfigOf', () => {
    it('surfaces the routes of a single API', () => {
        const config = defineConfig({
            contract,
        });

        type Config = ConfigOf<typeof config>;

        expectTypeOf<Config['routes']>().toEqualTypeOf<(typeof contract)['routes']>();
    });

    it('surfaces the routes of each named API', () => {
        const config = defineConfig({
            apis: {
                app: {
                    contract,
                },
                workspace: {
                    contract: chartsContract,
                },
            },
        });

        type Config = ConfigOf<typeof config>;

        expectTypeOf<Config['app']['routes']>().toEqualTypeOf<(typeof contract)['routes']>();
        expectTypeOf<Config['workspace']['routes']>().toEqualTypeOf<(typeof chartsContract)['routes']>();
    });

    it('reaches a route through the registry it surfaced', () => {
        const config = defineConfig({
            contract,
        });

        type Config = ConfigOf<typeof config>;

        expectTypeOf<Config['routes']['users']['getUser']['method']>().toEqualTypeOf<'GET'>();
    });

    it('keeps client targets out of the registry', () => {
        const config = defineConfig({
            contract,
            clients: [
                {
                    kind: 'swift',
                    output: './API.swift',
                    generate: () => '',
                },
            ],
        });

        type Config = ConfigOf<typeof config>;

        expectTypeOf<keyof Config>().toEqualTypeOf<'routes'>();
    });
});
