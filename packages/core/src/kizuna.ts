import type { z } from 'zod';
import { tagRoutes } from './routes.js';
import { assembleContract, type Contract } from './contract.js';
import { pluginRouteTree, type ContractPlugins, type ContractPluginsArg, type PluginArgs } from './plugin.js';
import { assertNoPathCollisions, routeClaims } from './path-claims.js';
import { assertValidDeprecationDates } from './deprecation.js';
import { assertValidCache } from './cache.js';
import { injectGuardResponses } from './guard-responses.js';
import { addCodedIssue, type RegisteredIssue } from './coded-issue.js';
import { flattenRoutes, type RoutesWithHandlerContext } from './handler-pipeline.js';
import { jobClaims, buildJobs, type AuthoredJobs, type CompiledJobs, type Jobs, type JobsArg, type JobsConfig } from './jobs.js';
import { buildTools, type AuthoredTools, type CompiledTools, type Tools } from './tools.js';
import type { ToolsArg } from './tool-runner.js';
import { createTags, type TagSet, type TagOptions } from './tags.js';
import { createIdentity, type RolesOf } from './identity.js';
import { createPermissions, createRoles, permissionNames, type CatalogOf, type PermissionSet, type RoleNamesOf } from './permissions.js';
import { createRequestContext } from './request-context.js';
import { createModel } from './model.js';
import { problemDetails, type GuardBody, type GuardOutput, type GuardSchemaCheck } from './problem-details.js';
import { readObjectShape } from './zod-internals.js';
import type {
    Routes,
    RouteDefinition,
    RouteAuth,
    SecurityRequirement,
    RequiredPermissions,
    AuthoredRoutes,
    AuthoredRouteDefinition,
} from './types.js';
import type { SecurityScheme } from './security-scheme.js';
import type { RequestContextSchema } from './request-context.js';
import type { PathParamsCheck, RoutePathParamsCheck } from './path-params.js';
import type { AuthCheck, RouteAuthCheck } from './auth-check.js';
import { createRoute, type RouteBuilder } from './route.js';

/**
 * What a route requires of its caller: an identity name, several of them for
 * either, `false` for a public route, or the object form narrowing to roles or
 * permissions.
 */
export type RouteAuthValue<Id extends string = string, Identities = Record<string, unknown>> =
    | Id
    | false
    | readonly Id[]
    | RouteAuthRule<Id, Identities>;

/**
 * The `requires` an identity accepts: a subset of the catalog behind its roles,
 * or `never` when the identity declares no roles.
 */
type RequiresOf<Identities, Name extends string> = Name extends keyof Identities
    ? [CatalogOf<RolesOf<Identities[Name]>>] extends [never]
        ? never
        : PermissionSet<CatalogOf<RolesOf<Identities[Name]>>>
    : never;

/**
 * The `roles` an identity accepts: one of its declared role names or several,
 * or `never` when the identity declares no roles.
 */
type AcceptedRolesOf<Identities, Name extends string> = Name extends keyof Identities
    ? [RoleNamesOf<RolesOf<Identities[Name]>>] extends [never]
        ? never
        : RoleNamesOf<RolesOf<Identities[Name]>> | readonly RoleNamesOf<RolesOf<Identities[Name]>>[]
    : never;

/**
 * The object form of a {@link RouteAuthValue}. `roles` and `requires` are checked
 * against what the named identity declares.
 */
export type RouteAuthRule<Id extends string = string, Identities = Record<string, unknown>> =
    | {
          [Name in Id]: {
              identity: Name;
              roles?: AcceptedRolesOf<Identities, Name>;
              requires?: RequiresOf<Identities, Name>;
          };
      }[Id]
    | {
          identity: readonly Id[];
          roles?: AcceptedRolesOf<Identities, Id>;
          requires?: RequiresOf<Identities, Id>;
      };

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
 * What a {@link Kizuna} instance declares.
 */
export interface KizunaSpec {
    tags: Record<string, TagOptions>;
    codes: string;
    identities: Record<string, SecurityScheme>;
    requestContext: Record<string, RequestContextSchema>;
    guardSchema: z.ZodType | undefined;
}

/**
 * The tag names declared on a spec, e.g. `'health' | 'users'`.
 */
export type TagNamesOf<Spec extends KizunaSpec> = Extract<keyof Spec['tags'], string>;

/**
 * The identity names declared on a spec, e.g. `'user' | 'member'`.
 */
export type IdentityNamesOf<Spec extends KizunaSpec> = Extract<keyof Spec['identities'], string>;

/**
 * The authoring surface a {@link Kizuna} instance exposes.
 */
export interface K<Spec extends KizunaSpec = KizunaSpec> {
    /**
     * Declare one route and the handler that answers it. `body`, `params`,
     * `query` and `headers` are typed from the route, and the return is checked
     * against its `responses`.
     *
     * Group routes with `k.routes`, which takes the routes this returns.
     *
     * @example
     * export const createUser = k
     *     .route({
     *         method: 'POST',
     *         path: '/users',
     *         body: z.object({
     *             name: z.string().min(1),
     *         }),
     *         responses: {
     *             201: UserSchema,
     *         },
     *     })
     *     .handler(async ({ body }) => ({
     *         status: 201,
     *         body: await db.users.create(body.name),
     *     }));
     */
    route<const Definition extends AuthoredRouteDefinition<TagNamesOf<Spec>, IdentityNamesOf<Spec>>>(
        definition: Definition & RoutePathParamsCheck<Definition> & RouteAuthCheck<Definition, Spec['identities']>
    ): RouteBuilder<Definition>;
    /**
     * Define a group of routes. Pass a tag (one of the keys from `Kizuna.tags`)
     * to group them in the OpenAPI document, or omit it for an untagged group.
     */
    routes<const T extends AuthoredRoutes<TagNamesOf<Spec>, IdentityNamesOf<Spec>>>(
        tag: TagNamesOf<Spec>,
        defs: T & PathParamsCheck<T> & AuthCheck<T, Spec['identities']>
    ): T;
    routes<const T extends AuthoredRoutes<string, IdentityNamesOf<Spec>>>(
        defs: T & PathParamsCheck<T> & AuthCheck<T, Spec['identities']>
    ): T;
    /**
     * Declare scheduled jobs. Pass the identity every job requires, the one
     * credential your scheduler sends, then the jobs themselves.
     *
     * Jobs are their own concept, not routes. Each is reachable over HTTP so a
     * scheduler can trigger it, and runs through the same validation, guards, and
     * Problem Details as a route; but jobs never appear in `contract.routes`, the
     * OpenAPI document, or the generated Swift, Kotlin, and MCP surfaces.
     *
     * @example
     * export const jobs = k.jobs('scheduler', {
     *     sendDigests: {
     *         schedule: '0 5 * * *',
     *         summary: 'Send daily digest emails',
     *         result: z.object({
     *             sent: z.int(),
     *         }),
     *     },
     * });
     */
    jobs<const J extends AuthoredJobs, const Name extends IdentityNamesOf<Spec>>(identity: Name, definitions: J): CompiledJobs<J, Name>;
    jobs<const J extends AuthoredJobs>(definitions: J): CompiledJobs<J, undefined>;
    /**
     * Declare tools a model may call. Pass the identity every tool requires,
     * then the tools themselves.
     *
     * Tools are their own concept, not routes. A tool declares no path and no
     * method, and never appears in `contract.routes`, the OpenAPI document, or
     * the generated Swift and Kotlin clients. A streamed response names them
     * under `tools`, and the MCP plugin publishes them.
     *
     * @example
     * export const tools = k.tools({
     *     weather: {
     *         getForecast: {
     *             description: 'Look up tomorrow forecast for one city',
     *             input: z.object({
     *                 city: z.string(),
     *             }),
     *             output: z.object({
     *                 temperature: z.number(),
     *                 summary: z.string(),
     *             }),
     *             annotations: {
     *                 readOnlyHint: true,
     *             },
     *         },
     *     },
     * });
     */
    tools<const T extends AuthoredTools, const Name extends IdentityNamesOf<Spec>>(identity: Name, definitions: T): CompiledTools<T, Name>;
    tools<const T extends AuthoredTools>(definitions: T): CompiledTools<T, undefined>;
    /**
     * Assemble route groups into a contract. Every route's `auth` resolves onto
     * its `security`, `roles` and `requires`.
     *
     * Jobs declared with `k.jobs` go under `jobs`, alongside `routes` rather than
     * inside it, and carry their own identity.
     */
    contract<
        const R extends Routes<TagNamesOf<Spec>, IdentityNamesOf<Spec>>,
        const J extends Jobs = Record<string, never>,
        const T extends Tools = Record<string, never>,
        const P extends ContractPlugins = Record<string, never>,
    >(definition: {
        routes: R;
        jobs?: J;
        tools?: T;
        plugins?: ContractPluginsArg<R, P, T>;
    }): Contract<
        RoutesWithHandlerContext<
            R,
            Spec['identities'],
            Spec['requestContext'],
            PluginArgs<P> & JobsArg<J> & ToolsArg<T>,
            GuardOutput<Spec['guardSchema']>,
            GuardBody<Spec['guardSchema']>
        >,
        Spec['tags'],
        Spec['codes'],
        Spec['identities'],
        Spec['requestContext'],
        P,
        J,
        T,
        Spec['guardSchema']
    >;
    /**
     * Emit a validation issue with a machine-readable `code`, checked against the
     * codes declared under `validation.issueCodes`.
     *
     * @example
     * const phone = z.string().superRefine((value, ctx) => {
     *     if (isValidPhoneNumber(value)) return;
     *     k.issue(ctx, {
     *         code: 'invalid_phone_number',
     *         message: 'Invalid phone number',
     *         input: value,
     *     });
     * });
     */
    issue<Input>(ctx: z.core.$RefinementCtx<Input>, issue: RegisteredIssue<Spec['codes'], Input>): void;
}

/**
 * The spec a {@link Kizuna} instance's type parameters assemble into.
 */
type SpecOf<
    Tags extends Record<string, TagOptions>,
    Codes extends string,
    Identities extends Record<string, SecurityScheme>,
    RequestContext extends Record<string, RequestContextSchema>,
    GuardSchema extends z.ZodType | undefined,
> = {
    tags: Tags;
    codes: Codes;
    identities: Identities;
    requestContext: RequestContext;
    guardSchema: GuardSchema;
};

/**
 * The tags, identities, request contexts and custom validation issue codes one
 * API surface is bound to. Routes, access, jobs and plugins go on `k.contract`.
 */
export interface KizunaOptions<
    Tags extends Record<string, TagOptions> = Record<string, never>,
    Codes extends string = never,
    Identities extends Record<string, SecurityScheme> = Record<string, never>,
    RequestContext extends Record<string, RequestContextSchema> = Record<string, never>,
    GuardSchema extends z.ZodType | undefined = undefined,
> {
    identities?: Identities;
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
    tags?: TagSet<Tags>;
    validation?: {
        issueCodes?: readonly Codes[];
    };
    /**
     * Settings shared by every job. The jobs themselves are declared with `k.jobs`.
     */
    jobs?: JobsConfig;
}

const createSurface = <
    Tags extends Record<string, TagOptions>,
    Codes extends string,
    Identities extends Record<string, SecurityScheme>,
    RequestContext extends Record<string, RequestContextSchema>,
    GuardSchema extends z.ZodType | undefined,
>(
    config?: KizunaOptions<Tags, Codes, Identities, RequestContext, GuardSchema>
): K<SpecOf<Tags, Codes, Identities, RequestContext, GuardSchema>> => {
    type Spec = SpecOf<Tags, Codes, Identities, RequestContext, GuardSchema>;
    if (config?.guardSchema) assertFillableGuardSchema(config.guardSchema);

    const tagSet: TagSet<Tags> = config?.tags ?? { __brand: 'TagSet', tags: {} as Tags };

    const routes = ((tagOrDefs: string | Routes, defs?: Routes) => {
        if (defs === undefined) {
            return tagRoutes(tagOrDefs as Routes);
        }
        return tagRoutes(tagSet, tagOrDefs as Extract<keyof Tags, string>, defs as Routes<Extract<keyof Tags, string>>);
    }) as K<Spec>['routes'];

    const jobs = ((identityOrDefinitions: string | AuthoredJobs, definitions?: AuthoredJobs) =>
        definitions === undefined
            ? buildJobs(undefined, identityOrDefinitions as AuthoredJobs)
            : buildJobs(identityOrDefinitions as string, definitions)) as K<Spec>['jobs'];

    const tools = ((identityOrDefinitions: string | AuthoredTools, definitions?: AuthoredTools) =>
        definitions === undefined
            ? buildTools(undefined, identityOrDefinitions as AuthoredTools)
            : buildTools(identityOrDefinitions as string, definitions)) as K<Spec>['tools'];

    const contract = (definition: {
        routes: Routes;
        jobs?: Jobs;
        tools?: Tools;
        plugins?: ContractPluginsArg<Routes, ContractPlugins>;
    }) => {
        const { routes: contractRoutes, jobs: contractJobs, tools: contractTools } = definition;
        const plugins =
            typeof definition.plugins === 'function'
                ? definition.plugins({
                      routes: contractRoutes,
                      tools: contractTools ?? {},
                  })
                : definition.plugins;
        assertNoPathCollisions([
            ...routeClaims(contractRoutes),
            ...routeClaims(pluginRouteTree(plugins), 'Plugin route'),
            ...jobClaims(contractJobs, config?.jobs),
        ]);
        assertValidDeprecationDates(contractRoutes);
        assertValidDeprecationDates(pluginRouteTree(plugins));
        const declaresIdentities = Object.keys(config?.identities ?? {}).length > 0;
        for (const { route, routeKey } of flattenRoutes(contractRoutes)) {
            if (route.auth === undefined) {
                if (declaresIdentities) {
                    throw new Error(
                        `Route '${routeKey}' declares no \`auth\`. Name the identity it requires, or \`false\` for a public route.`
                    );
                }
                route.security = [];
                continue;
            }
            resolveRouteAuth(route, route.auth, config?.identities, routeKey);
        }
        // After every route's `auth` resolves, so both of these can read `security`.
        injectGuardResponses(contractRoutes, config?.identities, config?.guardSchema);
        assertValidCache(contractRoutes);
        assertValidCache(pluginRouteTree(plugins));
        return assembleContract({
            routes: contractRoutes as Routes<Extract<keyof Tags, string>, Extract<keyof Identities, string>>,
            jobs: contractJobs,
            tools: contractTools,
            tags: config?.tags,
            securitySchemes: config?.identities,
            guardSchema: config?.guardSchema,
            requestContext: config?.requestContext,
            validation: config?.validation,
            plugins,
            jobsConfig: config?.jobs,
        });
    };

    const k: K<Spec> = {
        route: createRoute as K<Spec>['route'],
        routes,
        jobs,
        tools,
        contract: contract as K<Spec>['contract'],
        issue: addCodedIssue,
    };

    return k;
};

/**
 * Declare one API surface: its tags, identities, request contexts and custom
 * validation issue codes. Keep the instance and use `k.route` to define a route
 * with its handler, `k.routes` to group them, and `k.contract` to assemble
 * them.
 *
 * The authoring helpers that need no instance stay static: `Kizuna.tags`,
 * `Kizuna.identity`, `Kizuna.roles`, `Kizuna.permissions`,
 * `Kizuna.requestContext` and `Kizuna.model`.
 *
 * @example
 * export const k = new Kizuna({
 *     identities: {
 *         user,
 *     },
 *     tags,
 *     validation: {
 *         issueCodes: ['invalid_phone_number'],
 *     },
 * });
 */
export class Kizuna<
    const Tags extends Record<string, TagOptions> = Record<string, never>,
    const Codes extends string = never,
    const Identities extends Record<string, SecurityScheme> = Record<string, never>,
    const RequestContext extends Record<string, RequestContextSchema> = Record<string, never>,
    GuardSchema extends z.ZodType | undefined = undefined,
> implements K<SpecOf<Tags, Codes, Identities, RequestContext, GuardSchema>> {
    static readonly tags = createTags;
    static readonly identity = createIdentity;
    static readonly permissions = createPermissions;
    /**
     * Declare the roles callers hold, as names or from a permission catalog.
     */
    static readonly roles = createRoles;
    static readonly requestContext = createRequestContext;
    static readonly model = createModel;

    declare readonly route: K<SpecOf<Tags, Codes, Identities, RequestContext, GuardSchema>>['route'];
    declare readonly routes: K<SpecOf<Tags, Codes, Identities, RequestContext, GuardSchema>>['routes'];
    declare readonly jobs: K<SpecOf<Tags, Codes, Identities, RequestContext, GuardSchema>>['jobs'];
    declare readonly tools: K<SpecOf<Tags, Codes, Identities, RequestContext, GuardSchema>>['tools'];
    declare readonly contract: K<SpecOf<Tags, Codes, Identities, RequestContext, GuardSchema>>['contract'];
    declare readonly issue: K<SpecOf<Tags, Codes, Identities, RequestContext, GuardSchema>>['issue'];

    constructor(config?: KizunaOptions<Tags, Codes, Identities, RequestContext, GuardSchema>) {
        Object.assign(this, createSurface<Tags, Codes, Identities, RequestContext, GuardSchema>(config));
    }
}
