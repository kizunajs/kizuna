import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import { ProblemDetailsSchema } from './error-response.js';
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
        auth: 'user',
        responses: {
            200: z.object({
                ok: z.boolean(),
            }),
        },
    },
    health: {
        method: 'GET',
        path: '/health',
        auth: false,
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
});

type Guarded = (typeof contract.routes.api)['listUsers'];
type Public = (typeof contract.routes.api)['health'];

type StatusesOn<R> = R extends AutoResponsesBrand<infer Statuses> ? Statuses : never;

test('the auth map brands the routes it guards, and only those', () => {
    expectTypeOf<StatusesOn<Guarded>>().toEqualTypeOf<401 | 403>();
    expectTypeOf<StatusesOn<Public>>().toEqualTypeOf<never>();
});

test('the guarded route lets its handler answer the 403 it already declares, and nothing else it never declared', () => {
    type Throwable = Parameters<HandlerArgs<Guarded>['throwError']>[0];

    expectTypeOf<Throwable['status']>().toEqualTypeOf<200 | 403>();
    expectTypeOf<Extract<Throwable, { status: 403 }>['body']>().toEqualTypeOf<{ detail: string }>();
    type PublicThrowable = Parameters<HandlerArgs<Public>['throwError']>[0];
    expectTypeOf<PublicThrowable['status']>().toEqualTypeOf<200>();
});

const scopedK = new Kizuna({
    identities: {
        user: Kizuna.identity.bearer({
            context: z.object({
                userId: z.string(),
            }),
        }),
    },
    guardSchema: ProblemDetailsSchema.extend({
        code: z.enum(['expired_token', 'forbidden']).default('forbidden'),
    }),
});

const scopedRoutes = scopedK.routes({
    listUsers: {
        method: 'GET',
        path: '/users',
        auth: 'user',
        responses: {
            200: z.object({
                ok: z.boolean(),
            }),
        },
    },
});

const scopedContract = scopedK.contract({
    routes: {
        api: scopedRoutes,
    },
});

type BodyOn<R> = R extends AutoResponsesBrand<number, infer Body> ? Body : never;

test('the brand carries the declared guard body', () => {
    expectTypeOf<BodyOn<(typeof scopedContract.routes.api)['listUsers']>['code']>().toEqualTypeOf<'expired_token' | 'forbidden'>();
});
