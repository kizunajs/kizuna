import type { z } from 'zod';
import type { Contract, RoutesOf, SchemesOf, RequestContextOf, ContractPluginsOf, JobsOf, ToolsOf, GuardSchemaOf } from './contract.js';
import type { Routes } from './types.js';
import type { SecurityScheme } from './security-scheme.js';
import type { CredentialOf } from './identity.js';
import type { RequestContextSchema, RequestContextHeaderValues } from './request-context.js';
import type { JobHandlers, JobsArg } from './jobs.js';
import type { ToolHandlers } from './tools.js';
import type { ToolsArg } from './tool-runner.js';
import type { PluginArgs } from './plugin.js';
import type { PluginImplementations } from './plugin-server.js';
import type { GuardBody } from './problem-details.js';
import type {
    GuardReturn,
    GuardSuccess,
    HandlersFromRoutes,
    GuardParams,
    RequestContextValues,
    Router as CoreRouter,
} from './handler-pipeline.js';
import {
    assembleApi,
    warnUnsupportedJobOptions,
    JOBS_META,
    TOOLS_META,
    type ApiParts,
    type ApiWithRouter,
    type GuardDeny,
    type GuardDenial,
    type GuardRun,
    type RequestContextRun,
    type ServerOptions,
} from './adapter.js';

/**
 * The handler tree for a contract or route group, typed against it. Routes
 * secured by the contract's access control map additionally receive each required
 * identity's context in their handler args, under `auth`, keyed by the
 * identity's name.
 */
export type ContractRouter<C, HandlerContext> = C extends Contract
    ? HandlersFromRoutes<
          RoutesOf<C>,
          HandlerContext &
              RequestContextValues<RequestContextOf<C>> &
              PluginArgs<ContractPluginsOf<C>> &
              JobsArg<JobsOf<C>> &
              ToolsArg<ToolsOf<C>>,
          SchemesOf<C>
      >
    : C extends Routes
      ? CoreRouter<C, HandlerContext>
      : never;

/**
 * The handler for each of a contract's scheduled jobs. Each receives only the
 * job's `input`, so the same handler can be run in process.
 */
export type ContractJobsRouter<C> = C extends Contract ? JobHandlers<JobsOf<C>> : never;

/**
 * The handler for each of a contract's tools. Each receives only the tool's
 * `input` and `throwError`, so the same handler runs however the tool is
 * reached.
 */
export type ContractToolsRouter<C> = C extends Contract ? ToolHandlers<ToolsOf<C>> : never;

/**
 * The handlers for a group named on the contract, or for a bare route group.
 * Both forms resolve through one signature: a second candidate of the same
 * arity costs zero-argument handlers their contextual type.
 */
export type ContractGroupRouter<Source, GroupOrRoutes, HandlerContext> = GroupOrRoutes extends string
    ? ContractRouter<Source, HandlerContext>[Extract<GroupOrRoutes, keyof ContractRouter<Source, HandlerContext>>]
    : ContractRouter<GroupOrRoutes, HandlerContext>;

/**
 * A guard per identity, keyed by name. Each receives the handler context, the
 * credential its method extracted, a `deny` helper, and the contract's
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
 * One guard per identity declared on the contract.
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
