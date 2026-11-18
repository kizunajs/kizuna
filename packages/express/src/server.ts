import type { Request, Response, NextFunction, RequestHandler, Router as ExpressRouter } from 'express';
import express, { Router as createExpressRouter, json, urlencoded } from 'express';
import { inject } from 'light-my-request';
import { Readable, pipeline } from 'node:stream';
import { IncomingMessage, ServerResponse } from 'node:http';
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
    defineAdapter,
    renderJsonResult,
    type RenderedResult,
    jobRoutes,
    jobRouter,
    jobRunnerFrom,
    sharedSegmentRoute,
    type PathParamsResult,
    type Adapter,
    entriesToObject,
    isMethodOverride,
    METHOD_OVERRIDE_HEADER,
    injectedRequestOf,
    responseOfInjected,
} from 'kizunajs/adapter';
import type { SecurityScheme } from 'kizunajs';

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
            /**
             * The params of a route with several params in one segment, read by kizuna's matcher.
             */
            kizunaParams?: PathParamsResult;
            /**
             * The body as it was sent, kept by {@link keepRawBody}.
             */
            rawBody?: Buffer;
            /**
             * Set when kizuna parsed this request's body itself.
             */
            kizunaParsedBody?: true;
            /**
             * The query a method-override POST carries in its form body.
             */
            kizunaOverrideQuery?: Record<string, unknown>;
        }
    }
}

/**
 * Keep the body as it was sent, for routes with `rawBody: true`. Pass it as the
 * `verify` option of an `express.json()` your app runs before kizuna.
 *
 * @example
 * app.use(
 *     express.json({
 *         verify: keepRawBody,
 *     })
 * );
 */
export const keepRawBody = (req: IncomingMessage, _res: ServerResponse, buffer: Buffer): void => {
    (req as Request).rawBody = buffer;
};

type JsonOptions = NonNullable<Parameters<typeof json>[0]>;

/**
 * Parse a kizuna route's body, unless the app already parsed it. The parser
 * keeps the text as well, for routes with `rawBody: true`.
 */
const bodyParserFor = (route: RouteDefinition, jsonOptions: JsonOptions | undefined): RequestHandler | undefined => {
    if (route.contentType === 'multipart/form-data') return undefined;
    const parse: RequestHandler =
        route.contentType === 'application/x-www-form-urlencoded'
            ? urlencoded({
                  extended: false,
                  verify: keepRawBody,
              })
            : json({
                  ...jsonOptions,
                  verify: keepRawBody,
              });
    return (req, res, next) => {
        if (req.body !== undefined) {
            next();
            return;
        }
        req.kizunaParsedBody = true;
        parse(req, res, next);
    };
};

/**
 * The body text for a `rawBody` route: what the parser kept, an empty body when
 * kizuna parsed and there was none, or `undefined` when the app's own parser
 * consumed it without keeping it.
 */
/**
 * Reads a method-override POST's form body as the query it stands in for. A body
 * another middleware already parsed is used as it is.
 */
const readOverrideQuery = (req: Request, _res: Response, next: NextFunction): void => {
    if (req.body !== undefined && req.body !== null && typeof req.body === 'object') {
        req.kizunaOverrideQuery = req.body as Record<string, unknown>;
        next();
        return;
    }
    let text = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
        text += chunk;
    });
    req.on('end', () => {
        req.kizunaOverrideQuery = entriesToObject(new URLSearchParams(text));
        next();
    });
    req.on('error', next);
};

const rawBodyOf = (req: Request): string | undefined => {
    if (req.rawBody !== undefined) return req.rawBody.toString('utf8');
    return req.kizunaParsedBody === true ? '' : undefined;
};

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
    /**
     * The options for `express.json()`, like `limit` and `strict`, used to parse
     * the bodies of kizuna's own routes. An `express.json()` your app runs
     * first takes precedence, and kizuna uses the body it parsed.
     *
     * @example
     * json: {
     *     limit: '5mb',
     * }
     */
    json?: JsonOptions;
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
    pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), res, () => undefined);
};

const adapter = defineAdapter<Request, void, ExpressHandlerContext, ExpressResponseContext>({
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
 * Mount a Kizuna API onto an Express app.
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
        router: CoreRouter<Routes, ExpressHandlerContext>,
        override = false
    ): void => {
        const method = override ? 'post' : (route.method.toLowerCase() as 'get' | 'head' | 'post' | 'put' | 'patch' | 'delete' | 'options');
        const parseBody = override ? readOverrideQuery : bodyParserFor(route, options?.json);
        const shared = sharedSegmentRoute(route.path);
        expressRouter[method](
            route.path,
            (req: Request, _res: Response, next: NextFunction) => {
                if (override && !isMethodOverride(req.method, req.headers[METHOD_OVERRIDE_HEADER], req.headers['content-type'])) {
                    next('route');
                    return;
                }
                if (shared) {
                    const params = shared.readParams(req.path);
                    if (params.kind === 'not-found') {
                        next('route');
                        return;
                    }
                    req.kizunaParams = params;
                }
                req.kizunaRoute = route;
                next();
            },
            ...(parseBody === undefined ? [] : [parseBody]),
            async (req: Request, res: Response, next: NextFunction) => {
                const adapterRequest: AdapterRequest<Request> = {
                    request: req,
                    method: override ? 'GET' : req.method,
                    resolution:
                        req.kizunaParams?.kind === 'malformed-path'
                            ? req.kizunaParams
                            : {
                                  kind: 'pre-resolved',
                                  routeKey,
                                  route,
                                  params:
                                      req.kizunaParams?.kind === 'matched'
                                          ? req.kizunaParams.params
                                          : (req.params as Record<string, string>),
                              },
                    query: override ? (req.kizunaOverrideQuery ?? {}) : req.query,
                    headers: req.headers,
                    readBody: () => (override ? undefined : req.body),
                    readRawBody: () => (override ? '' : rawBodyOf(req)),
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

    // A POST standing in for a GET registers ahead of every route, so it is seen before a POST on the same path.
    const mountOverrides = (routes: Routes, router: CoreRouter<Routes, ExpressHandlerContext>): void => {
        for (const { routeKey, route } of adapter.eachRoute(routes, router)) {
            if (route.method === 'GET') mountRoute(routeKey, route, routes, router, true);
        }
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

    mountOverrides(api.routes, api[ROUTER_META] as CoreRouter<Routes, ExpressHandlerContext>);
    mountOverrides(pluginRoutesOf(api), pluginRouterOf(api) as CoreRouter<Routes, ExpressHandlerContext>);
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
 * An Express app for injected requests. light-my-request rewrites the prototypes behind an app's request and response,
 * and Express shares those between every app in the process, so this app gets copies of its own and the app serving
 * real requests is never touched.
 */
const injectableExpress = (): ReturnType<typeof express> => {
    const app = express();
    const ownedBy = {
        app: {
            configurable: true,
            enumerable: true,
            writable: true,
            value: app,
        },
    };
    const request = Object.create(IncomingMessage.prototype, Object.getOwnPropertyDescriptors(express.request)) as object;
    const response = Object.create(ServerResponse.prototype, Object.getOwnPropertyDescriptors(express.response)) as object;
    app.request = Object.create(request, ownedBy) as typeof app.request;
    app.response = Object.create(response, ownedBy) as typeof app.response;
    return app;
};

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
): Adapter<ExpressHandlerContext, [app: AppLike, options?: ExpressOptions], ExpressRouter> => {
    const inProcess = new WeakMap<object, ReturnType<typeof express>>();
    return {
        name: 'express',
        mount: (api, app, options) => mountExpress(api as ExpressApi, app, { ...defaults, ...options }),
        // Express answers only on a socket, so the request is injected the way Fastify's own `inject` does.
        fetch: async (api, request) => {
            let app = inProcess.get(api);
            if (app === undefined) {
                app = injectableExpress();
                mountExpress(api as ExpressApi, app, {
                    ...defaults,
                });
                inProcess.set(api, app);
            }
            const injected = await injectedRequestOf(request);
            const response = await inject(app as never, {
                method: injected.method as never,
                url: injected.url,
                headers: injected.headers,
                ...(injected.body === undefined
                    ? {}
                    : {
                          body: Buffer.from(injected.body),
                      }),
                payloadAsStream: true,
            });
            return responseOfInjected(response);
        },
    };
};
