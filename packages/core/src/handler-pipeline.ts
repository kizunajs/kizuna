import type { z } from 'zod';
import {
    ROUTES_TAG,
    HANDLER_CONTEXT_BRAND,
    type HandlerContextBrand,
    type AutoResponsesBrand,
    AUTO_RESPONSES_BRAND,
    AUTO_GUARD_WRITTEN_BRAND,
    type GuardStatus,
    type ResponseHeaders,
    type RouteDefinition,
    type Routes,
    type Method,
    type StreamResponseDefinition,
} from './types.js';
import type { StreamBodyOf } from './stream.js';
import type { ExtractPathParams } from './path-params.js';
import type { ContextOf } from './security-scheme.js';
import type { GuardHoldings, IdentityRole } from './identity.js';
import { applyCoercion, coercionPlanFor } from './coercion.js';
import type { ProblemDetails, StripProblemEnvelope } from './problem-details.js';

/**
 * True when a literal status key is in the 4xx/5xx range. Widened `number` keys (no
 * `const` inference) resolve to `false`, so enforcement only kicks in when the concrete
 * status is known, exactly where the wire output matters.
 */
type IsErrorStatus<Status> = `${Status & number}` extends `4${string}` | `5${string}` ? true : false;

/**
 * Error responses (4xx/5xx) must be RFC 9457 Problem Details, a schema assignable to the
 * envelope. Anything else resolves to `never`, surfacing as a compile error at the handler
 * return / `throwError()` site. Success responses pass through unchanged.
 */
type ApplyErrorEnvelope<Input, Status> =
    IsErrorStatus<Status> extends true ? (Input extends ProblemDetails ? StripProblemEnvelope<Input> : never) : Input;

type HandlerBody<S, Status> = S extends z.ZodType
    ? ApplyErrorEnvelope<z.input<S>, Status>
    : S extends StreamResponseDefinition
      ? IsErrorStatus<Status> extends true
          ? never
          : StreamBodyOf<S>
      : S extends { body: z.ZodType }
        ? ApplyErrorEnvelope<z.input<S['body']>, Status>
        : never;

type ResponseReturn<R extends Pick<RouteDefinition, 'responses'>, Status extends keyof R['responses']> = {
    status: Status extends number ? Status : never;
    body: HandlerBody<R['responses'][Status], Status>;
    headers?: ResponseHeaders;
};

/**
 * Constrained to `responses` alone so a job, which has no method or path, reuses it.
 */
export type HandlerReturn<R extends Pick<RouteDefinition, 'responses'>> = {
    [Status in keyof R['responses']]: ResponseReturn<R, Status>;
}[keyof R['responses']];

type StreamStatuses<R extends Pick<RouteDefinition, 'responses'>> = {
    [Status in keyof R['responses']]: R['responses'][Status] extends StreamResponseDefinition ? Status : never;
}[keyof R['responses']];

/**
 * The responses `throwError` takes: every declared status except the streamed
 * ones. A stream is a body to produce, and bailing out is what `throwError` is for.
 */
export type ThrowableReturn<R extends Pick<RouteDefinition, 'responses'>> = {
    [Status in Exclude<keyof R['responses'], StreamStatuses<R>>]: ResponseReturn<R, Status>;
}[Exclude<keyof R['responses'], StreamStatuses<R>>];

export type HandlerArgs<R extends RouteDefinition> = {
    params: R extends { pathParams: z.ZodType } ? z.output<R['pathParams']> : ExtractPathParams<R['path']>;
    query: R extends { query: z.ZodType } ? z.output<R['query']> : undefined;
    body: R extends { body: z.ZodType } ? z.output<R['body']> : undefined;
    headers: R extends { headers: z.ZodType } ? z.output<R['headers']> : Record<string, string | string[] | undefined>;
    /**
     * Throws a typed error response. Takes the same `{ status, body }` shape as a handler return.
     *
     * This function throws internally and never returns.
     */
    throwError: (response: ThrowableReturn<R> | GuardAnswer<R>) => never;
};

export type RouteHandler<R extends RouteDefinition, HandlerContext = unknown> = (
    args: HandlerArgs<R> & HandlerContext & BrandedHandlerContext<R>
) => Promise<HandlerReturn<R> | GuardAnswer<R>> | HandlerReturn<R> | GuardAnswer<R>;

/**
 * The `403` a guarded route already declares, which its handler may answer
 * itself.
 */
export type GuardAnswer<R> = typeof AUTO_RESPONSES_BRAND extends keyof R
    ? 403 extends NonNullable<R[typeof AUTO_RESPONSES_BRAND]>
        ? {
              status: 403;
              body: typeof AUTO_GUARD_WRITTEN_BRAND extends keyof R ? NonNullable<R[typeof AUTO_GUARD_WRITTEN_BRAND]> : { detail: string };
              headers?: ResponseHeaders;
          }
        : never
    : never;

export type Router<T extends Routes, HandlerContext = unknown> = {
    [Key in keyof T as Key extends symbol ? never : Key]: T[Key] extends RouteDefinition
        ? RouteHandler<T[Key], HandlerContext>
        : T[Key] extends Routes
          ? Router<T[Key], HandlerContext>
          : never;
};

/**
 * What a handler reads for an identity: its `context` and, when the identity
 * declares roles, the caller's `role`, with `permissions` for roles built from
 * a catalog, flattened into one type.
 * Read in a handler under the identity's name. Flattened (rather than left as
 * an intersection) so it works as a contextual type, letting a guard return a
 * literal `role: 'owner'` without an annotation.
 */
export type GuardSuccess<S> = {
    [Field in keyof (ContextOf<S> & IdentityRole<S>)]: (ContextOf<S> & IdentityRole<S>)[Field];
};

/**
 * What a guard returns to allow a request: the identity's context and its
 * `role`. `permissions` is optional beside the role, since kizuna fills it in
 * from the role before the handler runs.
 */
export type GuardReturn<S> = {
    [Field in keyof (ContextOf<S> & GuardHoldings<S>)]: (ContextOf<S> & GuardHoldings<S>)[Field];
};

/**
 * The identity names a route's `auth` requires: a name, several, the `identity`
 * of a rule, or none for `false`.
 */
type AuthIdentityNames<Value> = Value extends false
    ? never
    : Value extends string
      ? Value
      : Value extends readonly (infer Name extends string)[]
        ? Name
        : Value extends { identity: infer Identity }
          ? Identity extends string
              ? Identity
              : Identity extends readonly (infer Name extends string)[]
                ? Name
                : never
          : never;

/**
 * What a route requires of its caller, `false` for one that declares nothing.
 */
type AuthOf<R> = R extends { auth: infer Value } ? Value : false;

/**
 * The scheme-keyed security context a route's handler receives, derived from
 * its `auth`: `false` (public) contributes nothing; each identity it names
 * yields that identity's context, the caller's role, and for roles built from a
 * catalog, the caller's permissions.
 *
 * @example
 * type Context = ContextFromAuth<{ identity: 'member' }, { member: typeof member }>;
 * // { member: { workspaceUserId: string; role: 'owner' | 'admin' | readonly ('owner' | 'admin')[]; permissions: readonly ('workspace:read' | 'workspace:delete')[] } }
 */
export type ContextFromAuth<Value, Identities> = {
    [Name in AuthIdentityNames<Value> & keyof Identities as [keyof GuardSuccess<Identities[Name]>] extends [never]
        ? never
        : Name]: GuardSuccess<Identities[Name]>;
};

/**
 * The `auth` argument one route's handler receives, from the route's own rule.
 */
export type AuthContextOf<Route, Identities> = AuthArg<AuthOf<Route>, Identities>;

/**
 * The `auth` argument a secured route's handler receives.
 */
type AuthArg<Value, Identities> =
    ContextFromAuth<Value, Identities> extends infer Ctx ? ([keyof Ctx] extends [never] ? {} : { auth: Ctx }) : never;

/**
 * The `requestContext` argument a handler receives.
 */
export type RequestContextValues<RequestContext> = string extends keyof RequestContext
    ? {}
    : [keyof RequestContext] extends [never]
      ? {}
      : {
            requestContext: {
                [Name in keyof RequestContext]: RequestContext[Name] extends { context: infer Schema extends z.ZodType }
                    ? z.output<Schema>
                    : never;
            };
        };

/**
 * The path param names of every route the identity `Name` secures.
 */
export type GuardedParamNames<R extends Routes, Name extends string> = {
    [Key in keyof R & string]: R[Key] extends RouteDefinition
        ? Name extends AuthIdentityNames<AuthOf<R[Key]>>
            ? keyof ExtractPathParams<R[Key]['path']> & string
            : never
        : R[Key] extends Routes
          ? GuardedParamNames<R[Key], Name>
          : never;
}[keyof R & string];

/**
 * The `params` a guard for identity `Name` receives: the param names of the
 * routes it secures, each optional since the guard runs across all of them.
 * Falls back to `Record<string, string>` when no params are derivable.
 */
export type GuardParams<R extends Routes, Name extends string> = [GuardedParamNames<R, Name>] extends [never]
    ? Record<string, string>
    : { [Param in GuardedParamNames<R, Name>]?: string };

/**
 * The handler tree for an api or route group: every route typed with its
 * inputs, the adapter's handler context, and the scheme-keyed security context
 * its `auth` resolves to. The identities a route requires appear in the handler
 * args under `auth`, keyed by each identity's name, each carrying its context
 * and the caller's role.
 */
export type HandlersFromRoutes<R extends Routes, HandlerContext, Identities> = {
    [Key in keyof R as Key extends symbol ? never : Key]: R[Key] extends RouteDefinition
        ? RouteHandlerFromContext<R[Key], HandlerContext, AuthArg<AuthOf<R[Key]>, Identities>>
        : R[Key] extends Routes
          ? HandlersFromRoutes<R[Key], HandlerContext, Identities>
          : never;
};

type RouteHandlerFromContext<R extends RouteDefinition, HandlerContext, SecurityContext> = (
    args: HandlerArgs<R> & HandlerContext & SecurityContext
) => Promise<HandlerReturn<R> | GuardAnswer<R>> | HandlerReturn<R> | GuardAnswer<R>;

/**
 * A route's brand, skipped when the resolved context is empty.
 */
type RouteContextBrand<Context> = [keyof Context] extends [never] ? unknown : HandlerContextBrand<Context>;

type RouteGuardBrand<Value, Body, Written> = [AuthIdentityNames<Value>] extends [never]
    ? unknown
    : AutoResponsesBrand<GuardStatus, Body, Written>;

/**
 * The `401` and `403` a route's own `auth` gives it, so a handler written at the
 * route may answer the `403` itself.
 */
export type RouteGuardBrandOf<Route, Body, Written> = RouteGuardBrand<AuthOf<Route>, Body, Written>;

type HandlerContextOverlay<R extends Routes, Identities, Context, GuardBody_, GuardWritten_> = {
    [Key in keyof R]: R[Key] extends RouteDefinition
        ? RouteContextBrand<AuthArg<AuthOf<R[Key]>, Identities> & Context> & RouteGuardBrand<AuthOf<R[Key]>, GuardBody_, GuardWritten_>
        : R[Key] extends Routes
          ? HandlerContextOverlay<R[Key], Identities, Context, GuardBody_, GuardWritten_>
          : unknown;
};

/**
 * An api's routes, each branded with what the api adds to a handler's
 * args: `auth`, `requestContext`, plugins, and jobs. Read back by
 * {@link RouteHandler}.
 */
export type RoutesWithHandlerContext<
    R extends Routes,
    Identities,
    RequestContext,
    ContractContext = unknown,
    GuardBody_ = ProblemDetails,
    GuardWritten_ = { detail: string },
> = R & HandlerContextOverlay<R, Identities, RequestContextValues<RequestContext> & ContractContext, GuardBody_, GuardWritten_>;

export type BrandedHandlerContext<R> = typeof HANDLER_CONTEXT_BRAND extends keyof R ? NonNullable<R[typeof HANDLER_CONTEXT_BRAND]> : {};

export const isRouteDefinition = (value: unknown): value is RouteDefinition => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.method === 'string' && typeof candidate.path === 'string' && !!candidate.responses;
};

export interface FlattenedRoute {
    routeKey: string;
    route: RouteDefinition;
    routeTags: string[];
}

export const flattenRoutes = (routes: Routes, prefix?: string, inheritedTags: string[] = []): FlattenedRoute[] => {
    const ownTag = (routes as Record<typeof ROUTES_TAG, string | undefined>)[ROUTES_TAG];
    const activeTags = ownTag ? [...inheritedTags, ownTag] : inheritedTags;
    const collected: FlattenedRoute[] = [];
    for (const [key, value] of Object.entries(routes)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (isRouteDefinition(value)) {
            collected.push({
                routeKey: fullKey,
                route: value,
                routeTags: activeTags,
            });
        } else if (value && typeof value === 'object') {
            collected.push(...flattenRoutes(value as Routes, fullKey, activeTags));
        }
    }
    return collected;
};

export interface RawInputs {
    params: unknown;
    query: unknown;
    body: unknown;
    headers: unknown;
}

export type ValidationStage = 'params' | 'query' | 'headers' | 'body';

export interface ValidationFailure {
    stage: ValidationStage;
    issues: z.core.$ZodIssue[];
}

const STAGE_MESSAGES: Record<ValidationStage, string> = {
    params: 'Invalid path parameters',
    query: 'Invalid query parameters',
    headers: 'Invalid headers',
    body: 'Invalid request body',
};

export const formatValidationError = (failure: ValidationFailure): { detail: string; issues: z.core.$ZodIssue[] } => ({
    detail: STAGE_MESSAGES[failure.stage],
    issues: failure.issues,
});

export const validateRequest = (
    route: RouteDefinition,
    raw: RawInputs
): { ok: true; parsed: RawInputs } | { ok: false; error: ValidationFailure } => {
    const order: ReadonlyArray<{ stage: ValidationStage; schema: z.ZodType | undefined; input: unknown; coerced: boolean }> = [
        {
            stage: 'params',
            schema: route.pathParams,
            input: raw.params,
            coerced: true,
        },
        {
            stage: 'query',
            schema: route.query,
            input: raw.query,
            coerced: true,
        },
        {
            stage: 'headers',
            schema: route.headers,
            input: raw.headers,
            coerced: true,
        },
        {
            stage: 'body',
            schema: route.body,
            input: raw.body,
            coerced: false,
        },
    ];

    const parsed: RawInputs = {
        params: raw.params,
        query: raw.query,
        headers: raw.headers,
        body: raw.body,
    };

    for (const step of order) {
        if (!step.schema) continue;
        const input = step.coerced ? applyCoercion(step.input, coercionPlanFor(step.schema)) : step.input;
        const result = step.schema.safeParse(input);
        if (!result.success) {
            return {
                ok: false,
                error: {
                    stage: step.stage,
                    issues: result.error.issues,
                },
            };
        }
        parsed[step.stage] = result.data;
    }

    return {
        ok: true,
        parsed,
    };
};

export const allowedMethodsForPath = (routes: Routes, path: string): Method[] => {
    const methods = new Set<Method>();
    for (const { route } of flattenRoutes(routes)) {
        if (route.path === path) methods.add(route.method);
    }
    // A GET path serves HEAD too (RFC 9110 §9.3.2).
    if (methods.has('GET')) methods.add('HEAD');
    return Array.from(methods);
};
