import type { z } from 'zod';
import type { Contract, RoutesOf, SchemesOf, RequestContextOf, ContractPluginsOf, JobsOf } from './contract.js';
import type { Routes } from './types.js';
import type { SecurityScheme } from './security-scheme.js';
import type { CredentialOf } from './identity.js';
import type { RequestContextSchema, RequestContextHeaderValues } from './request-context.js';
import type { JobsArg } from './jobs.js';
import type { PluginArgs } from './plugin.js';
import type { GuardBody } from './problem-details.js';
import type { GuardReturn, GuardSuccess, HandlersFromRoutes, RequestContextValues, Router as CoreRouter } from './handler-pipeline.js';
import { type GuardDeny, type GuardDenial, type GuardRun } from './adapter.js';

/**
 * The handler tree for an api or route group, typed against it, with an
 * adapter's handler context substituted in. Adapter packages check their own
 * surface against this; an app types a handler by writing it on the route.
 */
export type ContractRouter<C, HandlerContext> = C extends Contract
    ? HandlersFromRoutes<
          RoutesOf<C>,
          HandlerContext & RequestContextValues<RequestContextOf<C>> & PluginArgs<ContractPluginsOf<C>> & JobsArg<JobsOf<C>>,
          SchemesOf<C>
      >
    : C extends Routes
      ? CoreRouter<C, HandlerContext>
      : never;

/**
 * A guard per identity, keyed by name. Each receives the handler context, the
 * credential its method extracted, a `deny` helper, and the api's
 * request context, and returns that
 * identity's {@link GuardReturn} or a `deny(...)` result. Keying by name lets
 * each guard's return be typed against its own identity, so a literal role
 * needs no annotation.
 */
export type GuardFnsFor<
    Schemes extends Record<string, SecurityScheme>,
    Params,
    HandlerContext,
    RequestContext = {},
    GuardSchema = never,
> = {
    [Name in keyof Schemes]: (
        args: HandlerContext &
            RequestContextValues<RequestContext> &
            CredentialOf<Schemes[Name]> & {
                params: Params;
                deny: GuardDeny<GuardBody<GuardSchema>>;
            }
    ) => [keyof GuardSuccess<Schemes[Name]>] extends [never]
        ? void | GuardDenial | Promise<void | GuardDenial>
        : GuardReturn<Schemes[Name]> | GuardDenial | Promise<GuardReturn<Schemes[Name]> | GuardDenial>;
};

/**
 * One guard per identity declared on the api.
 */
export type GuardsFor<Schemes extends Record<string, SecurityScheme>, HandlerContext> = {
    [Name in keyof Schemes]: GuardRun<HandlerContext>;
};

/**
 * The resolver functions for the request context schemas declared on `kizuna`,
 * keyed by name. Each runs on every route, before the guards, and returns its
 * schema's value.
 */
export type RequestResolverFnsFor<RequestContext extends Record<string, RequestContextSchema>, HandlerContext> = {
    [Name in keyof RequestContext]: (
        args: HandlerContext & {
            params: Record<string, string>;
            headers: RequestContextHeaderValues<RequestContext[Name]>;
        }
    ) => z.output<RequestContext[Name]['context']> | Promise<z.output<RequestContext[Name]['context']>>;
};
