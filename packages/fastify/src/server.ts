import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { Readable, pipeline } from 'node:stream';
import type { ServerResponse } from 'node:http';
import {
    type AdapterRequest,
    type Method,
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
    renderJsonResult,
    type RenderedResult,
    jobRoutes,
    jobRouter,
    jobRunnerFrom,
    type Adapter,
    type ContractRouter,
    type ContractJobsRouter,
} from '@ts-kizuna/core/adapter';
import type { SecurityScheme } from '@ts-kizuna/core';

export type FastifyApi<R extends Routes = Routes> = ApiWithRouter<R> & {
    readonly [GUARDS_META]?: unknown;
    readonly [SCHEMES_META]?: unknown;
    readonly [REQUEST_CONTEXT_META]?: unknown;
    readonly [JOBS_META]?: unknown;
    /**
     * Register every contract route on a Fastify instance. Calls
     * `app.register` internally, so encapsulation behaves as Fastify expects.
     */
    mount: (app: FastifyInstance, options?: FastifyOptions) => Promise<void>;
    /**
     * The same routes as a Fastify plugin, for composing inside your own plugin
     * tree: `app.register(api.plugin, { prefix: '/v1' })`.
     */
    plugin: FastifyPluginAsync<FastifyOptions>;
};

export interface FastifyHandlerContext {
    request: FastifyRequest;
    reply: FastifyReply;
}

/**
 * The handler type for a single route, typed against its contract definition.
 */
export type RouteHandler<R extends RouteDefinition> = CoreRouteHandler<R, FastifyHandlerContext>;

/**
 * The handler tree for a contract or route group, typed against it. Routes
 * secured by the contract's access control map additionally receive each required
 * identity's context in their handler args, under `auth`, keyed by the identity's name.
 */
export type Router<C> = ContractRouter<C, FastifyHandlerContext>;

/**
 * The handler for each of a contract's scheduled jobs, typed against it. Each
 * receives only the job's `input`, so the same handler can be run in process.
 */
export type JobsRouter<C> = ContractJobsRouter<C>;

declare module 'fastify' {
    interface FastifyRequest {
        kizunaRoute?: RouteDefinition;
    }
}

export type FastifyPreHandler = (request: FastifyRequest, reply: FastifyReply) => void | Promise<void>;

export interface FastifyOptions {
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
    formatError?: ErrorFormatter<FastifyRequest>;
}

interface FastifyResponseContext {
    reply: FastifyReply;
    formatError?: ErrorFormatter<FastifyRequest>;
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
 * Write a web `Response` to a Fastify reply. Plugins answer in web terms to stay
 * adapter-agnostic, so the translation belongs here.
 */
const writeWebResponse = async (response: unknown, reply: FastifyReply): Promise<void> => {
    if (!(response instanceof globalThis.Response)) return;
    reply.hijack();
    reply.raw.statusCode = response.status;
    response.headers.forEach((value, name) => reply.raw.setHeader(name, value));
    if (!response.body) {
        reply.raw.end();
        return;
    }
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]).pipe(reply.raw);
};

const adapter = createAdapter<FastifyRequest, void, FastifyHandlerContext, FastifyResponseContext>({
    buildHandlerContext: (adapterRequest, { reply }) => ({
        request: adapterRequest.request,
        reply,
    }),
    respond: (result, { reply, formatError, responseValidation }) => {
        if (result.kind === 'handler-error') {
            throw result.error;
        }
        if (result.kind === 'raw-response') {
            void writeWebResponse(result.response, reply);
            return;
        }
        const rendered = renderJsonResult(result, formatError as ErrorFormatter, reply.request, reply.request.method);
        if (rendered.stream) {
            reply.hijack();
            reply.raw.statusCode = rendered.status;
            for (const [key, value] of Object.entries(rendered.headers)) {
                reply.raw.setHeader(key, value);
            }
            writeStream(rendered.stream, reply.raw, responseValidation);
            return;
        }
        for (const [key, value] of Object.entries(rendered.headers)) {
            reply.header(key, value);
        }
        if (rendered.body === undefined) {
            reply.status(rendered.status).send();
        } else if (rendered.raw) {
            const body = rendered.body;
            // Strings go out as-is; binary (Uint8Array/Buffer) is sent as bytes, never JSON-serialized.
            reply.status(rendered.status).send(typeof body === 'string' || Buffer.isBuffer(body) ? body : Buffer.from(body as Uint8Array));
        } else {
            reply.status(rendered.status).send(rendered.body);
        }
    },
});

export interface KizunaPluginOptions extends FastifyOptions {
    /**
     * The API object built by `server.api`.
     */
    api: FastifyApi;
}

/**
 * Fastify plugin that mounts a ts-kizuna API.
 *
 * @example
 * const app = Fastify();
 * await api.mount(app);
 */
export const fastifyKizuna = fastifyPlugin(
    async (app: FastifyInstance, options: KizunaPluginOptions) => {
        const { api } = options;
        const guards = api[GUARDS_META] as GuardMap<FastifyHandlerContext> | undefined;
        const schemes = api[SCHEMES_META] as Record<string, SecurityScheme> | undefined;
        const requestContext = api[REQUEST_CONTEXT_META] as RequestContextMap<FastifyHandlerContext> | undefined;

        const pluginExports = pluginExportsOf(api);
        const jobsMeta = api[JOBS_META] as JobsMeta | undefined;
        const jobRunner = jobRunnerFrom(jobsMeta);
        const mountRoute = (
            routeKey: string,
            route: RouteDefinition,
            lane: Routes,
            resolvedRouter: CoreRouter<Routes, FastifyHandlerContext>,
            method: Method = route.method
        ): void => {
            app.route({
                method,
                url: route.path,
                preHandler: [
                    async (request: FastifyRequest) => {
                        request.kizunaRoute = route;
                    },
                ],
                handler: async (request: FastifyRequest, reply: FastifyReply) => {
                    const adapterRequest: AdapterRequest<FastifyRequest> = {
                        request,
                        method: request.method,
                        resolution: {
                            kind: 'pre-resolved',
                            routeKey,
                            route,
                            params: (request.params ?? {}) as Record<string, string>,
                        },
                        query: (request.query ?? {}) as Record<string, string>,
                        headers: request.headers,
                        readBody: () => request.body,
                    };

                    await adapter.handle({
                        routes: lane,
                        router: resolvedRouter,
                        request: adapterRequest,
                        responseContext: {
                            reply,
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
                },
            });
        };

        const mountLane = (lane: Routes, resolvedRouter: CoreRouter<Routes, FastifyHandlerContext>): void => {
            // HEAD routes register first, a derived one per GET-only path, so HEAD works without
            // `exposeHeadRoutes` and Fastify's auto-exposed HEAD skips the taken paths instead of colliding.
            const declaredRoutes = [...adapter.eachRoute(lane, resolvedRouter)];
            const headPaths = new Set(declaredRoutes.filter(({ route }) => route.method === 'HEAD').map(({ route }) => route.path));

            for (const { routeKey, route } of declaredRoutes) {
                if (route.method === 'HEAD') mountRoute(routeKey, route, lane, resolvedRouter);
            }
            for (const { routeKey, route } of declaredRoutes) {
                if (route.method === 'GET' && !headPaths.has(route.path)) {
                    mountRoute(routeKey, route, lane, resolvedRouter, 'HEAD');
                }
            }
            for (const { routeKey, route } of declaredRoutes) {
                if (route.method !== 'HEAD') mountRoute(routeKey, route, lane, resolvedRouter);
            }
        };

        mountLane(api.routes, api[ROUTER_META] as CoreRouter<Routes, FastifyHandlerContext>);
        mountLane(pluginRoutesOf(api), pluginRouterOf(api) as CoreRouter<Routes, FastifyHandlerContext>);

        if (jobsMeta) {
            const routes = jobRoutes(jobsMeta);
            const router = jobRouter<FastifyHandlerContext>(jobsMeta);
            for (const [routeKey, route] of Object.entries(routes)) {
                mountRoute(routeKey, route as RouteDefinition, routes, router);
            }
        }
    },
    {
        name: '@ts-kizuna/fastify',
    }
);

/**
 * Serve an API on Fastify. What it takes is what every route is served with.
 *
 * @example
 * export const { api } = defineConfig({
 *     adapter: fastifyAdapter(),
 *     routes,
 * });
 *
 * await api.mount(app);
 */
export const fastifyAdapter = (
    defaults?: FastifyOptions
): Adapter<FastifyHandlerContext, [app: FastifyInstance, options?: FastifyOptions], Promise<void>> => ({
    name: 'fastify',
    mount: async (api, app, options) => {
        await app.register(fastifyKizuna, {
            ...defaults,
            ...options,
            api: api as FastifyApi,
        });
    },
});
