import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { Kizuna } from '@ts-kizuna/core';
import type { HandlerContextOf } from '@ts-kizuna/core/adapter';
import type { Request } from 'express';
import type { RouteDefinition } from '@ts-kizuna/core';
import type { GuardRun, RequestContextRun } from '@ts-kizuna/core/adapter';
import {
    checkAdapterTypeFeatures,
    gateContract,
    inferenceContract,
    inferenceGroupContract,
    streamInferenceContract,
    toolInferenceContract,
    inferenceRoutes,
    pluginTypeContract,
    requestContextContract,
    securedContract,
    type ExpectedRouteHandler,
    type ExpectedRouter,
} from '../../core/src/adapter-testing/type-testing.js';
import { expressAdapter, type ExpressHandlerContext, type RouteHandler, type Router } from './server.js';

interface LocalConfig {
    adapter: typeof expressAdapter;
    identities: {
        user: typeof localUser;
        member: typeof localMember;
        apiConsumer: typeof localApiConsumer;
    };
    requestContext: {
        analytics: typeof localAnalytics;
    };
}

const k = new Kizuna<LocalConfig>();

const localUser = k.identity.bearer({
    context: z.object({
        userId: z.string(),
    }),
});

const localPermissions = Kizuna.permissions({
    workspace: ['read', 'delete'],
});

const localRoles = Kizuna.roles(localPermissions, {
    admin: {
        workspace: ['read'],
    },
    owner: 'all',
});

const localMember = k.identity.apiKey({
    name: 'x-workspace-token',
    in: 'header',
    context: z.object({
        workspaceUserId: z.string(),
    }),
    roles: localRoles,
});

const localApiConsumer = k.identity.apiKey({
    name: 'x-api-key',
    in: 'header',
});

const localAnalytics = k.requestContext({
    context: z.object({
        sessionId: z.string().nullable(),
    }),
});

test('conforms to the shared adapter type catalogue', () => {
    checkAdapterTypeFeatures('express', {
        'tools.handlerArg': () => {
            const summarize: Router<typeof toolInferenceContract>['summarize'] = async ({ body, tools }) => {
                expectTypeOf(tools.countWords.run).parameter(0).toEqualTypeOf<{ text: string }>();
                const counted = await tools.countWords.run({
                    text: body.text,
                });
                expectTypeOf(counted).toEqualTypeOf<{ words: number }>();
                return {
                    status: 200,
                    body: counted,
                };
            };
            void summarize;
        },
        'streams.bodyGenerator': () => {
            const reply: Router<typeof streamInferenceContract>['reply'] = async ({ body }) => ({
                status: 200,
                body: async function* ({ signal }) {
                    expectTypeOf(signal).toEqualTypeOf<AbortSignal>();
                    yield {
                        event: 'delta',
                        data: {
                            text: body.prompt,
                        },
                    };
                    yield {
                        comment: 'keep-alive',
                    };
                    yield {
                        event: 'done',
                        data: {
                            count: 1,
                        },
                        id: 'evt-1',
                    };
                },
            });
            void reply;
            // @ts-expect-error `done` carries a count, not text
            const wrongEvent: Router<typeof streamInferenceContract>['reply'] = async () => ({
                status: 200,
                body: async function* () {
                    yield {
                        event: 'done',
                        data: {
                            text: 'x',
                        },
                    };
                },
            });
            void wrongEvent;
        },
        'streams.bodyRejectsValue': () => {
            // @ts-expect-error a streamed status takes a generator, not a value
            const valueBody: Router<typeof streamInferenceContract>['reply'] = async () => ({
                status: 200,
                body: {
                    text: 'x',
                },
            });
            void valueBody;
            const thrown: Router<typeof streamInferenceContract>['reply'] = async ({ throwError }) => {
                expectTypeOf(throwError).parameter(0).toHaveProperty('status').toEqualTypeOf<400>();
                return throwError({
                    status: 400,
                    body: {
                        detail: 'no',
                    },
                });
            };
            void thrown;
        },
        'surface.router': () => {
            expectTypeOf<Router<typeof securedContract>>().toEqualTypeOf<ExpectedRouter<typeof securedContract, ExpressHandlerContext>>();
            expectTypeOf<Router<typeof inferenceRoutes>>().toEqualTypeOf<ExpectedRouter<typeof inferenceRoutes, ExpressHandlerContext>>();
        },
        'surface.routeHandler': () => {
            expectTypeOf<RouteHandler<typeof inferenceRoutes.getUser>>().toEqualTypeOf<
                ExpectedRouteHandler<typeof inferenceRoutes.getUser, ExpressHandlerContext>
            >();
        },
        'surface.guardRun': () => {
            expectTypeOf<Parameters<typeof localUser.guard>[0]>().parameter(0).toMatchTypeOf<ExpressHandlerContext>();
            expectTypeOf<GuardRun<ExpressHandlerContext>>().parameter(0).toMatchTypeOf<ExpressHandlerContext>();
        },
        'surface.requestContextRun': () => {
            expectTypeOf<Parameters<typeof localAnalytics.handler>[0]>().parameter(0).toMatchTypeOf<ExpressHandlerContext>();
            expectTypeOf<RequestContextRun<ExpressHandlerContext>>().parameter(0).toMatchTypeOf<ExpressHandlerContext>();
        },
        'router.undeclaredStatus': () => {
            const getUser: Router<typeof inferenceGroupContract>['users']['getUser'] = () => ({
                // @ts-expect-error 418 is not a declared response of getUser.
                status: 418,
            });
            void getUser;
        },
        'handler.pathParams': () => {
            expectTypeOf<Router<typeof inferenceContract>['getUser']>().parameter(0).toMatchTypeOf<{ params: { id: string } }>();
        },
        'handler.body': () => {
            expectTypeOf<Router<typeof inferenceContract>['createUser']>()
                .parameter(0)
                .toMatchTypeOf<{ body: { name: string; email: string } }>();
            expectTypeOf<Router<typeof inferenceContract>['getUser']>().parameter(0).toMatchTypeOf<{ body: undefined }>();
        },
        'handler.context': () => {
            expectTypeOf<Router<typeof inferenceContract>['getUser']>().parameter(0).toMatchTypeOf<ExpressHandlerContext>();
        },
        'guards.identityContext': () => {
            expectTypeOf<Router<typeof securedContract>['api']['whoAmI']>()
                .parameter(0)
                .toMatchTypeOf<{ auth: { user: { userId: string } } }>();
            expectTypeOf<Router<typeof securedContract>['api']['ownerOnly']>().parameter(0).toMatchTypeOf<{
                auth: { member: { workspaceUserId: string; role: 'owner' | 'admin' | readonly ('owner' | 'admin')[] } };
            }>();
            expectTypeOf<Router<typeof securedContract>['api']['both']>().parameter(0).toMatchTypeOf<{
                auth: { user: { userId: string }; member: { workspaceUserId: string } };
            }>();
        },
        'guards.publicNoAuth': () => {
            expectTypeOf<Router<typeof securedContract>['api']['publicRoute']>().parameter(0).not.toHaveProperty('auth');
        },
        'guards.gateOnlyNoAuth': () => {
            expectTypeOf<Router<typeof gateContract>['api']['apiOnly']>().parameter(0).not.toHaveProperty('auth');
            expectTypeOf<Router<typeof gateContract>['api']['whoAmI']>()
                .parameter(0)
                .toMatchTypeOf<{ auth: { user: { userId: string } } }>();
        },
        'guards.credentialByKind': () => {
            localUser.guard(({ bearer, deny }) => {
                expectTypeOf(bearer).toEqualTypeOf<{ token: string } | null>();
                if (!bearer)
                    return deny({
                        status: 401,
                        body: {
                            detail: 'Unauthorized',
                        },
                    });
                return {
                    userId: bearer.token,
                };
            });

            localMember.guard(({ apiKey, deny }) => {
                expectTypeOf(apiKey).toEqualTypeOf<{ in: 'header'; name: 'x-workspace-token'; value: string } | null>();
                if (!apiKey)
                    return deny({
                        status: 403,
                        body: {
                            detail: 'Forbidden',
                        },
                    });
                return {
                    workspaceUserId: apiKey.value,
                    role: 'owner' as const,
                };
            });
        },
        'guards.returnChecked': () => {
            localUser.guard(
                // @ts-expect-error the guard result must match the identity's context schema
                ({ deny }) => {
                    void deny;
                    return {
                        wrongField: true,
                    };
                }
            );
        },
        'guards.gateOnlyVoid': () => {
            localApiConsumer.guard(({ apiKey, deny }) => {
                if (!apiKey)
                    return deny({
                        status: 401,
                        body: {
                            detail: 'Unauthorized',
                        },
                    });
            });

            localUser.guard(
                // @ts-expect-error a context-ful guard must return its context, not void
                ({ deny }) => {
                    void deny;
                }
            );
        },
        'guards.unknownIdentity': () => {
            k.route({
                method: 'GET',
                path: '/admin',
                // @ts-expect-error 'admin' is not a declared identity
                auth: 'admin',
                responses: {
                    200: z.object({
                        ok: z.boolean(),
                    }),
                },
            });
        },
        'requestContext.handlerArg': () => {
            expectTypeOf<Router<typeof requestContextContract>['api']['publicRoute']>().parameter(0).toMatchTypeOf<{
                requestContext: { analytics: { sessionId: string | null } };
            }>();
        },
        'requestContext.guardArg': () => {
            localUser.guard(({ requestContext, bearer, deny }) => {
                expectTypeOf(requestContext.analytics).toEqualTypeOf<{ sessionId: string | null }>();
                if (!bearer)
                    return deny({
                        status: 401,
                        body: {
                            detail: 'Unauthorized',
                        },
                    });
                return {
                    userId: requestContext.analytics.sessionId ?? bearer.token,
                };
            });
        },
        'requestContext.resolverReturn': () => {
            localAnalytics.handler(
                // @ts-expect-error the resolver must return the schema's shape
                () => ({
                    wrongField: true,
                })
            );
        },
        'requestContext.unknownKey': () => {
            const handler: Router<typeof requestContextContract>['api']['publicRoute'] = ({ requestContext }) => {
                // @ts-expect-error 'metrics' is not a declared context key
                void requestContext.metrics;
                return {
                    status: 200,
                    body: {
                        ok: true,
                    },
                };
            };
            void handler;
        },
        'standalone.routeHandlerAuth': () => {
            const whoAmI: RouteHandler<typeof securedContract.routes.api.whoAmI> = ({ auth }) => {
                expectTypeOf(auth.user).toEqualTypeOf<{ userId: string }>();
                return {
                    status: 200,
                    body: {
                        userId: auth.user.userId,
                    },
                };
            };

            const secured: Router<typeof securedContract>['api']['whoAmI'] = whoAmI;
            void secured;
        },
        'standalone.routeGroupContractArgs': () => {
            type GroupArgs = Parameters<Router<typeof pluginTypeContract.routes>['whichLabel']>[0];
            type ContractArgs = Parameters<Router<typeof pluginTypeContract>['whichLabel']>[0];

            expectTypeOf<GroupArgs['plugins']>().toEqualTypeOf<ContractArgs['plugins']>();
            expectTypeOf<GroupArgs['jobs']>().toEqualTypeOf<ContractArgs['jobs']>();
        },
        'standalone.routeHandlerContractArgs': () => {
            type RouteArgs = Parameters<RouteHandler<typeof pluginTypeContract.routes.whichLabel>>[0];
            type ContractArgs = Parameters<Router<typeof pluginTypeContract>['whichLabel']>[0];

            expectTypeOf<RouteArgs['plugins']>().toEqualTypeOf<ContractArgs['plugins']>();
            expectTypeOf<RouteArgs['jobs']>().toEqualTypeOf<ContractArgs['jobs']>();
        },
        'plugins.exportsTyped': () => {
            expectTypeOf<Router<typeof pluginTypeContract>['whichLabel']>().parameter(0).toMatchTypeOf<{
                plugins: { probe: { label: () => string } };
            }>();
        },
        'plugins.absentWhenUninstalled': () => {
            type Args = Parameters<Router<typeof inferenceContract>['getUser']>[0];
            expectTypeOf<'plugins' extends keyof Args ? true : false>().toEqualTypeOf<false>();
        },
        'standalone.routeHandlerContext': () => {
            const publicRoute: RouteHandler<typeof requestContextContract.routes.api.publicRoute> = ({ requestContext }) => {
                expectTypeOf(requestContext.analytics).toEqualTypeOf<{ sessionId: string | null }>();
                return {
                    status: 200,
                    body: {
                        ok: true,
                    },
                };
            };

            const installed: Router<typeof requestContextContract>['api']['publicRoute'] = publicRoute;
            void installed;
        },
    });
});

test('Express Request is augmented with kizunaRoute', () => {
    expectTypeOf<Request['kizunaRoute']>().toEqualTypeOf<RouteDefinition | undefined>();
});

test('a request context resolver reads the Express request', () => {
    localAnalytics.handler(({ req }) => ({
        sessionId: req.header('x-posthog-session-id') ?? null,
    }));
});

test('the Express adapter is a value carrying its handler context', () => {
    expectTypeOf<HandlerContextOf<typeof expressAdapter>>().toEqualTypeOf<ExpressHandlerContext>();
});
