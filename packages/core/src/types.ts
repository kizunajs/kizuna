import type { z } from 'zod';
import type { KnownStatus } from './status-titles.js';
import type { ProblemDetails } from './problem-details.js';
import type { Tools } from './tools.js';

export const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;

export type Method = (typeof METHODS)[number];

/**
 * The `Content-Type` of a response body. The listed values are suggestions;
 * any media type string is accepted.
 */
export type ResponseContentType =
    | 'application/json'
    | 'application/problem+json'
    | 'application/octet-stream'
    | 'application/pdf'
    | 'application/xml'
    | 'application/zip'
    | 'text/plain'
    | 'text/event-stream'
    | 'text/html'
    | 'text/csv'
    | 'text/markdown'
    | 'text/calendar'
    | 'image/png'
    | 'image/jpeg'
    | 'image/svg+xml'
    | 'image/webp'
    | (string & {});

/**
 * What a `stream` response carries per message: one schema when the messages
 * are all alike, or a record of server-sent event name to schema for named
 * events.
 */
export type StreamDefinition = z.ZodType | Record<string, z.ZodType>;

/**
 * A response sent piece by piece. Framed as server-sent events unless
 * `contentType` names a `text/*` type (chunks of `z.string()`) or a binary one
 * (chunks of `BinarySchema`).
 */
export interface StreamResponseDefinition {
    /**
     * The schema of one message, or a record of event name to schema.
     */
    stream: StreamDefinition;
    /**
     * Tools declared with `k.tools`. Their `tool_call`, `tool_result` and
     * `tool_error` events join the ones `stream` names, each discriminated on
     * the tool's dotted key.
     */
    tools?: Tools;
    /**
     * Schema for the response headers. Each property becomes one
     * response header.
     */
    headers?: z.ZodType;
    /**
     * The `Content-Type` of this response.
     *
     * @default 'text/event-stream'
     */
    contentType?: ResponseContentType;
    body?: never;
}

/**
 * How one response may be cached, sent as its `Cache-Control` header.
 *
 * `'no-store'` forbids every cache from keeping the response at all, and rules
 * out every other directive.
 */
export type CachePolicy =
    | 'no-store'
    | {
          /**
           * Which caches may store the response. `private` is the caller's own
           * browser; `public` is any cache in between, including a CDN or a
           * corporate proxy. A response on a route behind `security` wants
           * `private`, and `k.contract` throws on `public` there.
           */
          scope?: 'public' | 'private';
          /**
           * How long the response stays fresh, in seconds.
           *
           * @example
           * 300
           */
          maxAge?: number;
          /**
           * How long a shared cache may keep the response, in seconds. Takes
           * precedence over `maxAge` for CDNs and proxies, which lets a browser
           * and a CDN hold the response for different lengths of time.
           */
          sharedMaxAge?: number;
          /**
           * How long a cache may keep serving the response after it goes stale
           * while it fetches a fresh one in the background, in seconds.
           * RFC 5861.
           */
          staleWhileRevalidate?: number;
          /**
           * How long a cache may keep serving the stale response when this API
           * is erroring, in seconds. RFC 5861.
           */
          staleIfError?: number;
          /**
           * Store the response, but check back before every reuse.
           */
          noCache?: true;
          /**
           * Once the response goes stale, do not serve it again without
           * checking back.
           */
          mustRevalidate?: true;
          /**
           * The response will not change while it is fresh, so a reload need
           * not check back. RFC 8246.
           */
          immutable?: true;
          /**
           * The request headers that change the response, sent as `Vary`. A
           * cache keys on them instead of serving one caller's response to the
           * next.
           *
           * @example
           * ['authorization']
           */
          vary?: readonly string[];
      };

/**
 * A response: a schema for the body, an object declaring the body schema with
 * optional response `headers`, `contentType`, `cache` policy, and `etag`, or a
 * {@link StreamResponseDefinition} sent piece by piece.
 */
export type ResponseDefinition =
    | z.ZodType
    | {
          /**
           * Schema for the response body.
           */
          body: z.ZodType;
          /**
           * Schema for the response headers. Each property becomes one
           * response header.
           */
          headers?: z.ZodType;
          /**
           * The `Content-Type` of this response.
           *
           * @default 'application/json'
           */
          contentType?: ResponseContentType;
          /**
           * How this response may be cached, sent as its `Cache-Control` and
           * `Vary` headers. A handler returning its own `cache-control` header
           * wins for that request.
           *
           * @example
           * cache: 'no-store'
           *
           * @example
           * cache: {
           *     scope: 'private',
           *     maxAge: 300,
           *     vary: ['authorization'],
           * }
           */
          cache?: CachePolicy;
          /**
           * Send an `ETag` for this response, and answer `304 Not Modified`
           * when the caller's `If-None-Match` already holds it. The tag hashes
           * the body, so the handler still runs; what it saves is sending the
           * body again. Pairs with a `cache` policy that revalidates, such as
           * `noCache` or `maxAge: 0` with `mustRevalidate`.
           *
           * Successful responses only, since `304` says the representation the
           * caller holds is still current.
           */
          etag?: true;
          stream?: never;
      }
    | StreamResponseDefinition;

/**
 * A single security requirement on a route, as `k.contract` writes it from the
 * access control map: a scheme name, or a map of scheme name to the scopes it
 * requires. Mirrors an entry of OpenAPI's `operation.security` array.
 */
export type SecurityRequirement<SchemeNames extends string = string> = SchemeNames | { [Name in SchemeNames]?: readonly string[] };

/**
 * The scheme name(s) a {@link SecurityRequirement} entry references.
 */
export type SchemeNameOf<Entry> = Entry extends string ? Entry : Extract<keyof Entry, string>;

/**
 * A path starting with `/`.
 */
export type RoutePath = `/${string}`;

/**
 * Response headers keyed by name.
 */
export type ResponseHeaders = Record<string, string>;

export interface RouteDefinition<TagKeys extends string = string, SchemeNames extends string = string> {
    method: Method;
    /**
     * Use `:paramName` for path parameters.
     *
     * Note: paths are matched exactly per RFC 3986, so `/users/1` and `/users/1/` are distinct resources.
     */
    path: RoutePath;
    summary?: string;
    description?: string;
    /**
     * Deprecates the route. Pass a message to tell callers what to use instead,
     * or the object form to announce the deprecation in response headers.
     */
    deprecated?:
        | boolean
        | string
        | {
              message?: string;
              /**
               * When the route became deprecated, ISO 8601.
               * A date alone means midnight UTC. Sent in the `Deprecation` header.
               *
               * @example
               * '2026-03-01'
               *
               * @example
               * '2026-03-01T12:00:00Z'
               */
              date?: string;
              /**
               * Documentation about the deprecation. Sent in the `Link` header.
               *
               * @example
               * 'https://example.com/changelog/delete-user'
               */
              link?: string;
          };
    /**
     * When the route will be removed, ISO 8601.
     * A date alone means midnight UTC. Sent in the `Sunset` header.
     *
     * @example
     * '2027-01-01'
     *
     * @example
     * '2027-01-01T12:00:00Z'
     */
    sunset?:
        | string
        | {
              /**
               * @example
               * '2027-01-01'
               *
               * @example
               * '2027-01-01T12:00:00Z'
               */
              date: string;
              /**
               * The retirement policy. Sent in the `Link` header.
               *
               * @example
               * 'https://example.com/retirement-policy'
               */
              link?: string;
          };
    /**
     * Tag keys grouping this route in the OpenAPI spec. Keys come from the tag set
     * declared with `Kizuna.tags`; `k.routes` stamps the group's tag onto every
     * route, and the generator resolves each key to its `title` for the spec.
     */
    tags?: readonly TagKeys[];
    /**
     * The security schemes this route requires, referencing identities registered
     * on the `kizuna` factory. Each entry is a scheme name or a `{ scheme: scopes }`
     * map. Set by `k.contract` from the access control map; `[]` marks the route public.
     */
    security?: readonly SecurityRequirement<SchemeNames>[];
    externalDocs?: {
        url: string;
        description?: string;
    };
    contentType?: 'application/json' | 'multipart/form-data' | 'application/x-www-form-urlencoded';
    body?: z.ZodType;
    query?: z.ZodType;
    pathParams?: z.ZodType;
    headers?: z.ZodType;
    /**
     * Responses keyed by HTTP status code. Each value is a schema for the body,
     * an object declaring the body schema with optional response `headers` and
     * `contentType`, or an object declaring a `stream` sent piece by piece.
     *
     * @example
     * ```ts
     * responses: {
     *     // Bare schema, the response body, sent as application/json
     *     200: UserSchema,
     *     // Object form, body plus headers and/or a non-default content type
     *     201: {
     *         body: UserSchema,
     *         headers: z.object({ 'x-request-id': z.string() }),
     *         contentType: 'application/json',
     *     },
     *     // Stream form, server-sent events named delta and done
     *     202: {
     *         stream: {
     *             delta: z.object({ text: z.string() }),
     *             done: z.object({ outputTokens: z.int() }),
     *         },
     *     },
     * }
     * ```
     */
    responses: {
        [status: number]: ResponseDefinition;
    };
}

/**
 * Key under which a routes group carries its group tag key, the source
 * `flattenRoutes` and the generator use to apply the group's tag to every route
 * in it. Stamped by `k.routes`.
 */
export const ROUTES_TAG: unique symbol = Symbol('ts-kizuna.routes.tag');

/**
 * Type-only key under which `k.contract` brands each route with its resolved
 * handler context. Never written at runtime.
 */
export const HANDLER_CONTEXT_BRAND: unique symbol = Symbol('ts-kizuna.route.handlerContext');

export interface HandlerContextBrand<Context> {
    readonly [HANDLER_CONTEXT_BRAND]?: Context;
}

/**
 * Type-only key under which `k.contract` brands a guarded route with the
 * statuses its guard answers for it. Never written at runtime.
 */
export const AUTO_RESPONSES_BRAND: unique symbol = Symbol('ts-kizuna.route.autoResponses');

export const AUTO_GUARD_BRAND: unique symbol = Symbol('ts-kizuna.route.guardBody');
export const AUTO_GUARD_WRITTEN_BRAND: unique symbol = Symbol('ts-kizuna.route.guardBodyWritten');

export interface AutoResponsesBrand<Statuses extends number, Body = ProblemDetails, Written = { detail: string }> {
    readonly [AUTO_RESPONSES_BRAND]?: Statuses;
    readonly [AUTO_GUARD_BRAND]?: Body;
    /**
     * The body a handler writes when it answers the `403` itself.
     */
    readonly [AUTO_GUARD_WRITTEN_BRAND]?: Written;
}

/**
 * The statuses the access control map puts on a guarded route.
 */
export type GuardStatus = Extract<KnownStatus, 401 | 403>;

export interface Routes<TagKeys extends string = string, SchemeNames extends string = string> {
    [ROUTES_TAG]?: string;
    [key: string]: RouteDefinition<TagKeys, SchemeNames> | Routes<TagKeys, SchemeNames>;
}

/**
 * A route as authored in `k.routes`: the route shape minus `security`, which
 * the access control map owns and `k.contract` resolves. Writing it on a route
 * is a type error.
 */
export type AuthoredRouteDefinition<TagKeys extends string = string> = Omit<RouteDefinition<TagKeys>, 'security'> & {
    security?: never;
};

/**
 * A tree of {@link AuthoredRouteDefinition}s, the shape `k.routes` accepts.
 */
export interface AuthoredRoutes<TagKeys extends string = string> {
    [ROUTES_TAG]?: string;
    [key: string]: AuthoredRouteDefinition<TagKeys> | AuthoredRoutes<TagKeys>;
}
