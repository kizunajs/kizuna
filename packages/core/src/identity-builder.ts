import type { z } from 'zod';
import type { GuardDeny, GuardDenial } from './adapter.js';
import type { GuardReturn, GuardSuccess } from './handler-pipeline.js';
import type {
    ApiKeyConfig,
    BasicConfig,
    BearerConfig,
    CustomConfig,
    Credential,
    CredentialOf,
    Identity,
    IdentityParamsOf,
    NoCredential,
    OAuth2Config,
    OpenIdConnectConfig,
} from './identity.js';
import type { Roles } from './permissions.js';
import { createIdentity } from './identity.js';
import type { ApiKeyCredential, BearerCredential, BasicCredential } from './identity.js';
import type { GuardBody } from './problem-details.js';
import { DECLARATION } from './types.js';

/**
 * An identity's guard, typed against the identity it authenticates. It receives
 * the credential the identity's method extracted along with the path params the
 * identity declares, and returns the identity's context or calls
 * `deny({ status, body })`.
 */
export type GuardFor<Id, HandlerContext, RequestContext, GuardSchema> = (
    args: HandlerContext &
        RequestContext &
        CredentialOf<Id> & {
            params: IdentityParamsOf<Id>;
            deny: GuardDeny<GuardBody<GuardSchema>>;
        }
) => [keyof GuardSuccess<Id>] extends [never]
    ? void | GuardDenial | Promise<void | GuardDenial>
    : GuardReturn<Id> | GuardDenial | Promise<GuardReturn<Id> | GuardDenial>;

// Registry-global: a dual ESM/CJS install would otherwise hold two different symbols.
export const GUARD: unique symbol = Symbol.for('ts-kizuna.guard') as symbol as typeof GUARD;

/**
 * An identity and the guard that authenticates it. The guard is stored without
 * its argument types, so a config that lists identities never depends on what a
 * guard reads back off that config.
 */
export type IdentityWithGuard<Id> = Id & {
    readonly [GUARD]: (args: never) => unknown;
};

/**
 * What one of the `k.identity` builders returns: the identity itself, and the
 * `guard` that authenticates it. An identity nothing serves, one a generator or
 * a client reads, needs no guard.
 */
export type IdentityBuilder<Id, HandlerContext, RequestContext, GuardSchema> = Id &
    IdentityGuardStep<Id, HandlerContext, RequestContext, GuardSchema>;

interface IdentityGuardStep<Id, HandlerContext, RequestContext, GuardSchema> {
    /**
     * What runs before the handler of every route whose `auth` names this
     * identity.
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
    guard(fn: GuardFor<Id, HandlerContext, RequestContext, GuardSchema>): IdentityWithGuard<Id>;
}

/**
 * The `k.identity` builders: one per authentication mechanism. Each takes what
 * the identity declares and hands back a builder whose `guard` authenticates
 * it.
 */
export interface IdentityFactories<HandlerContext, RequestContext, GuardSchema> {
    bearer<ContextSchema extends z.ZodType | undefined = undefined, RolesType extends Roles | undefined = undefined>(
        config: BearerConfig<ContextSchema, RolesType>
    ): IdentityBuilder<
        Identity<ContextSchema, RolesType, { bearer: BearerCredential | null }>,
        HandlerContext,
        RequestContext,
        GuardSchema
    >;
    apiKey<
        ContextSchema extends z.ZodType | undefined = undefined,
        RolesType extends Roles | undefined = undefined,
        const Name extends string = string,
        const In extends 'header' | 'query' | 'cookie' = 'header' | 'query' | 'cookie',
    >(
        config: ApiKeyConfig<ContextSchema, RolesType, Name, In>
    ): IdentityBuilder<
        Identity<ContextSchema, RolesType, { apiKey: ApiKeyCredential<In, Name> | null }>,
        HandlerContext,
        RequestContext,
        GuardSchema
    >;
    basic<ContextSchema extends z.ZodType | undefined = undefined, RolesType extends Roles | undefined = undefined>(
        config: BasicConfig<ContextSchema, RolesType>
    ): IdentityBuilder<Identity<ContextSchema, RolesType, { basic: BasicCredential | null }>, HandlerContext, RequestContext, GuardSchema>;
    oauth2<ContextSchema extends z.ZodType | undefined = undefined, RolesType extends Roles | undefined = undefined>(
        config: OAuth2Config<ContextSchema, RolesType>
    ): IdentityBuilder<
        Identity<ContextSchema, RolesType, { oauth2: BearerCredential | null }>,
        HandlerContext,
        RequestContext,
        GuardSchema
    >;
    openIdConnect<ContextSchema extends z.ZodType | undefined = undefined, RolesType extends Roles | undefined = undefined>(
        config: OpenIdConnectConfig<ContextSchema, RolesType>
    ): IdentityBuilder<
        Identity<ContextSchema, RolesType, { openIdConnect: BearerCredential | null }>,
        HandlerContext,
        RequestContext,
        GuardSchema
    >;
    /**
     * An identity whose credential no OpenAPI scheme can express, such as a
     * capability-URL token in a path segment. The guard reads the credential
     * itself (e.g. `params.token`); the route emits no scheme, only an
     * `x-kizuna-guarded` extension. Use `bearer` for a token or `apiKey` for a
     * header; reach for `custom` only when neither fits.
     */
    custom<
        ContextSchema extends z.ZodType | undefined = undefined,
        RolesType extends Roles | undefined = undefined,
        ParamsSchema extends z.ZodType | undefined = undefined,
    >(
        config: CustomConfig<ContextSchema, RolesType, ParamsSchema>
    ): IdentityBuilder<Identity<ContextSchema, RolesType, NoCredential, ParamsSchema>, HandlerContext, RequestContext, GuardSchema>;
}

const buildable = (identity: object) => ({
    ...identity,
    guard: (fn: unknown) => ({
        ...identity,
        [GUARD]: fn,
        [DECLARATION]: 'identity' as const,
    }),
});

export const identityFactories = {
    bearer: (config: never) => buildable(createIdentity.bearer(config)),
    apiKey: (config: never) => buildable(createIdentity.apiKey(config)),
    basic: (config: never) => buildable(createIdentity.basic(config)),
    oauth2: (config: never) => buildable(createIdentity.oauth2(config)),
    openIdConnect: (config: never) => buildable(createIdentity.openIdConnect(config)),
    custom: (config: never) => buildable(createIdentity.custom(config)),
} as unknown as IdentityFactories<unknown, unknown, unknown>;

export type { Credential };
