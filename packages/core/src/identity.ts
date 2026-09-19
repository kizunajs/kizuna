import type { z } from 'zod';
import type { SecurityScheme, OpenApiSecuritySchemeObject, OAuthFlows } from './security-scheme.js';
import type { Roles, RoleNamesOf, GrantNamesOf, CatalogOf } from './permissions.js';

/**
 * The token a `bearer`, `oauth2`, or `openIdConnect` method extracts from the
 * `Authorization` header.
 */
export interface BearerCredential {
    token: string;
}

/**
 * The username and password a `basic` method decodes from the
 * `Authorization: Basic <base64>` header.
 */
export interface BasicCredential {
    username: string;
    password: string;
}

/**
 * The value an `apiKey` method reads from the header, query parameter, or cookie
 * the identity named, with `in`/`name` echoing where it came from.
 *
 * @example
 * // for k.identity.apiKey({ name: 'x-workspace-token', in: 'header' }):
 * // { in: 'header'; name: 'x-workspace-token'; value: string }
 */
export interface ApiKeyCredential<In extends 'header' | 'query' | 'cookie' = 'header' | 'query' | 'cookie', Name extends string = string> {
    in: In;
    name: Name;
    value: string;
}

/**
 * The credential a guard receives, keyed by the identity's authentication method.
 * A guard destructures the one key its identity declares, `{ bearer }`,
 * `{ apiKey }`, `{ basic }`, `{ oauth2 }`, or `{ openIdConnect }`. The value is
 * `null` when the request carried no such credential.
 */
export type Credential =
    | { bearer: BearerCredential | null }
    | { oauth2: BearerCredential | null }
    | { openIdConnect: BearerCredential | null }
    | { basic: BasicCredential | null }
    | { apiKey: ApiKeyCredential | null };

/**
 * The empty credential a `custom` identity carries. Its guard receives no
 * credential key and reads the credential itself (e.g. `params.token`).
 */
export type NoCredential = Record<never, never>;

declare const CREDENTIAL: unique symbol;

/**
 * An authenticated caller, defined with the `k.identity` builders. Extends
 * {@link SecurityScheme} with what its callers hold and the credential its
 * authentication method extracts from the request.
 */
export interface Identity<
    ContextSchema extends z.ZodType | undefined = z.ZodType | undefined,
    RolesType extends Roles | undefined = Roles | undefined,
    CredentialType extends Credential | NoCredential = Credential,
    ParamsSchema extends z.ZodType | undefined = z.ZodType | undefined,
> extends SecurityScheme<ContextSchema> {
    /**
     * The path parameters this identity's guard reads. A route whose `auth`
     * names the identity has to carry them, and the guard receives them typed.
     */
    readonly params: ParamsSchema;
    /**
     * The roles this identity's callers hold. The guard returns `role`.
     */
    readonly roles: RolesType;
    /**
     * Phantom marker carrying the {@link Credential} the method extracts. Never
     * present at runtime.
     */
    readonly [CREDENTIAL]?: CredentialType;
}

/**
 * The {@link Credential} an identity's authentication method extracts and passes
 * to its guard, a single discriminated member, e.g. `{ apiKey: { in; name;
 * value } | null }` for an `apiKey` identity.
 */
export type CredentialOf<Id> = Id extends Identity<z.ZodType | undefined, Roles | undefined, infer Extracted> ? Extracted : Credential;

/**
 * The path params an identity's guard receives: what its `params` schema
 * declares, or the adapter's raw record when it declares none.
 */
export type IdentityParamsOf<Id> = Id extends { params: infer ParamsSchema }
    ? ParamsSchema extends z.ZodType
        ? z.output<ParamsSchema>
        : Record<string, string>
    : Record<string, string>;

/**
 * The {@link Roles} an identity declares, or `never` when it declares none.
 */
export type RolesOf<Id> =
    Id extends Identity<z.ZodType | undefined, infer RolesType> ? (RolesType extends Roles ? RolesType : never) : never;

/**
 * The role a guard returns and a handler reads: one declared name, or several.
 */
export type RoleOf<Id> = RoleNamesOf<RolesOf<Id>> | readonly RoleNamesOf<RolesOf<Id>>[];

/**
 * What a caller holds, as permission names, when the identity's roles come from a catalog.
 */
export type GrantsOf<Id> = readonly GrantNamesOf<RolesOf<Id>>[];

/**
 * What roles add to a guard's return: `role` when the identity declares them,
 * with optional `permissions` when they come from a catalog, the subset of the
 * role's this caller was given, `{}` otherwise.
 */
export type GuardHoldings<Id> = [RolesOf<Id>] extends [never]
    ? {}
    : [CatalogOf<RolesOf<Id>>] extends [never]
      ? { role: RoleOf<Id> }
      : { role: RoleOf<Id>; permissions?: GrantsOf<Id> };

/**
 * What roles add to a handler's `auth`: `role` when the identity declares them,
 * and `permissions`, what the caller holds, when they come from a catalog: the
 * role's, or the subset the guard returned.
 */
export type IdentityRole<Id> = [RolesOf<Id>] extends [never]
    ? {}
    : [CatalogOf<RolesOf<Id>>] extends [never]
      ? { role: RoleOf<Id> }
      : { role: RoleOf<Id>; permissions: GrantsOf<Id> };

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const assertHttpsUrl = (label: string, value: string): void => {
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`The ${label} "${value}" is not an absolute URL.`);
    }
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(parsed.hostname))) {
        throw new Error(`The ${label} "${value}" must be https. http is only allowed on localhost.`);
    }
    if (parsed.search !== '' || parsed.hash !== '') {
        throw new Error(`The ${label} "${value}" has a query or fragment.`);
    }
};

const make = <
    ContextSchema extends z.ZodType | undefined,
    RolesType extends Roles | undefined,
    CredentialType extends Credential | NoCredential = { bearer: BearerCredential | null },
    ParamsSchema extends z.ZodType | undefined = undefined,
>(
    openapi: OpenApiSecuritySchemeObject | undefined,
    context: ContextSchema,
    roles: RolesType,
    scheme: string | undefined,
    issuer?: string,
    resourceMetadata?: string,
    params?: ParamsSchema
): Identity<ContextSchema, RolesType, CredentialType, ParamsSchema> => ({
    __brand: 'SecurityScheme',
    openapi,
    context,
    roles,
    scheme,
    issuer,
    resourceMetadata,
    params: params as ParamsSchema,
});

export interface BearerConfig<ContextSchema extends z.ZodType | undefined, RolesType extends Roles | undefined> {
    context?: ContextSchema;
    roles?: RolesType;
    bearerFormat?: string;
    description?: string;
    scheme?: string;
}

export interface ApiKeyConfig<
    ContextSchema extends z.ZodType | undefined,
    RolesType extends Roles | undefined,
    Name extends string,
    In extends 'header' | 'query' | 'cookie',
> {
    name: Name;
    in: In;
    context?: ContextSchema;
    roles?: RolesType;
    description?: string;
    scheme?: string;
}

export interface BasicConfig<ContextSchema extends z.ZodType | undefined, RolesType extends Roles | undefined> {
    context?: ContextSchema;
    roles?: RolesType;
    description?: string;
    scheme?: string;
}

export interface OAuth2Config<ContextSchema extends z.ZodType | undefined, RolesType extends Roles | undefined> {
    flows: OAuthFlows;
    /**
     * Issuer identifier of the authorization server (RFC 8414), for consumers
     * that advertise it, such as RFC 9728 metadata. The flow URLs cannot stand
     * in for it: an issuer may carry a path the endpoint URLs do not reveal.
     */
    issuer?: string;
    /**
     * URL of this API's RFC 9728 metadata document, sent as `resource_metadata`
     * in every `Bearer` challenge so a client can find the authorization server.
     */
    resourceMetadata?: string;
    context?: ContextSchema;
    roles?: RolesType;
    description?: string;
    scheme?: string;
}

export interface OpenIdConnectConfig<ContextSchema extends z.ZodType | undefined, RolesType extends Roles | undefined> {
    openIdConnectUrl: string;
    /**
     * URL of this API's RFC 9728 metadata document, sent as `resource_metadata`
     * in every `Bearer` challenge so a client can find the authorization server.
     */
    resourceMetadata?: string;
    context?: ContextSchema;
    roles?: RolesType;
    description?: string;
    scheme?: string;
}

export interface CustomConfig<
    ContextSchema extends z.ZodType | undefined,
    RolesType extends Roles | undefined,
    ParamsSchema extends z.ZodType | undefined = undefined,
> {
    context?: ContextSchema;
    roles?: RolesType;
    description?: string;
    scheme?: string;
    /**
     * The path parameters this identity's guard reads, for a credential that
     * travels in the path. A route whose `auth` names the identity has to carry
     * them.
     *
     * @example
     * params: z.object({
     *     token: z.string(),
     * }),
     */
    params?: ParamsSchema;
}

/**
 * Builders that define an identity by its authentication mechanism: `bearer`,
 * `apiKey`, `basic`, `oauth2`, `openIdConnect`, and `custom` (a credential no
 * OpenAPI security scheme can express, such as a capability-URL path token).
 * Each takes, optionally, the `context` a passing guard returns and what its
 * callers hold, `roles` declared with `Kizuna.roles`. Omit `context` for an authentication-only
 * identity, a pure gate whose guard returns nothing on success and contributes
 * no handler args.
 *
 * @example
 * const member = k.identity.apiKey({
 *     name: 'x-workspace-token',
 *     in: 'header',
 *     context: z.object({
 *         workspaceUserId: z.string(),
 *     }),
 *     roles,
 * });
 *
 * @example
 * // Authentication-only, no context, no handler args:
 * const apiConsumer = k.identity.apiKey({
 *     name: 'x-api-key',
 *     in: 'header',
 * });
 */
export const createIdentity = {
    bearer: <ContextSchema extends z.ZodType | undefined = undefined, RolesType extends Roles | undefined = undefined>(
        config: BearerConfig<ContextSchema, RolesType>
    ): Identity<ContextSchema, RolesType, { bearer: BearerCredential | null }> =>
        make<ContextSchema, RolesType, { bearer: BearerCredential | null }>(
            { type: 'http', scheme: 'bearer', bearerFormat: config.bearerFormat, description: config.description },
            config.context as ContextSchema,
            config.roles as RolesType,
            config.scheme
        ),
    apiKey: <
        ContextSchema extends z.ZodType | undefined = undefined,
        RolesType extends Roles | undefined = undefined,
        const Name extends string = string,
        const In extends 'header' | 'query' | 'cookie' = 'header' | 'query' | 'cookie',
    >(
        config: ApiKeyConfig<ContextSchema, RolesType, Name, In>
    ): Identity<ContextSchema, RolesType, { apiKey: ApiKeyCredential<In, Name> | null }> =>
        make<ContextSchema, RolesType, { apiKey: ApiKeyCredential<In, Name> | null }>(
            { type: 'apiKey', name: config.name, in: config.in, description: config.description },
            config.context as ContextSchema,
            config.roles as RolesType,
            config.scheme
        ),
    basic: <ContextSchema extends z.ZodType | undefined = undefined, RolesType extends Roles | undefined = undefined>(
        config: BasicConfig<ContextSchema, RolesType>
    ): Identity<ContextSchema, RolesType, { basic: BasicCredential | null }> =>
        make<ContextSchema, RolesType, { basic: BasicCredential | null }>(
            { type: 'http', scheme: 'basic', description: config.description },
            config.context as ContextSchema,
            config.roles as RolesType,
            config.scheme
        ),
    oauth2: <ContextSchema extends z.ZodType | undefined = undefined, RolesType extends Roles | undefined = undefined>(
        config: OAuth2Config<ContextSchema, RolesType>
    ): Identity<ContextSchema, RolesType, { oauth2: BearerCredential | null }> => {
        if (config.issuer !== undefined) assertHttpsUrl('issuer', config.issuer);
        if (config.resourceMetadata !== undefined) assertHttpsUrl('resourceMetadata', config.resourceMetadata);
        return make<ContextSchema, RolesType, { oauth2: BearerCredential | null }>(
            { type: 'oauth2', flows: config.flows, description: config.description },
            config.context as ContextSchema,
            config.roles as RolesType,
            config.scheme,
            config.issuer,
            config.resourceMetadata
        );
    },
    openIdConnect: <ContextSchema extends z.ZodType | undefined = undefined, RolesType extends Roles | undefined = undefined>(
        config: OpenIdConnectConfig<ContextSchema, RolesType>
    ): Identity<ContextSchema, RolesType, { openIdConnect: BearerCredential | null }> => {
        if (config.resourceMetadata !== undefined) assertHttpsUrl('resourceMetadata', config.resourceMetadata);
        return make<ContextSchema, RolesType, { openIdConnect: BearerCredential | null }>(
            { type: 'openIdConnect', openIdConnectUrl: config.openIdConnectUrl, description: config.description },
            config.context as ContextSchema,
            config.roles as RolesType,
            config.scheme,
            undefined,
            config.resourceMetadata
        );
    },
    /**
     * An identity whose credential no OpenAPI scheme can express, such as a
     * capability-URL token in a path segment. The guard reads the credential
     * itself (e.g. `params.token`); the route emits no scheme, only an
     * `x-kizuna-guarded` extension. Use `bearer` for a token or `apiKey` for a
     * header; reach for `custom` only when neither fits.
     *
     * @example
     * const inviteToken = k.identity.custom({
     *     context: z.object({
     *         inviteId: z.string(),
     *     }),
     * });
     */
    custom: <
        ContextSchema extends z.ZodType | undefined = undefined,
        RolesType extends Roles | undefined = undefined,
        ParamsSchema extends z.ZodType | undefined = undefined,
    >(
        config: CustomConfig<ContextSchema, RolesType, ParamsSchema>
    ): Identity<ContextSchema, RolesType, NoCredential, ParamsSchema> =>
        make<ContextSchema, RolesType, NoCredential, ParamsSchema>(
            undefined,
            config.context as ContextSchema,
            config.roles as RolesType,
            config.scheme,
            undefined,
            undefined,
            config.params as ParamsSchema
        ),
};
