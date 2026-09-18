import { HANDLER } from './types.js';
import type { z } from 'zod';
import { assembleContract, type Contract } from './contract.js';
import { assembleApi, routerFromRoutes, warnUnsupportedJobOptions, JOBS_META, type ApiParts, type ApiWithRouter } from './adapter.js';
import type { AnyAdapter, MountArgsOf, MountedOf } from './adapter.js';
import type { Jobs, JobsConfig } from './jobs.js';
import type { JobTransport } from './job-transport.js';
import type { JobErrorHandler } from './job-runner.js';
import type { ContractPlugins } from './plugin.js';
import type { Routes } from './types.js';
import type { SecurityScheme } from './security-scheme.js';
import type { TagSet, TagOptions } from './tags.js';
import type { RequestContextSchema } from './request-context.js';

/**
 * What an api answers on, and how it reaches a framework: the contract it was
 * assembled from, plus `mount`.
 */
export type Api<C extends Contract, AdapterValue> = C &
    ApiWithRouter<C['routes']> & {
        /**
         * Register every route on the framework the adapter serves.
         */
        mount: (...args: MountArgsOf<AdapterValue>) => MountedOf<AdapterValue>;
    };

/**
 * The parts an api carries beyond its routes: one guard per identity, one
 * resolver per request context, and each plugin's server half.
 */
export interface ApiImplementations {
    guards?: Record<string, unknown>;
    requestContext?: Record<string, unknown>;
    plugins?: Record<string, unknown>;
    jobs?: Record<string, unknown>;
    tools?: Record<string, unknown>;
    /**
     * Carries a queued job to whatever runs it. Without one, `queue` runs the
     * job in this process and it is lost on a crash.
     */
    jobTransport?: JobTransport;
    onJobError?: JobErrorHandler;
}

export interface BuildApiConfig {
    tags?: TagSet<Record<string, TagOptions>>;
    securitySchemes?: Record<string, SecurityScheme>;
    guardSchema?: z.ZodType;
    requestContext?: Record<string, RequestContextSchema>;
    validation?: {
        issueCodes?: readonly string[];
    };
    jobsConfig?: JobsConfig;
    adapter?: AnyAdapter;
}

/**
 * The handler tree a jobs or tools tree already carries, mirroring its shape so
 * the runners find each declaration's own handler.
 */
const handlersFrom = (declarations: Record<string, unknown>): Record<string, unknown> => {
    const handlers: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(declarations)) {
        if (!value || typeof value !== 'object') continue;
        const compiled = value as { definition?: Record<symbol, unknown> };
        if (compiled.definition) {
            if (compiled.definition[HANDLER]) handlers[key] = compiled.definition[HANDLER];
            continue;
        }
        handlers[key] = handlersFrom(value as Record<string, unknown>);
    }
    return handlers;
};

/**
 * Assemble a contract and its implementations into the object a framework
 * mounts. The handlers come from the routes, jobs and tools themselves.
 */
export const buildApi = (
    contract: Contract,
    implementations: ApiImplementations,
    adapter: AnyAdapter | undefined
): Record<string, unknown> => {
    warnUnsupportedJobOptions(contract.jobs, implementations.jobTransport);
    const parts: ApiParts = {
        router: routerFromRoutes(contract.routes),
        guards: implementations.guards,
        requestContext: implementations.requestContext,
        plugins: implementations.plugins,
    } as ApiParts;

    const api = Object.assign(assembleApi(contract, parts) as Record<string | symbol, unknown>, contract, {
        [JOBS_META]: contract.jobs
            ? {
                  jobs: contract.jobs,
                  handlers: handlersFrom(contract.jobs as unknown as Record<string, unknown>),
                  config: contract.jobsConfig,
                  transport: implementations.jobTransport,
                  onError: implementations.onJobError,
              }
            : undefined,
    }) as Record<string, unknown>;

    api.mount = (...args: unknown[]) => {
        if (!adapter) {
            throw new Error(
                'This api has no adapter to mount on. Pass one to `new Kizuna({ adapter })`, or to `k.api({ adapter })` when the contract serves more than one framework.'
            );
        }
        return (adapter.mount as (api: unknown, ...rest: unknown[]) => unknown)(api, ...args);
    };

    return api;
};

/**
 * The contract half of what `k.api` takes.
 */
export interface ApiDeclaration<R extends Routes, J extends Jobs, P extends ContractPlugins> {
    routes: R;
    jobs?: J;
    plugins?: P;
}

export { assembleContract };
