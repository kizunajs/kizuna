import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { Readable, Transform, pipeline } from 'node:stream';
import type { ServerResponse } from 'node:http';
import {
    type AdapterRequest,
    type Method,
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
    type Adapter,
} from 'kizunajs/adapter';
import type { SecurityScheme } from 'kizunajs';

export type FastifyApi<R extends Routes = Routes> = ApiWithRouter<R> & {
    readonly [GUARDS_META]?: unknown;
    readonly [SCHEMES_META]?: unknown;
    readonly [REQUEST_CONTEXT_META]?: unknown;
    readonly [JOBS_META]?: unknown;
    /**
     * Register every route on a Fastify instance. Calls
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

declare module 'fastify' {
    interface FastifyRequest {
        kizunaRoute?: RouteDefinition;
        /**
         * The body as it was sent, kept for routes with `rawBody: true`.
         */
        kizunaRawBody?: string;
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

type CountedStream = NodeJS.ReadableStream & {
    /**
     * The bytes read off the wire so far, which Fastify checks against
     * `bodyLimit` and `Content-Length` when a `preParsing` hook replaces the
     * request stream.
     */
    receivedEncodedLength?: number;
};

/**
 * Keep a `rawBody` route's body as it was sent. The bytes pass through to
 * Fastify's parser as it reads them, so its `bodyLimit` and `Content-Length`
 * checks stop the read as they would on any route, and the text is kept once
 * the whole body has passed.
 */
const keepRawBody = async (request: FastifyRequest, _reply: FastifyReply, payload: CountedStream): Promise<CountedStream> => {
    const chunks: Buffer[] = [];
    let received = 0;
    const recorder: Transform & CountedStream = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            chunks.push(chunk);
            received += chunk.length;
            // A hook ahead of this one, like a decompressor, counts what came off the wire itself.
            recorder.receivedEncodedLength = payload.receivedEncodedLength ?? received;
            callback(null, chunk);
        },
        flush(callback) {
            request.kizunaRawBody = Buffer.concat(chunks).toString('utf8');
            callback();
        },
    });
    pipeline(payload, recorder, () => undefined);
    return recorder;
};

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
    // A body that errors partway destroys the socket, so the client sees a truncated response.
    pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), reply.raw, () => undefined);
};

const adapter = defineAdapter<FastifyRequest, void, FastifyHandlerContext, FastifyResponseContext>({
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
     * The API object built by `defineConfig`.
     */
    api: FastifyApi;
}

/**
 * Fastify plugin that mounts a Kizuna API.
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
                ...(route.rawBody === true
                    ? {
                          preParsing: [keepRawBody],
                      }
                    : {}),
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
                        readRawBody: () => request.kizunaRawBody ?? '',
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
        name: '@kizunajs/fastify',
    }
);

/**
 * Serve an API on Fastify. What it takes is what every route is served with.
 *
 * @example
 * // kizuna.config.ts
 * export default defineConfig({
 *     adapter: fastifyAdapter(),
 *     routes,
 * });
 *
 * // src/index.ts
 * await kizuna.api.mount(app);
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
