import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { Kizuna } from '@ts-kizuna/core';
import type { HandlerContextOf, ContractRouter } from '@ts-kizuna/core/adapter';
import type { Env } from 'hono';
import type { GuardRun, RequestContextRun } from '@ts-kizuna/core/adapter';
import {
    checkAdapterTypeFeatures,
    gateContract,
    inferenceContract,
    inferenceGroupContract,
    streamInferenceContract,
    inferenceRoutes,
    pluginTypeContract,
    requestContextContract,
    securedContract,
} from '../../core/src/adapter-testing/type-testing.js';
import { honoAdapter, type HonoHandlerContext } from './server.js';

interface SessionEnv extends Env {
    Variables: {
        sessionId: string;
    };
}

interface LocalConfig {
    adapter: ReturnType<typeof honoAdapter>;
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

/**
 * The handler tree for a contract, with this adapter's handler context, which is
 * what every `handler.*` and `guards.*` feature below is checked against.
 */
type Handlers<C> = ContractRouter<C, HonoHandlerContext>;

test('conforms to the shared adapter type catalogue', () => {
    checkAdapterTypeFeatures('hono', {
        'streams.bodyGenerator': () => {
            const reply: Handlers<typeof streamInferenceContract>['reply'] = async ({ body }) => ({
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
            const wrongEvent: Handlers<typeof streamInferenceContract>['reply'] = async () => ({
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
            const valueBody: Handlers<typeof streamInferenceContract>['reply'] = async () => ({
                status: 200,
                body: {
                    text: 'x',
                },
            });
            void valueBody;
            const thrown: Handlers<typeof streamInferenceContract>['reply'] = async ({ throwError }) => {
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
        'surface.guardRun': () => {
            expectTypeOf<Parameters<typeof localUser.guard>[0]>().parameter(0).toMatchTypeOf<HonoHandlerContext>();
            expectTypeOf<GuardRun<HonoHandlerContext>>().parameter(0).toMatchTypeOf<HonoHandlerContext>();
        },
        'surface.requestContextRun': () => {
            expectTypeOf<Parameters<typeof localAnalytics.handler>[0]>().parameter(0).toMatchTypeOf<HonoHandlerContext>();
            expectTypeOf<RequestContextRun<HonoHandlerContext>>().parameter(0).toMatchTypeOf<HonoHandlerContext>();
        },
        'router.undeclaredStatus': () => {
            const getUser: Handlers<typeof inferenceGroupContract>['users']['getUser'] = () => ({
                // @ts-expect-error 418 is not a declared response of getUser.
                status: 418,
            });
            void getUser;
        },
        'handler.pathParams': () => {
            expectTypeOf<Handlers<typeof inferenceContract>['getUser']>().parameter(0).toMatchTypeOf<{ params: { id: string } }>();
        },
        'handler.body': () => {
            expectTypeOf<Handlers<typeof inferenceContract>['createUser']>()
                .parameter(0)
                .toMatchTypeOf<{ body: { name: string; email: string } }>();
            expectTypeOf<Handlers<typeof inferenceContract>['getUser']>().parameter(0).toMatchTypeOf<{ body: undefined }>();
        },
        'handler.context': () => {
            expectTypeOf<Handlers<typeof inferenceContract>['getUser']>().parameter(0).toMatchTypeOf<HonoHandlerContext>();
        },
        'guards.identityContext': () => {
            expectTypeOf<Handlers<typeof securedContract>['api']['whoAmI']>()
                .parameter(0)
                .toMatchTypeOf<{ auth: { user: { userId: string } } }>();
            expectTypeOf<Handlers<typeof securedContract>['api']['ownerOnly']>().parameter(0).toMatchTypeOf<{
                auth: { member: { workspaceUserId: string; role: 'owner' | 'admin' | readonly ('owner' | 'admin')[] } };
            }>();
            expectTypeOf<Handlers<typeof securedContract>['api']['both']>().parameter(0).toMatchTypeOf<{
                auth: { user: { userId: string }; member: { workspaceUserId: string } };
            }>();
        },
        'guards.publicNoAuth': () => {
            expectTypeOf<Handlers<typeof securedContract>['api']['publicRoute']>().parameter(0).not.toHaveProperty('auth');
        },
        'guards.gateOnlyNoAuth': () => {
            expectTypeOf<Handlers<typeof gateContract>['api']['apiOnly']>().parameter(0).not.toHaveProperty('auth');
            expectTypeOf<Handlers<typeof gateContract>['api']['whoAmI']>()
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
            expectTypeOf<Handlers<typeof requestContextContract>['api']['publicRoute']>().parameter(0).toMatchTypeOf<{
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
            const handler: Handlers<typeof requestContextContract>['api']['publicRoute'] = ({ requestContext }) => {
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
        'plugins.exportsTyped': () => {
            expectTypeOf<Handlers<typeof pluginTypeContract>['whichLabel']>().parameter(0).toMatchTypeOf<{
                plugins: { probe: { label: () => string } };
            }>();
        },
        'plugins.absentWhenUninstalled': () => {
            type Args = Parameters<Handlers<typeof inferenceContract>['getUser']>[0];
            expectTypeOf<'plugins' extends keyof Args ? true : false>().toEqualTypeOf<false>();
        },
    });
});

test('a request context resolver reads the Hono context', () => {
    localAnalytics.handler(({ c }) => ({
        sessionId: c.req.header('x-posthog-session-id') ?? null,
    }));
});

test('the Env generic threads through the handler context', () => {
    expectTypeOf<HonoHandlerContext<SessionEnv>['c']['var']['sessionId']>().toEqualTypeOf<string>();
    expectTypeOf<ContractRouter<typeof inferenceContract, HonoHandlerContext<SessionEnv>>['getUser']>()
        .parameter(0)
        .toMatchTypeOf<HonoHandlerContext<SessionEnv>>();
});

test('the Hono adapter is a value carrying its handler context', () => {
    expectTypeOf<HandlerContextOf<ReturnType<typeof honoAdapter>>>().toEqualTypeOf<HonoHandlerContext<Env>>();
});
