import type { z } from 'zod';
import type { Routes } from './types.js';
import type { TagSet, TagOptions } from './tags.js';
import type { SecurityScheme } from './security-scheme.js';
import type { RequestContextSchema } from './request-context.js';
import type { Jobs, JobsConfig } from './jobs.js';
import type { ApiPlugins } from './plugin.js';

/**
 * A kizuna API definition: its routes plus tags, identities, and validation
 * settings. Produced by `defineConfig` and consumed by the server adapters,
 * fetch client, OpenAPI generator, and SDK generators.
 */
export interface ApiDefinition<
    Routes_ extends Routes = Routes,
    Tags extends Record<string, TagOptions> = Record<string, TagOptions>,
    Codes extends string = string,
    Schemes extends Record<string, SecurityScheme> = Record<string, SecurityScheme>,
    RequestContext extends Record<string, RequestContextSchema> = Record<string, RequestContextSchema>,
    Plugins extends ApiPlugins = ApiPlugins,
    Jobs_ extends Jobs = Jobs,
    GuardSchema extends z.ZodType | undefined = z.ZodType | undefined,
> {
    /**
     * The API's route groups.
     */
    routes: Routes_;
    /**
     * The body every guard's `deny()` produces, named in `defineConfig` under
     * `guardSchema`. Each guarded route's `401` and `403` carry it in place of
     * bare Problem Details.
     */
    guardSchema?: GuardSchema;
    /**
     * The plugins installed on `defineConfig`. Their routes are served by
     * `api.mount` but stay outside `routes`, so the client and the generators
     * do not see them.
     */
    plugins?: Plugins;
    /**
     * The scheduled jobs declared with `k.jobs`, keyed by name.
     */
    jobs?: Jobs_;
    /**
     * The job settings named in `defineConfig` under `jobsConfig`.
     */
    jobsConfig?: JobsConfig;
    /**
     * The tag set declared with `k.tags`. Routes reference its keys; the
     * OpenAPI generator resolves each key to its title and description.
     */
    tags?: TagSet<Tags>;
    /**
     * The identities named in `defineConfig`. A route's `auth` names them,
     * `defineConfig` writes each route's `security` from it, and the
     * OpenAPI generator emits them under `components.securitySchemes`.
     */
    securitySchemes?: Schemes;
    /**
     * The request context schemas named in `defineConfig`. Each key names a
     * provider registered on `defineConfig`; every handler receives its value.
     * Never gates a request and never appears in the OpenAPI document.
     */
    requestContext?: RequestContext;
    /**
     * Validation behavior for the API.
     */
    validation?: {
        /**
         * Custom validation issue codes this API's handlers may emit.
         */
        issueCodes?: readonly Codes[];
    };
}

/**
 * Internal helper that builds a {@link ApiDefinition} from routes, tags, identities,
 * and issue codes. Called by `defineConfig`. Not part of the public surface;
 * author contracts through `k`.
 */
export function buildApiDefinition<
    const Tags extends Record<string, TagOptions> = Record<string, never>,
    const Codes extends string = never,
    const Schemes extends Record<string, SecurityScheme> = Record<string, never>,
    const R extends Routes<Extract<keyof Tags, string>, Extract<keyof Schemes, string>> = Routes<
        Extract<keyof Tags, string>,
        Extract<keyof Schemes, string>
    >,
    const RequestContext extends Record<string, RequestContextSchema> = Record<string, never>,
    const Plugins extends ApiPlugins = Record<string, never>,
    const Jobs_ extends Jobs = Record<string, never>,
    GuardSchema extends z.ZodType | undefined = undefined,
>(config: {
    routes: R;
    guardSchema?: GuardSchema;
    jobs?: Jobs_;
    jobsConfig?: JobsConfig;
    tags?: TagSet<Tags>;
    securitySchemes?: Schemes;
    requestContext?: RequestContext;
    validation?: {
        issueCodes?: readonly Codes[];
    };
    plugins?: Plugins;
}): ApiDefinition<R, Tags, Codes, Schemes, RequestContext, Plugins, Jobs_, GuardSchema> {
    return {
        routes: config.routes,
        guardSchema: config.guardSchema,
        plugins: config.plugins,
        jobs: config.jobs,
        jobsConfig: config.jobsConfig,
        tags: config.tags,
        securitySchemes: config.securitySchemes,
        requestContext: config.requestContext,
        validation: config.validation,
    };
}

/**
 * An api's route groups.
 */
export type RoutesOf<C extends ApiDefinition> = C['routes'];

/**
 * An api's identities, or an empty map when it declares none.
 */
export type SchemesOf<C extends ApiDefinition> = Exclude<C['securitySchemes'], undefined>;

/**
 * An api's request context schemas, or an empty map when it declares none.
 */
export type RequestContextOf<C extends ApiDefinition> = Exclude<C['requestContext'], undefined>;

/**
 * An api's plugins, or an empty map when it declares none.
 */
export type ApiPluginsOf<C extends ApiDefinition> = Exclude<C['plugins'], undefined>;

/**
 * An api's jobs, or an empty map when it declares none.
 */
export type JobsOf<C extends ApiDefinition> = Exclude<C['jobs'], undefined>;

export type GuardSchemaOf<C extends ApiDefinition> = Extract<C['guardSchema'], z.ZodType>;

/**
 * An api's tools, or an empty map when it declares none.
 */
