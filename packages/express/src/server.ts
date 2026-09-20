import type { Request, Response, NextFunction, Router as ExpressRouter } from 'express';
import { Router as createExpressRouter } from 'express';
import { Readable, pipeline } from 'node:stream';
import type { ServerResponse } from 'node:http';
import {
    type AdapterRequest,
    type RouteDefinition,
    type Routes,
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
    renderJsonResult,
    type RenderedResult,
    jobRoutes,
    jobRouter,
    jobRunnerFrom,
    type Adapter,
} from '@ts-kizuna/core/adapter';
import type { SecurityScheme } from '@ts-kizuna/core';

export type ExpressApi<R extends Routes = Routes> = ApiWithRouter<R> & {
    readonly [GUARDS_META]?: unknown;
    readonly [SCHEMES_META]?: unknown;
    readonly [REQUEST_CONTEXT_META]?: unknown;
    readonly [JOBS_META]?: unknown;
    /**
     * Register every route on an Express app or router.
     */
    mount: (app: AppLike, options?: ExpressOptions) => ExpressRouter;
};

/**
 * The Express request and response passed to each handler.
 */
export interface ExpressHandlerContext {
    req: Request;
    res: Response;
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            kizunaRoute?: RouteDefinition;
        }
    }
}

export interface ExpressOptions {
    /**
     * Validate handler return values against the route's response schemas.
     * Mismatches surface as 500 errors. Enable in development.
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

export interface AppLike {
    use: (router: ExpressRouter) => unknown;
}

interface ExpressResponseContext {
    res: Response;
    next: NextFunction;
    formatError?: ErrorFormatter<Request>;
    responseValidation?: boolean;
}

const writeStream = (open: NonNullable<RenderedResult['stream']>, res: ServerResponse, validate: boolean | undefined): void => {
    const controller = new AbortController();
    res.on('close', () => {
        if (!res.writableFinished) controller.abort();
    });
    res.flushHeaders();
    const stream = open({
        signal: controller.signal,
        validate,
    });
    pipeline(Readable.fromWeb(stream as Parameters<typeof Readable.fromWeb>[0]), res, () => undefined);
};

/**
 * Write a web `Response` to a node response. Plugins answer in web terms to stay
 * adapter-agnostic, so the translation belongs here.
 */
const writeWebResponse = async (response: unknown, res: Response): Promise<void> => {
    if (!(response instanceof globalThis.Response)) return;
    res.status(response.status);
    response.headers.forEach((value, name) => res.setHeader(name, value));
    if (!response.body) {
        res.end();
        return;
    }
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
};

const adapter = createAdapter<Request, void, ExpressHandlerContext, ExpressResponseContext>({
    buildHandlerContext: (adapterRequest, { res }) => ({
        req: adapterRequest.request,
        res,
    }),
    respond: (result, { res, next, formatError, responseValidation }) => {
        if (result.kind === 'handler-error') {
            next(result.error);
            return;
        }
        if (result.kind === 'raw-response') {
            void writeWebResponse(result.response, res);
            return;
        }
        if (res.headersSent) return;
        if (result.kind === 'not-found' || result.kind === 'method-not-allowed') {
            next();
            return;
        }
        // Express strips HEAD content in res.send itself, so requestMethod stays unset.
        const rendered = renderJsonResult(result, formatError as ErrorFormatter, res.req);
        for (const [key, value] of Object.entries(rendered.headers)) {
            res.setHeader(key, value);
        }
        if (rendered.stream) {
            res.status(rendered.status);
            if (res.req.method === 'HEAD') {
                res.end();
                return;
            }
            writeStream(rendered.stream, res, responseValidation);
            return;
        }
        if (rendered.body === undefined) {
            res.status(rendered.status).end();
        } else if (rendered.raw) {
            const body = rendered.body;
            // Strings go out as-is; binary (Uint8Array/Buffer) is sent as bytes, never JSON-serialized.
            res.status(rendered.status).send(typeof body === 'string' || Buffer.isBuffer(body) ? body : Buffer.from(body as Uint8Array));
        } else {
            res.status(rendered.status).json(rendered.body);
        }
    },
});

/**
 * Mount a ts-kizuna API onto an Express app.
 *
 * @example
 * api.mount(app);
 */
export function mountExpress(api: ExpressApi, app: AppLike, options?: ExpressOptions): ExpressRouter {
    const guards = api[GUARDS_META] as GuardMap<ExpressHandlerContext> | undefined;
    const schemes = api[SCHEMES_META] as Record<string, SecurityScheme> | undefined;
    const requestContext = api[REQUEST_CONTEXT_META] as RequestContextMap<ExpressHandlerContext> | undefined;

    const pluginExports = pluginExportsOf(api);
    const jobsMeta = api[JOBS_META] as JobsMeta | undefined;
    const jobRunner = jobRunnerFrom(jobsMeta);
    const expressRouter = createExpressRouter();

    const mountRoute = (
        routeKey: string,
        route: RouteDefinition,
        routes: Routes,
        router: CoreRouter<Routes, ExpressHandlerContext>
    ): void => {
        const method = route.method.toLowerCase() as 'get' | 'head' | 'post' | 'put' | 'patch' | 'delete' | 'options';
        expressRouter[method](
            route.path,
            (req: Request, _res: Response, next: NextFunction) => {
                req.kizunaRoute = route;
                next();
            },
            async (req: Request, res: Response, next: NextFunction) => {
                const adapterRequest: AdapterRequest<Request> = {
                    request: req,
                    method: req.method,
                    resolution: {
                        kind: 'pre-resolved',
                        routeKey,
                        route,
                        params: req.params as Record<string, string>,
                    },
                    query: req.query,
                    headers: req.headers,
                    readBody: () => req.body,
                };
                await adapter.handle({
                    routes,
                    router,
                    request: adapterRequest,
                    responseContext: {
                        res,
                        next,
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
            }
        );
    };

    const mountLane = (routes: Routes, router: CoreRouter<Routes, ExpressHandlerContext>): void => {
        // A GET layer answers HEAD too, so a declared HEAD route registers first or is never reached.
        const declaredRoutes = [...adapter.eachRoute(routes, router)].sort(
            (left, right) => Number(right.route.method === 'HEAD') - Number(left.route.method === 'HEAD')
        );
        for (const { routeKey, route } of declaredRoutes) {
            mountRoute(routeKey, route, routes, router);
        }
    };

    mountLane(api.routes, api[ROUTER_META] as CoreRouter<Routes, ExpressHandlerContext>);
    mountLane(pluginRoutesOf(api), pluginRouterOf(api) as CoreRouter<Routes, ExpressHandlerContext>);

    if (jobsMeta) {
        const routes = jobRoutes(jobsMeta);
        const router = jobRouter<ExpressHandlerContext>(jobsMeta);
        for (const [routeKey, route] of Object.entries(routes)) {
            mountRoute(routeKey, route as RouteDefinition, routes, router);
        }
    }

    app.use(expressRouter);

    return expressRouter;
}

/**
 * Serve an API on Express. What it takes is what every route is served with.
 *
 * @example
 * // kizuna.config.ts
 * export default defineConfig({
 *     adapter: expressAdapter(),
 *     routes,
 * });
 *
 * // src/index.ts
 * kizuna.api.mount(app);
 */
export const expressAdapter = (
    defaults?: ExpressOptions
): Adapter<ExpressHandlerContext, [app: AppLike, options?: ExpressOptions], ExpressRouter> => ({
    name: 'express',
    mount: (api, app, options) => mountExpress(api as ExpressApi, app, { ...defaults, ...options }),
});
