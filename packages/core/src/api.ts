import type { z } from 'zod';
import { assembleContract, type Contract } from './contract.js';
import {
    assembleApi,
    routerFromRoutes,
    warnUnsupportedJobOptions,
    JOBS_META,
    TOOLS_META,
    type ApiParts,
    type ApiWithRouter,
} from './adapter.js';
import type { AnyAdapter, MountArgsOf, MountedOf } from './adapter.js';
import type { Jobs, JobsConfig } from './jobs.js';
import type { Tools } from './tools.js';
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
 * Assemble a contract and its implementations into the object a framework
 * mounts. The handlers come from the routes themselves.
 */
export const buildApi = (
    contract: Contract,
    implementations: ApiImplementations,
    adapter: AnyAdapter | undefined
): Record<string, unknown> => {
    warnUnsupportedJobOptions(contract.jobs, undefined);
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
                  handlers: implementations.jobs ?? {},
                  config: contract.jobsConfig,
              }
            : undefined,
        [TOOLS_META]: contract.tools
            ? {
                  tools: contract.tools,
                  handlers: implementations.tools ?? {},
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
export interface ApiDeclaration<R extends Routes, J extends Jobs, T extends Tools, P extends ContractPlugins> {
    routes: R;
    jobs?: J;
    tools?: T;
    plugins?: P;
}

export { assembleContract };
