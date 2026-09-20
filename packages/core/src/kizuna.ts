import type { z } from 'zod';
import { tagRoutes } from './routes.js';
import { addCodedIssue, type RegisteredIssue } from './coded-issue.js';
import { buildJobs, type AuthoredJobs, type AuthoredJobDefinition, type CompiledJobs } from './jobs.js';
import { createTags, type TagOptions } from './tags.js';
import type { RolesOf } from './identity.js';
import { createPermissions, createRoles, type CatalogOf, type PermissionSet, type RoleNamesOf } from './permissions.js';
import { createRequestContext, type RequestContextConfig } from './request-context.js';
import { createRequestContextBuilder, type RequestContextBuilder } from './request-context-builder.js';
import { identityFactories, type IdentityFactories } from './identity-builder.js';
import { createModel } from './model.js';
import { type GuardBody, type GuardOutput } from './problem-details.js';
import type { Routes, AuthoredRoutes, AuthoredRouteDefinition } from './types.js';
import type { SecurityScheme } from './security-scheme.js';
import type { RequestContextSchema } from './request-context.js';
import type { PathParamsCheck, RoutePathParamsCheck } from './path-params.js';
import type { AuthCheck, RouteAuthCheck } from './auth-check.js';
import { createRoute, type RouteBuilder } from './route.js';
import { createJob, type JobBuilder } from './job.js';
import type { AnyAdapter } from './adapter.js';
import type { AuthContextOf, RouteGuardBrandOf } from './handler-pipeline.js';
import type {
    ConfiguredAdapterContext,
    ConfiguredAdapterValue,
    ConfiguredCodes,
    ConfiguredGuardSchema,
    ConfiguredIdentities,
    ConfiguredJobs,
    ConfiguredPlugins,
    ConfiguredRequestContext,
    ConfiguredRequestContextSchemas,
    ConfiguredTags,
    KizunaConfigShape,
} from './configured.js';

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
 * What a {@link Kizuna} instance declares.
 */
export interface KizunaSpec {
    tags: Record<string, TagOptions>;
    codes: string;
    identities: Record<string, SecurityScheme>;
    requestContext: Record<string, RequestContextSchema>;
    guardSchema: z.ZodType | undefined;
    adapter: AnyAdapter | undefined;
    config: unknown;
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
    ): RouteBuilder<
        Definition & RouteGuardBrandOf<Definition, GuardOutput<Spec['guardSchema']>, GuardBody<Spec['guardSchema']>>,
        HandlerContextFor<Spec, Definition>
    >;
    /**
     * Define a group of routes. Pass a tag (one of the keys from `k.tags`)
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
     * Declare one job and the handler that runs it. `input` is typed from the
     * job's schema, and the return is checked against its `result`.
     *
     * @example
     * export const sendDigests = k
     *     .job({
     *         schedule: '0 5 * * *',
     *         result: z.object({
     *             sent: z.int(),
     *         }),
     *     })
     *     .handler(async () => ({
     *         status: 200,
     *         body: {
     *             sent: await sendPendingDigests(),
     *         },
     *     }));
     */
    job<const Definition extends AuthoredJobDefinition>(definition: Definition): JobBuilder<Definition>;
    /**
     * Declare scheduled jobs. Pass the identity every job requires, the one
     * credential your scheduler sends, then the jobs themselves.
     *
     * Jobs are their own concept, not routes. Each is reachable over HTTP so a
     * scheduler can trigger it, and runs through the same validation, guards, and
     * Problem Details as a route; but jobs never appear in `api.routes`, the
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
     * Declare an identity and the guard that authenticates it. The builder you
     * pick is the authentication mechanism, and `guard` receives the credential
     * it extracts.
     *
     * @example
     * export const user = k.identity
     *     .bearer({
     *         context: z.object({
     *             userId: z.string(),
     *         }),
     *     })
     *     .guard(async ({ bearer, deny }) => {
     *         const session = bearer ? await db.sessions.findByToken(bearer.token) : null;
     *         if (!session) {
     *             return deny({
     *                 status: 401,
     *                 body: {
     *                     detail: 'Unauthorized',
     *                 },
     *             });
     *         }
     *         return {
     *             userId: session.userId,
     *         };
     *     });
     */
    /**
     * Declare the OpenAPI tags routes are grouped under. `k.routes` takes one of
     * these names.
     */
    tags: typeof createTags;
    identity: IdentityFactories<
        ConfiguredAdapterContext<Spec['config']>,
        ConfiguredRequestContext<Spec['config']>,
        ConfiguredGuardSchema<Spec['config']>
    >;
    /**
     * Declare a request-scoped value and the resolver that fills it. It runs on
     * every route, public ones included, before the guards, and never denies.
     *
     * @example
     * export const analytics = k
     *     .requestContext({
     *         headers: z.object({
     *             'x-posthog-session-id': z.string().optional(),
     *         }),
     *         context: z.object({
     *             sessionId: z.string().nullable(),
     *         }),
     *     })
     *     .handler(({ headers }) => ({
     *         sessionId: headers['x-posthog-session-id'] ?? null,
     *     }));
     */
    requestContext<const ContextSchema extends z.ZodType, const HeadersSchema extends z.ZodType | undefined = undefined>(
        config: RequestContextConfig<ContextSchema, HeadersSchema>
    ): RequestContextBuilder<RequestContextSchema<ContextSchema, HeadersSchema>, ConfiguredAdapterContext<Spec['config']>>;
    requestContext<const ContextSchema extends z.ZodType>(
        context: ContextSchema
    ): RequestContextBuilder<RequestContextSchema<ContextSchema, undefined>, ConfiguredAdapterContext<Spec['config']>>;
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
 * The spec a config assembles into, which is what every authoring call on `k`
 * is checked against.
 */
type SpecOf<Config> = {
    tags: ConfiguredTags<Config>;
    codes: ConfiguredCodes<Config>;
    identities: ConfiguredIdentities<Config>;
    requestContext: ConfiguredRequestContextSchemas<Config>;
    guardSchema: ConfiguredGuardSchema<Config>;
    adapter: ConfiguredAdapterValue<Config>;
    config: Config;
};

/**
 * What one route's handler receives beyond its inputs: the identities its `auth`
 * names, the instance's request contexts, and whatever the adapter hands every
 * handler.
 */
export type HandlerContextFor<Spec extends KizunaSpec, Definition> = AuthContextOf<Definition, Spec['identities']> &
    ConfiguredRequestContext<Spec['config']> &
    ConfiguredJobs<Spec['config']> &
    ConfiguredPlugins<Spec['config']> &
    ConfiguredAdapterContext<Spec['config']>;

const createSurface = <Config>(): K<SpecOf<Config>> => {
    type Spec = SpecOf<Config>;

    const routes = ((tagOrDefs: string | Routes, defs?: Routes) =>
        defs === undefined ? tagRoutes(tagOrDefs as Routes) : tagRoutes(tagOrDefs as string, defs as Routes)) as K<Spec>['routes'];

    const jobs = ((identityOrDefinitions: string | AuthoredJobs, definitions?: AuthoredJobs) =>
        definitions === undefined
            ? buildJobs(undefined, identityOrDefinitions as AuthoredJobs)
            : buildJobs(identityOrDefinitions as string, definitions)) as K<Spec>['jobs'];

    return {
        tags: createTags,
        route: createRoute as K<Spec>['route'],
        routes,
        job: createJob as K<Spec>['job'],
        jobs,
        identity: identityFactories as unknown as K<Spec>['identity'],
        requestContext: ((config: never) =>
            createRequestContextBuilder(createRequestContext(config))) as unknown as K<Spec>['requestContext'],
        issue: addCodedIssue,
    };
};

/**
 * The authoring surface for one API. Its type parameter is the `Config` that
 * `kizuna generate` writes, which is what every name on `k` is checked against
 * and what types everything a handler receives.
 *
 * `k.route` declares a route with its handler, `k.routes` groups them, and
 * `k.job` and `k.jobs` do the same for jobs.
 * `defineConfig` assembles them.
 *
 * @example
 * import type { Config } from './kizuna.types';
 *
 * export const k = new Kizuna<Config>();
 */
export class Kizuna<Config extends KizunaConfigShape = Record<string, never>> implements K<SpecOf<Config>> {
    /**
     * Name a schema, so every generated client and the OpenAPI document reuse
     * the one type rather than inlining it.
     */
    static readonly model = createModel;
    /**
     * Declare the permissions callers hold, as a catalog of resources and the
     * verbs each allows.
     */
    static readonly permissions = createPermissions;
    /**
     * Declare the roles callers hold, as names or from a permission catalog.
     */
    static readonly roles = createRoles;

    declare readonly tags: K<SpecOf<Config>>['tags'];
    declare readonly route: K<SpecOf<Config>>['route'];
    declare readonly routes: K<SpecOf<Config>>['routes'];
    declare readonly job: K<SpecOf<Config>>['job'];
    declare readonly jobs: K<SpecOf<Config>>['jobs'];
    declare readonly identity: K<SpecOf<Config>>['identity'];
    declare readonly requestContext: K<SpecOf<Config>>['requestContext'];
    declare readonly issue: K<SpecOf<Config>>['issue'];

    constructor() {
        Object.assign(this, createSurface<Config>());
    }
}
