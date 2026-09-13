import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import { ProblemDetailsSchema } from './error-response.js';
import type { RouteDefinition } from './types.js';

const user = Kizuna.identity.bearer({
    context: z.object({
        userId: z.string(),
    }),
});

const member = Kizuna.identity.apiKey({
    name: 'x-workspace-token',
    in: 'header',
    context: z.object({
        workspaceUserId: z.string(),
    }),
});

const k = new Kizuna({
    identities: {
        user,
        member,
    },
});

const okResponse = () => ({
    200: z.object({
        ok: z.boolean(),
    }),
});

const makeRoutes = () =>
    k.routes({
        listUsers: {
            method: 'GET',
            path: '/users',
            responses: okResponse(),
        },
        health: {
            method: 'GET',
            path: '/health',
            responses: okResponse(),
        },
        both: {
            method: 'GET',
            path: '/both',
            responses: okResponse(),
        },
        byKey: {
            method: 'GET',
            path: '/by-key',
            responses: okResponse(),
        },
        declaresIts403: {
            method: 'GET',
            path: '/declares-its-403',
            responses: {
                ...okResponse(),
                403: ProblemDetailsSchema.extend({
                    missingRelation: z.string(),
                }),
            },
        },
    });

type DemoRoutes = ReturnType<typeof makeRoutes>;

const contractFor = (routes: DemoRoutes, listUsers: 'user' | false = 'user') =>
    k.contract({
        routes: {
            api: routes,
        },
        accessControl: {
            api: {
                '*': false,
                listUsers,
                health: false,
                both: {
                    auth: ['user', 'member'],
                },
                byKey: 'member',
                declaresIts403: 'user',
            },
        },
    });

const routeOf = (contract: ReturnType<typeof contractFor>, name: string): RouteDefinition =>
    (contract.routes.api as Record<string, RouteDefinition>)[name]!;

const challengeOf = (route: RouteDefinition): z.ZodType | undefined => (route.responses[401] as { headers?: z.ZodType }).headers;

const problem = (extensions: Record<string, string> = {}) => ({
    type: 'about:blank',
    title: 'Forbidden',
    status: 403,
    detail: 'Forbidden',
    ...extensions,
});

describe('injectGuardResponses', () => {
    it('gives a guarded route the 401 and 403 its guard answers with', () => {
        const route = routeOf(contractFor(makeRoutes()), 'listUsers');

        expect(Object.keys(route.responses)).toEqual(['200', '401', '403']);
        expect((route.responses[401] as { body: unknown }).body).toBe(ProblemDetailsSchema);
        expect((route.responses[403] as { body: unknown }).body).toBe(ProblemDetailsSchema);
    });

    it('leaves a public route alone', () => {
        const route = routeOf(contractFor(makeRoutes()), 'health');

        expect(Object.keys(route.responses)).toEqual(['200']);
    });

    it('refuses a 401 the route declares for itself', () => {
        const build = () =>
            k.contract({
                routes: {
                    api: k.routes({
                        listUsers: {
                            method: 'GET',
                            path: '/users',
                            responses: {
                                ...okResponse(),
                                401: ProblemDetailsSchema,
                            },
                        },
                    }),
                },
                accessControl: {
                    api: 'user',
                },
            });

        expect(build).toThrow(/declares a 401/);
    });

    it('lets a declared 403 carry the guard body alongside its own', () => {
        const route = routeOf(contractFor(makeRoutes()), 'declaresIts403');
        const body = (route.responses[403] as { body: z.ZodType }).body;

        expect(body.safeParse(problem({ missingRelation: 'editor' })).success).toBe(true);
        expect(body.safeParse(problem()).success).toBe(true);
    });

    it('does not widen a declared 403 twice over two contracts', () => {
        const routes = makeRoutes();
        contractFor(routes);
        const route = routeOf(contractFor(routes), 'declaresIts403');
        const body = (route.responses[403] as { body: z.ZodType }).body;

        expect(body.safeParse(problem()).success).toBe(true);
        expect(body.safeParse(problem({ missingRelation: 'editor' })).success).toBe(true);
        expect(routes.declaresIts403.responses[403]).toBe(route.responses[403]);
    });

    it('never lets a refusal be stored', () => {
        const route = routeOf(contractFor(makeRoutes()), 'listUsers');

        expect(route.responses[401]).toMatchObject({
            cache: 'no-store',
        });
        expect(route.responses[403]).toMatchObject({
            cache: 'no-store',
        });
    });

    it('requires the challenge header when every scheme has one to send', () => {
        const headers = challengeOf(routeOf(contractFor(makeRoutes()), 'listUsers'))!;

        expect(headers.safeParse({}).success).toBe(false);
        expect(headers.safeParse({ 'www-authenticate': 'Bearer' }).success).toBe(true);
    });

    it('makes the challenge header optional when only some schemes send one', () => {
        const headers = challengeOf(routeOf(contractFor(makeRoutes()), 'both'))!;

        expect(headers.safeParse({}).success).toBe(true);
        expect(headers.safeParse({ 'www-authenticate': 'Bearer' }).success).toBe(true);
    });

    it('declares no challenge header for an api key, which is not HTTP authentication', () => {
        const route = routeOf(contractFor(makeRoutes()), 'byKey');

        expect(route.responses[401]).toMatchObject({
            body: ProblemDetailsSchema,
        });
        expect((route.responses[401] as { headers?: unknown }).headers).toBeUndefined();
    });

    it('takes its own injection back when the same routes go public in a second contract', () => {
        const routes = makeRoutes();
        contractFor(routes);
        const route = routeOf(contractFor(routes, false), 'listUsers');

        expect(Object.keys(route.responses)).toEqual(['200']);
    });

    it('does not let routes sharing one responses object inherit each other', () => {
        const shared = okResponse();
        const contract = k.contract({
            routes: {
                api: k.routes({
                    guarded: {
                        method: 'GET',
                        path: '/guarded',
                        responses: shared,
                    },
                    open: {
                        method: 'GET',
                        path: '/open',
                        responses: shared,
                    },
                }),
            },
            accessControl: {
                api: {
                    '*': false,
                    guarded: 'user',
                    open: false,
                },
            },
        });
        const routes = contract.routes.api as Record<string, RouteDefinition>;

        expect(Object.keys(routes.guarded!.responses)).toEqual(['200', '401', '403']);
        expect(Object.keys(routes.open!.responses)).toEqual(['200']);
    });
});

describe('a contract that declares a guardSchema', () => {
    const GuardSchema = ProblemDetailsSchema.extend({
        code: z.enum(['expired_token', 'forbidden', 'not_found']).default('forbidden'),
    });

    const scoped = new Kizuna({
        identities: {
            user: Kizuna.identity.bearer({
                context: z.object({
                    userId: z.string(),
                }),
            }),
        },
        guardSchema: GuardSchema,
    });

    const build = () =>
        scoped.contract({
            routes: {
                api: scoped.routes({
                    listUsers: {
                        method: 'GET',
                        path: '/users',
                        responses: okResponse(),
                    },
                }),
            },
            accessControl: {
                api: 'user',
            },
        });

    const routeOfScoped = (name: string): RouteDefinition => (build().routes.api as Record<string, RouteDefinition>)[name]!;

    it('puts the declared body on the 401 and 403 in place of bare Problem Details', () => {
        const route = routeOfScoped('listUsers');

        expect((route.responses[401] as { body: unknown }).body).toBe(GuardSchema);
        expect((route.responses[403] as { body: unknown }).body).toBe(GuardSchema);
    });

    it('refuses a schema that is not Problem Details at all', () => {
        expect(
            () =>
                new Kizuna({
                    guardSchema: z.object({
                        reason: z.string(),
                    }) as never,
                })
        ).toThrow(/must extend `ProblemDetailsSchema`/);
    });

    it('refuses a schema kizuna cannot build from a status and a detail alone', () => {
        expect(
            () =>
                new Kizuna({
                    guardSchema: ProblemDetailsSchema.extend({
                        code: z.string(),
                    }),
                })
        ).toThrow(/`.optional\(\)` or a `.default\(\)`/);
    });
});
