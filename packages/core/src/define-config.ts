import type { z } from 'zod';
import { assembleContract, type Contract } from './contract.js';
import { pluginRouteTree, pluginsByName, type PluginArgs, type PluginList, type PluginsByName } from './plugin.js';
import { assertNoPathCollisions, routeClaims } from './path-claims.js';
import { assertValidDeprecationDates } from './deprecation.js';
import { assertValidCache } from './cache.js';
import { injectGuardResponses } from './guard-responses.js';
import { flattenRoutes, type RoutesWithHandlerContext } from './handler-pipeline.js';
import { jobClaims, type Jobs, type JobsArg, type JobsConfig } from './jobs.js';
import type { JobTransport } from './job-transport.js';
import type { JobErrorHandler } from './job-runner.js';
import type { TagOptions, TagSet } from './tags.js';
import { problemDetails, type GuardBody, type GuardOutput, type GuardSchemaCheck } from './problem-details.js';
import { readObjectShape } from './zod-internals.js';
import type { Routes, RouteDefinition, RouteAuth, SecurityRequirement, RequiredPermissions } from './types.js';
import type { SecurityScheme } from './security-scheme.js';
import type { RequestContextSchema } from './request-context.js';
import type { AnyAdapter } from './adapter.js';
import { permissionNames } from './permissions.js';
import { GUARD } from './identity-builder.js';
import { RESOLVER } from './request-context-builder.js';
import { buildApi, type Api } from './api.js';
import type { ClientTarget } from './config.js';

/**
 * Kizuna sends the guard body itself when a route's `requires` turns a caller
 * away, so every field beyond the envelope has to be one it can fill.
 */
const ENVELOPE_FIELDS = ['type', 'title', 'status', 'detail'];

const assertFillableGuardSchema = (schema: z.ZodType): void => {
    const shape = readObjectShape(schema);
    if (shape === undefined || !ENVELOPE_FIELDS.every((field) => field in shape)) {
        throw new Error(
            'The `guardSchema` must extend `ProblemDetailsSchema`. Every response at 400 or above is RFC 9457 Problem Details.'
        );
    }
    if (schema.safeParse(problemDetails(403, 'Forbidden')).success) return;
    throw new Error(
        'The `guardSchema` cannot be built from a status and a detail alone. ' +
            "Kizuna sends it when a route's `requires` refuses a caller, so give every field you added `.optional()` or a `.default()`."
    );
};

/**
 * The security requirement for the identities an entry names. An OAuth token
 * carries its permissions as scopes, so an `oauth2` or `openIdConnect`
 * identity lists what the route requires from its catalog.
 */
const requirementFor = (
    names: readonly string[],
    requires: RequiredPermissions | undefined,
    identities: Record<string, SecurityScheme> | undefined
): Record<string, readonly string[]> => {
    const requirement: Record<string, readonly string[]> = {};
    for (const name of names) {
        const identity = identities?.[name];
        const type = identity?.openapi?.type;
        const catalog = identity?.roles?.permissions?.catalog;
        requirement[name] =
            requires !== undefined && catalog !== undefined && (type === 'oauth2' || type === 'openIdConnect')
                ? permissionNames(requires).filter((permission) => {
                      const [resource, verb] = permission.split(':');
                      return catalog[resource ?? '']?.includes(verb ?? '') ?? false;
                  })
                : [];
    }
    return requirement;
};

/**
 * Apply a route's {@link RouteAuth} to it, setting its `security` and, when
 * narrowed, its `roles` and `requires`.
 */
const resolveRouteAuth = (
    route: RouteDefinition,
    value: RouteAuth,
    identities: Record<string, SecurityScheme> | undefined,
    routePath: string
): void => {
    delete route.roles;
    delete route.requires;
    if (value === false) {
        route.security = [];
        return;
    }
    if (typeof value === 'string') {
        route.security = [value];
        return;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) throw new Error(`Route '${routePath}' names no identity under \`auth\`.`);
        route.security = [requirementFor(value as readonly string[], undefined, identities) as SecurityRequirement];
        return;
    }
    const rule = value as Exclude<RouteAuth, false | string | readonly string[]>;
    const names = typeof rule.identity === 'string' ? [rule.identity] : [...rule.identity];
    if (names.length === 0) {
        throw new Error(`Route '${routePath}' names no identity under \`auth\`.`);
    }
    route.security = [requirementFor(names, undefined, identities) as SecurityRequirement];

    const accepted = rule.roles === undefined ? [] : typeof rule.roles === 'string' ? [rule.roles] : [...rule.roles];
    if (accepted.length > 0) {
        const declared = names.map((name) => identities?.[name]?.roles).filter((roles) => roles !== undefined);
        if (declared.length === 0) {
            throw new Error(`Route '${routePath}' has \`roles\`, but none of its identities declares roles.`);
        }
        for (const role of accepted) {
            if (!declared.some((roles) => roles.names.includes(role))) {
                throw new Error(`Route '${routePath}' accepts the role '${role}', which no identity on the route declares.`);
            }
        }
        route.roles = accepted;
    }

    const requires = rule.requires as RequiredPermissions | undefined;
    if (requires === undefined || Object.keys(requires).length === 0) return;
    const catalogs = names.map((name) => identities?.[name]?.roles?.permissions?.catalog).filter((catalog) => catalog !== undefined);
    if (catalogs.length === 0) {
        throw new Error(`Route '${routePath}' has \`requires\`, but none of its identities declares permissions.`);
    }
    for (const [resource, verbs] of Object.entries(requires)) {
        for (const verb of verbs) {
            if (!catalogs.some((catalog) => catalog[resource]?.includes(verb))) {
                throw new Error(`Route '${routePath}' requires '${resource}:${verb}', which no identity on the route declares.`);
            }
        }
    }
    route.requires = requires;
    route.security = [requirementFor(names, requires, identities) as SecurityRequirement];
};

/**
 * The handlers a record of declarations carries, keyed the way they were
 * declared. A declaration without one is left out, so what is missing surfaces
 * where it is used rather than as an empty function.
 */
const handlersOf = (declarations: Record<string, unknown> | undefined, key: string | symbol): Record<string, unknown> | undefined => {
    if (declarations === undefined) return undefined;
    const handlers: Record<string, unknown> = {};
    for (const [name, declaration] of Object.entries(declarations)) {
        const handler = (declaration as Record<string | symbol, unknown> | undefined)?.[key];
        if (handler !== undefined) handlers[name] = handler;
    }
    return handlers;
};

/**
 * What one API is made of. Everything kizuna knows about an API is written
 * here: what it declares, and what serves it.
 */
export type KizunaConfigInput<
    R extends Routes,
    J extends Jobs,
    P extends PluginList,
    Tags extends Record<string, TagOptions>,
    Codes extends string,
    Identities extends Record<string, SecurityScheme>,
    RequestContext extends Record<string, RequestContextSchema>,
    GuardSchema extends z.ZodType | undefined,
    AdapterValue extends AnyAdapter | undefined,
> = {
    /**
     * The framework this API is served on, as a value. Its handler context
     * reaches every handler, and the api it returns mounts onto that
     * framework's app.
     *
     * @example
     * import { expressAdapter } from '@ts-kizuna/express';
     */
    adapter?: AdapterValue;
    /**
     * The route groups this API answers, as `k.routes` returned them.
     */
    routes: R;
    jobs?: J;
    /**
     * What this API installs beside its own routes. Each plugin carries its own
     * name, which is what handlers reach it under.
     *
     * @example
     * plugins: [mcpPlugin({ name: 'workspace' }), openApiPlugin({ info })],
     */
    plugins?: P;
    tags?: TagSet<Tags>;
    /**
     * The identities routes name under `auth`, each declared with `k.identity`
     * and carrying the guard that authenticates it.
     */
    identities?: Identities;
    /**
     * What every route resolves before its guards run, each declared with
     * `k.requestContext` and carrying the resolver that fills it.
     */
    requestContext?: RequestContext;
    /**
     * The body every guard's `deny()` produces, and the body each guarded
     * route's `401` and `403` carry. Extend `ProblemDetailsSchema`. Every field
     * you add must be optional or carry a `.default()`, because kizuna sends
     * this itself when a route's `requires` turns a caller away.
     *
     * @example
     * guardSchema: ProblemDetailsSchema.extend({
     *     code: z.enum(['unauthenticated', 'expired_token', 'forbidden']).default('forbidden'),
     * }),
     */
    guardSchema?: GuardSchema & GuardSchemaCheck<GuardSchema>;
    /**
     * The `code` values `k.issue` may emit, beyond Zod's own.
     */
    issueCodes?: readonly Codes[];
    /**
     * Settings shared by every job. The jobs themselves are declared with `k.jobs`.
     */
    jobsConfig?: JobsConfig;
    /**
     * Carries a queued job to whatever runs it. Without one, `queue` runs the
     * job in this process and it is lost on a crash.
     */
    jobTransport?: JobTransport;
    onJobError?: JobErrorHandler;
    /**
     * What `kizuna generate` writes from this API: one entry per generated
     * client.
     *
     * @example
     * clients: [
     *     swiftClient({
     *         output: './Sources/APIClient/APIClient.swift',
     *     }),
     * ],
     */
    clients?: readonly ClientTarget[];
};

/**
 * The api `defineConfig` assembles: the contract it declares, and the `mount`
 * that serves it.
 */
export type ConfiguredApi<
    R extends Routes,
    J extends Jobs,
    P extends PluginList,
    Tags extends Record<string, TagOptions>,
    Codes extends string,
    Identities extends Record<string, SecurityScheme>,
    RequestContext extends Record<string, RequestContextSchema>,
    GuardSchema extends z.ZodType | undefined,
    AdapterValue extends AnyAdapter | undefined,
> = Api<
    Contract<
        RoutesWithHandlerContext<
            R,
            Identities,
            RequestContext,
            PluginArgs<PluginsByName<P>> & JobsArg<J>,
            GuardOutput<GuardSchema>,
            GuardBody<GuardSchema>
        >,
        Tags,
        Codes,
        Identities,
        RequestContext,
        PluginsByName<P>,
        J,
        GuardSchema
    >,
    AdapterValue
>;

/**
 * Everything kizuna knows about one API, written in `kizuna.config.ts`. Every
 * route's `auth` resolves onto its `security`, `roles` and `requires`, the
 * routes, jobs, tools and plugins are checked against one another, and the
 * `api` it hands back mounts onto the adapter's framework.
 *
 * @example
 * export const { api } = defineConfig({
 *     adapter: expressAdapter(),
 *     identities: {
 *         user,
 *     },
 *     routes,
 * });
 *
 * api.mount(app);
 */
export const defineConfig = <
    const R extends Routes,
    const J extends Jobs = Record<string, never>,
    const P extends PluginList = readonly [],
    const Tags extends Record<string, TagOptions> = Record<string, never>,
    const Codes extends string = never,
    const Identities extends Record<string, SecurityScheme> = Record<string, never>,
    const RequestContext extends Record<string, RequestContextSchema> = Record<string, never>,
    GuardSchema extends z.ZodType | undefined = undefined,
    const AdapterValue extends AnyAdapter | undefined = undefined,
>(
    options: KizunaConfigInput<R, J, P, Tags, Codes, Identities, RequestContext, GuardSchema, AdapterValue>
): {
    api: ConfiguredApi<R, J, P, Tags, Codes, Identities, RequestContext, GuardSchema, AdapterValue>;
    clients: readonly ClientTarget[];
} => {
    if (options.guardSchema) assertFillableGuardSchema(options.guardSchema);

    const routes = options.routes as Routes;
    const jobs = options.jobs as Jobs | undefined;
    const identities = options.identities as Record<string, SecurityScheme> | undefined;
    const plugins = pluginsByName(options.plugins);

    assertNoPathCollisions([
        ...routeClaims(routes),
        ...routeClaims(pluginRouteTree(plugins), 'Plugin route'),
        ...jobClaims(jobs, options.jobsConfig),
    ]);
    assertValidDeprecationDates(routes);
    assertValidDeprecationDates(pluginRouteTree(plugins));

    const declaresIdentities = Object.keys(identities ?? {}).length > 0;
    for (const { route, routeKey } of flattenRoutes(routes)) {
        if (route.auth === undefined) {
            if (declaresIdentities) {
                throw new Error(
                    `Route '${routeKey}' declares no \`auth\`. Name the identity it requires, or \`false\` for a public route.`
                );
            }
            route.security = [];
            continue;
        }
        resolveRouteAuth(route, route.auth, identities, routeKey);
    }
    // After every route's `auth` resolves, so both of these can read `security`.
    injectGuardResponses(routes, identities, options.guardSchema);
    assertValidCache(routes);
    assertValidCache(pluginRouteTree(plugins));

    const contract = assembleContract({
        routes,
        jobs,
        tags: options.tags as TagSet<Record<string, TagOptions>> | undefined,
        securitySchemes: identities,
        guardSchema: options.guardSchema,
        requestContext: options.requestContext as Record<string, RequestContextSchema> | undefined,
        validation: options.issueCodes ? { issueCodes: options.issueCodes } : undefined,
        plugins,
        jobsConfig: options.jobsConfig,
    }) as Contract;

    const guards = handlersOf(identities, GUARD);
    if (options.adapter !== undefined) {
        for (const name of Object.keys(identities ?? {})) {
            if (guards?.[name] !== undefined) continue;
            throw new Error(`Identity '${name}' has no guard. Add \`.guard(...)\` to its declaration, so something authenticates it.`);
        }
    }

    const api = buildApi(
        contract,
        {
            guards,
            requestContext: handlersOf(options.requestContext as Record<string, unknown> | undefined, RESOLVER),
            jobTransport: options.jobTransport,
            onJobError: options.onJobError,
        },
        options.adapter
    ) as unknown as ConfiguredApi<R, J, P, Tags, Codes, Identities, RequestContext, GuardSchema, AdapterValue>;

    return {
        api,
        clients: options.clients ?? [],
    };
};
