import {
    type AdapterRequest,
    type AdapterResult,
    type Routes,
    type Router as CoreRouter,
    type ErrorFormatter,
    type GuardMap,
    type RequestContextMap,
    type ApiWithRouter,
    createAdapter,
    headersToObject,
    matchRoute,
    parseFetchBody,
    renderJsonResult,
    type Jobs,
    type JobRunner,
    ROUTER_META,
    GUARDS_META,
    SCHEMES_META,
    REQUEST_CONTEXT_META,
    JOBS_META,
    type JobsMeta,
    jobRoutes,
    jobRouter,
    jobRunnerFrom,
    type Adapter,
    pluginRoutesOf,
    pluginExportsOf,
    pluginRouterOf,
} from 'kizunajs/adapter';
import type { SecurityScheme } from 'kizunajs';
import { type NextRequest, NextResponse } from 'next/server';

export { NextRequest, NextResponse } from 'next/server';

export interface NextHandlerContext {
    request: NextRequest;
}

/**
 * An api's jobs paired with their handlers, both in the shape the request
 * pipeline takes.
 */
export interface MountedJobs {
    routes: Routes;
    router: CoreRouter<Routes, NextHandlerContext>;
    runner: JobRunner<Jobs>;
}

/**
 * Passed to each middleware function as the second argument.
 */
export interface NextMiddlewareRoute {
    path: string;
    method: string;
}

export type NextMiddlewareHandler = (request: NextRequest, route: NextMiddlewareRoute) => Response | void | Promise<Response | void>;

export interface NextHandlerOptions {
    basePath?: string;
    /**
     * Map a thrown error into a response. Return a `NextResponse` (e.g. built
     * from `problemDetails(...)`) to handle the error, or `void` to fall through
     * to the default 500.
     */
    onError?: (error: unknown, request: NextRequest) => NextResponse | Promise<NextResponse> | void | Promise<void>;
    /**
     * Reshape error (status >= 400) response bytes before they are sent. See
     * {@link ErrorFormatter}.
     */
    formatError?: ErrorFormatter<NextRequest>;
    /**
     * Middleware functions that run after route matching but before the handler.
     * Each receives `(request, route)`; return a `Response` to short-circuit.
     * Authentication belongs in a guard.
     */
    requestMiddleware?: Array<NextMiddlewareHandler>;
    /**
     * Validate handler return values against the routes' response schemas.
     * Mismatches surface as 500 errors. Intended for development; disable in
     * production.
     *
     * @default false
     */
    responseValidation?: boolean;
}

const jsonResponse = (status: number, body: unknown, headers: Record<string, string>, raw = false): NextResponse =>
    // Raw bodies (strings or binary Uint8Array) are passed through as `BodyInit`; only JSON is stringified.
    new NextResponse(body === null || body === undefined ? null : raw ? (body as BodyInit) : JSON.stringify(body), {
        status,
        headers,
    });

export const handleNextRequest = async <T extends Routes>(
    request: NextRequest,
    routes: T,
    router: CoreRouter<T, NextHandlerContext>,
    options?: NextHandlerOptions,
    guards?: GuardMap<NextHandlerContext>,
    schemes?: Record<string, SecurityScheme>,
    requestContext?: RequestContextMap<NextHandlerContext>,
    pluginExports?: Record<string, unknown>,
    jobs?: MountedJobs
): Promise<NextResponse> => {
    const url = new URL(request.url);

    const adapter = createAdapter<NextRequest, NextResponse, NextHandlerContext>({
        buildHandlerContext: (adapterRequest) => ({
            request: adapterRequest.request,
        }),
        respond: (result) => {
            if (result.kind === 'raw-response') return result.response as NextResponse;
            const rendered = renderJsonResult(result, options?.formatError as ErrorFormatter, request, request.method);
            if (rendered.stream) {
                return new NextResponse(
                    rendered.stream({
                        signal: request.signal,
                        validate: options?.responseValidation,
                    }),
                    {
                        status: rendered.status,
                        headers: rendered.headers,
                    }
                );
            }
            return jsonResponse(rendered.status, rendered.body, rendered.headers, rendered.raw);
        },
        onError: async (error): Promise<AdapterResult | void> => {
            if (!options?.onError) {
                console.error('[kizuna/next] handler error:', error);
                return;
            }
            const override = await options.onError(error, request);
            if (override) {
                return {
                    kind: 'raw-response',
                    response: override,
                };
            }
        },
    });

    if (jobs) {
        const matchedJob = matchRoute(request.method, url.pathname, jobs.routes, options?.basePath);
        if (matchedJob.kind === 'matched') {
            const jobRequest: AdapterRequest<NextRequest> = {
                request,
                method: request.method,
                resolution: {
                    kind: 'pre-resolved',
                    routeKey: matchedJob.match.routeKey,
                    route: matchedJob.match.route,
                    params: matchedJob.match.params,
                },
                query: Object.fromEntries(url.searchParams),
                headers: headersToObject(request.headers),
                readBody: (route) => parseFetchBody(request, route),
            };
            return adapter.handle({
                routes: jobs.routes,
                router: jobs.router,
                request: jobRequest,
                responseContext: {},
                guards,
                schemes,
                requestContext,
                pluginExports,
                jobs: jobs.runner,
                responseValidation: options?.responseValidation,
            });
        }
    }

    const globalMiddleware = options?.requestMiddleware;

    if (globalMiddleware && globalMiddleware.length > 0) {
        const matched = matchRoute(request.method, url.pathname, routes, options?.basePath);

        if (matched.kind === 'matched') {
            const middlewareRoute: NextMiddlewareRoute = {
                path: matched.match.route.path,
                method: matched.match.route.method,
            };

            for (const handler of globalMiddleware) {
                const result = await handler(request, middlewareRoute);
                if (result instanceof Response) {
                    return new NextResponse(result.body, {
                        status: result.status,
                        statusText: result.statusText,
                        headers: result.headers,
                    });
                }
            }

            const adapterRequest: AdapterRequest<NextRequest> = {
                request,
                method: request.method,
                resolution: {
                    kind: 'pre-resolved',
                    routeKey: matched.match.routeKey,
                    route: matched.match.route,
                    params: matched.match.params,
                },
                query: Object.fromEntries(url.searchParams),
                headers: headersToObject(request.headers),
                readBody: (route) => parseFetchBody(request, route),
            };

            return adapter.handle({
                routes,
                router,
                request: adapterRequest,
                responseContext: {},
                guards,
                schemes,
                requestContext,
                jobs: jobs?.runner,
                responseValidation: options?.responseValidation,
            });
        }
    }

    const adapterRequest: AdapterRequest<NextRequest> = {
        request,
        method: request.method,
        resolution: {
            kind: 'core-match',
            path: url.pathname,
        },
        query: Object.fromEntries(url.searchParams),
        headers: headersToObject(request.headers),
        readBody: (route) => parseFetchBody(request, route),
    };

    return adapter.handle({
        routes,
        router,
        request: adapterRequest,
        responseContext: {},
        guards,
        schemes,
        requestContext,
        pluginExports,
        jobs: jobs?.runner,
        basePath: options?.basePath,
        responseValidation: options?.responseValidation,
    });
};

type HttpHandlers = {
    GET: HttpHandler;
    HEAD: HttpHandler;
    POST: HttpHandler;
    PUT: HttpHandler;
    PATCH: HttpHandler;
    DELETE: HttpHandler;
    OPTIONS: HttpHandler;
};
type HttpHandler = (request: NextRequest) => Promise<NextResponse>;

export type NextApiWithRouter = ApiWithRouter & {
    readonly [GUARDS_META]?: unknown;
    readonly [SCHEMES_META]?: unknown;
    readonly [REQUEST_CONTEXT_META]?: unknown;
    readonly [JOBS_META]?: unknown;
};

export type NextApi<R extends Routes = Routes> = ApiWithRouter<R> & {
    readonly [GUARDS_META]?: unknown;
    readonly [SCHEMES_META]?: unknown;
    readonly [REQUEST_CONTEXT_META]?: unknown;
    readonly [JOBS_META]?: unknown;
    mount: (options?: NextHandlerOptions) => HttpHandlers;
};

/**
 * Create endpoints for a Next.js App Router catch-all route.
 *
 * @example
 * // app/api/[...kizuna]/route.ts
 * export const { GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS } = api.mount({
 *     basePath: '/api',
 * });
 */
export function mountNext(api: NextApiWithRouter, options?: NextHandlerOptions): HttpHandlers {
    const guards = api[GUARDS_META] as GuardMap<NextHandlerContext> | undefined;
    const schemes = api[SCHEMES_META] as Record<string, SecurityScheme> | undefined;
    const requestContext = api[REQUEST_CONTEXT_META] as RequestContextMap<NextHandlerContext> | undefined;
    const jobsMeta = api[JOBS_META] as JobsMeta | undefined;
    const mountedJobs = jobsMeta
        ? {
              routes: jobRoutes(jobsMeta),
              router: jobRouter<NextHandlerContext>(jobsMeta),
              runner: jobRunnerFrom(jobsMeta)!,
          }
        : undefined;
    const handlerOptions = {
        basePath: options?.basePath,
        onError: options?.onError,
        requestMiddleware: options?.requestMiddleware,
        responseValidation: options?.responseValidation,
    };
    const pluginExports = pluginExportsOf(api);
    const pluginRoutes = pluginRoutesOf(api);
    const pluginRouter = pluginRouterOf(api) as CoreRouter<Routes, NextHandlerContext>;

    const hasPluginRoutes = Object.keys(pluginRoutes).length > 0;

    const handler = async (request: NextRequest) => {
        if (hasPluginRoutes) {
            const pathname = new URL(request.url).pathname;
            const claimedByApi = matchRoute(request.method, pathname, api.routes, options?.basePath).kind === 'matched';

            if (!claimedByApi && matchRoute(request.method, pathname, pluginRoutes, options?.basePath).kind === 'matched') {
                return handleNextRequest(
                    request,
                    pluginRoutes,
                    pluginRouter,
                    handlerOptions,
                    guards,
                    schemes,
                    requestContext,
                    pluginExports,
                    undefined
                );
            }
        }

        return handleNextRequest(
            request,
            api.routes,
            api[ROUTER_META] as CoreRouter<Routes, NextHandlerContext>,
            handlerOptions,
            guards,
            schemes,
            requestContext,
            pluginExports,
            mountedJobs
        );
    };
    return {
        GET: handler,
        HEAD: handler,
        POST: handler,
        PUT: handler,
        PATCH: handler,
        DELETE: handler,
        OPTIONS: handler,
    };
}

/**
 * Serve an API on Next. What it takes is what every route is served with. Next
 * routes by file, so mounting returns the route handlers to re-export rather
 * than registering them on an app.
 *
 * @example
 * // kizuna.config.ts
 * export default defineConfig({
 *     adapter: nextAdapter(),
 *     routes,
 * });
 *
 * // src/app/api/[...kizuna]/route.ts
 * export const { GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS } = kizuna.api.mount({
 *     basePath: '/api',
 * });
 */
export const nextAdapter = (defaults?: NextHandlerOptions): Adapter<NextHandlerContext, [options?: NextHandlerOptions], HttpHandlers> => ({
    name: 'next',
    mount: (api, options) => mountNext(api as NextApiWithRouter, { ...defaults, ...options }),
});
