import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import type { AutoResponsesBrand } from './types.js';
import type { HandlerArgs } from './handler-pipeline.js';

const k = new Kizuna({
    identities: {
        user: Kizuna.identity.bearer({
            context: z.object({
                userId: z.string(),
            }),
        }),
    },
});

const routes = k.routes({
    listUsers: {
        method: 'GET',
        path: '/users',
        responses: {
            200: z.object({
                ok: z.boolean(),
            }),
        },
    },
    health: {
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
        api: routes,
    },
    auth: {
        api: {
            '*': false,
            listUsers: 'user',
        },
    },
});

type Guarded = (typeof contract.routes.api)['listUsers'];
type Public = (typeof contract.routes.api)['health'];

type StatusesOn<R> = R extends AutoResponsesBrand<infer Statuses> ? Statuses : never;

test('the auth map brands the routes it guards, and only those', () => {
    expectTypeOf<StatusesOn<Guarded>>().toEqualTypeOf<401 | 403>();
    expectTypeOf<StatusesOn<Public>>().toEqualTypeOf<never>();
});

test('the guarded route still refuses a status its handler never declared', () => {
    type Throwable = Parameters<HandlerArgs<Guarded>['throwError']>[0];

    expectTypeOf<Throwable['status']>().toEqualTypeOf<200>();
});
