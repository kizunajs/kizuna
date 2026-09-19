import type { Context, Env, Hono, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
    type AdapterRequest,
    type RouteDefinition,
    type Routes,
    type RouteHandler as CoreRouteHandler,
    type Router as CoreRouter,
    type ApiWithRouter,
    type ErrorFormatter,
    type GuardMap,
    type RequestContextMap,
    ROUTER_META,
    GUARDS_META,
    SCHEMES_META,
    REQUEST_CONTEXT_META,
    JOBS_META,
    type JobsMeta,
    pluginRoutesOf,
    pluginExportsOf,
    pluginRouterOf,
    createAdapter,
    jobRoutes,
    jobRouter,
    jobRunnerFrom,
    type Adapter,
    type ContractRouter,
    type ContractJobsRouter,
    renderJsonResult,
    parseFetchBody,
    headersToObject,
} from '@ts-kizuna/core/adapter';
import type { SecurityScheme } from '@ts-kizuna/core';

export type HonoApi<R extends Routes = Routes> = ApiWithRouter<R> & {
    readonly [GUARDS_META]?: unknown;
    readonly [SCHEMES_META]?: unknown;
    readonly [REQUEST_CONTEXT_META]?: unknown;
    readonly [JOBS_META]?: unknown;
    /**
     * Register every contract route on a Hono app.
     */
    mount: <E extends Env = Env>(app: Hono<E>, options?: HonoOptions) => void;
};

export interface HonoHandlerContext<E extends Env = Env> {
    c: Context<E>;
}

/**
 * The handler type for a single route, typed against its contract definition.
 */
export type RouteHandler<R extends RouteDefinition, E extends Env = Env> = CoreRouteHandler<R, HonoHandlerContext<E>>;

/**
 * The handler tree for a contract or route group, typed against it. Preserves
 * Hono's {@link Env} generic for the handler context. Routes secured by the
 * contract's `auth` map additionally receive each required identity's context
 * in their handler args, under `auth`, keyed by the identity's name.
 */
export type Router<C, E extends Env = Env> = ContractRouter<C, HonoHandlerContext<E>>;

/**
 * The handler for each of a contract's scheduled jobs, typed against it. Each
 * receives only the job's `input`, so the same handler can be run in process.
 */
export type JobsRouter<C> = ContractJobsRouter<C>;

export interface HonoOptions {
    /**
     * Validate handler return values against the routes' response schemas.
     * Mismatches surface as 500 errors. Intended for development; disable in
     * production.
     *
     * @default false
     */
    responseValidation?: boolean;
    /**
     * Reshape error (status >= 400) response bytes before they are sent. See
     * {@link ErrorFormatter}.
     */
    formatError?: ErrorFormatter<Request>;
}

const pipeline = createAdapter<
    Request,
    Response,
    HonoHandlerContext<Env>,
    { c: Context<Env>; formatError?: ErrorFormatter<Request>; responseValidation?: boolean }
>({
    buildHandlerContext: (_adapterRequest, { c }) => ({ c }),
    respond: (result, { c, formatError, responseValidation }) => {
        if (result.kind === 'handler-error') {
            throw result.error;
        }
        if (result.kind === 'raw-response') {
            return result.response as Response;
        }
        const rendered = renderJsonResult(result, formatError as ErrorFormatter, c.req.raw, c.req.method);
        if (rendered.stream) {
            return c.body(
                rendered.stream({
                    signal: c.req.raw.signal,
                    validate: responseValidation,
                }),
                rendered.status as ContentfulStatusCode,
                rendered.headers
            );
        }
        if (rendered.body === undefined) {
            return c.body(null, rendered.status as ContentfulStatusCode, rendered.headers);
        }
        if (rendered.raw) {
            // Strings and binary (Uint8Array/ArrayBuffer) bodies are sent as-is, never JSON-serialized.
            return c.body(rendered.body as ArrayBuffer | string, rendered.status as ContentfulStatusCode, rendered.headers);
        }
        return c.json(rendered.body as object, rendered.status as ContentfulStatusCode, rendered.headers);
    },
});

/**
 * Mount a ts-kizuna API onto a Hono app.
 *
 * @example
 * const app = new Hono();
 * api.mount(app);
 */
export function mountHono<E extends Env = Env>(api: HonoApi, app: Hono<E>, options?: HonoOptions): void {
    const guards = api[GUARDS_META] as GuardMap<HonoHandlerContext<Env>> | undefined;
    const schemes = api[SCHEMES_META] as Record<string, SecurityScheme> | undefined;
    const requestContext = api[REQUEST_CONTEXT_META] as RequestContextMap<HonoHandlerContext<Env>> | undefined;

    const pluginExports = pluginExportsOf(api);
    const jobsMeta = api[JOBS_META] as JobsMeta | undefined;
    const jobRunner = jobRunnerFrom(jobsMeta);
    const mountRoute = (
        routeKey: string,
        route: RouteDefinition,
        lane: Routes,
        resolvedRouter: CoreRouter<Routes, HonoHandlerContext<Env>>
    ): void => {
        const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options';
        const kizunaHandler = async (c: Context<E>) => {
            const url = new URL(c.req.url);

            const adapterRequest: AdapterRequest<Request> = {
                request: c.req.raw,
                method: c.req.method,
                resolution: {
                    kind: 'pre-resolved',
                    routeKey,
                    route,
                    params: c.req.param() as Record<string, string>,
                },
                query: Object.fromEntries(url.searchParams),
                headers: headersToObject(c.req.raw.headers),
                readBody: (r: RouteDefinition) => parseFetchBody(c.req.raw, r),
            };

            return pipeline.handle({
                routes: lane,
                router: resolvedRouter,
                request: adapterRequest,
                responseContext: {
                    c: c as unknown as Context<Env>,
                    formatError: options?.formatError,
                    responseValidation: options?.responseValidation,
                },
                guards,
                schemes,
                requestContext,
                pluginExports,
                jobs: jobRunner,
                responseValidation: options?.responseValidation,
            });
        };
        (app.on as (method: string, path: string, ...handlers: MiddlewareHandler[]) => void)(
            method,
            route.path,
            kizunaHandler as MiddlewareHandler
        );
    };

    const mountLane = (lane: Routes, resolvedRouter: CoreRouter<Routes, HonoHandlerContext<Env>>): void => {
        for (const { routeKey, route } of pipeline.eachRoute(lane, resolvedRouter)) {
            mountRoute(routeKey, route, lane, resolvedRouter);
        }
    };

    mountLane(api.routes, api[ROUTER_META] as CoreRouter<Routes, HonoHandlerContext<Env>>);
    mountLane(pluginRoutesOf(api), pluginRouterOf(api) as CoreRouter<Routes, HonoHandlerContext<Env>>);

    if (jobsMeta) {
        const routes = jobRoutes(jobsMeta);
        const router = jobRouter<HonoHandlerContext<Env>>(jobsMeta);
        for (const [routeKey, route] of Object.entries(routes)) {
            mountRoute(routeKey, route as RouteDefinition, routes, router);
        }
    }
}

/**
 * The Hono adapter, as a value. Pass it to `new Kizuna({ adapter })`.
 *
 * @example
 * import { honoAdapter } from '@ts-kizuna/hono';
 *
 * export const k = new Kizuna({
 *     adapter: honoAdapter,
 * });
 */
export const honoAdapter: Adapter<HonoHandlerContext<Env>, [app: Hono, options?: HonoOptions], void> = {
    name: 'hono',
    mount: (api, app, options) => mountHono(api as HonoApi, app, options),
};
