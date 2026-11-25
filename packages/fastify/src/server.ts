import Fastify from 'fastify';
import type { FastifyError, FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
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
    BODY_LIMIT_META,
    NESTING_LIMIT_META,
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
    bodyLimitOf,
    checkBodyHeaders,
    ContentTooLargeError,
} from 'kizunajs/adapter';
import type { SecurityScheme } from 'kizunajs';

export type FastifyApi<R extends Routes = Routes> = ApiWithRouter<R> & {
    readonly [GUARDS_META]?: unknown;
    readonly [SCHEMES_META]?: unknown;
    readonly [REQUEST_CONTEXT_META]?: unknown;
    readonly [JOBS_META]?: unknown;
    readonly [BODY_LIMIT_META]?: unknown;
    readonly [NESTING_LIMIT_META]?: unknown;
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
         * The params of a route with several params in one segment, read by kizuna's matcher.
         */
        kizunaParams?: PathParamsResult;
        /**
         * The body as it was sent, kept for routes with `rawBody: true`.
         */
        kizunaRawBody?: string;
        /**
         * Why Fastify refused this request's body, which the route answers.
         */
        kizunaBodyError?: unknown;
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
    /**
     * Keeps work a handler passed to `waitUntil` running after the response,
     * on a serverless host that stops the function once it answers. Leave it
     * out on a server whose process keeps running.
     *
     * @example
     * import { waitUntil } from '@vercel/functions';
     *
     * api.mount(app, {
     *     waitUntil,
     * });
     */
    waitUntil?: (promise: Promise<unknown>) => void;
}

interface FastifyResponseContext {
    reply: FastifyReply;
    formatError?: ErrorFormatter<FastifyRequest>;
    responseValidation?: boolean;
    waitUntil?: (promise: Promise<unknown>) => void;
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
 * Stops the parse of a body kizuna refuses from its headers, so none of it is read.
 */
class RefusedBody extends Error {}

const skipRefusedBody =
    (route: RouteDefinition, limit: number) =>
    async (request: FastifyRequest, _reply: FastifyReply, payload: CountedStream): Promise<CountedStream> => {
        if (checkBodyHeaders(route, request.headers, limit) !== undefined) throw new RefusedBody();
        return payload;
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
            received += chunk.length;
            // A hook ahead of this one, like a decompressor, counts what came off the wire itself.
            recorder.receivedEncodedLength = payload.receivedEncodedLength ?? received;
            // Past the limit Fastify answers 413, so the rest is not kept.
            if (recorder.receivedEncodedLength <= request.routeOptions.bodyLimit) chunks.push(chunk);
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
    response.headers.forEach((value, name) => {
        if (name !== 'set-cookie') reply.raw.setHeader(name, value);
    });
    // Each cookie is its own header line, so they are set together rather than one over the last.
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) reply.raw.setHeader('set-cookie', cookies);
    if (!response.body) {
        reply.raw.end();
        return;
    }
    pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), reply.raw, () => undefined);
};

const adapter = defineAdapter<FastifyRequest, void, FastifyHandlerContext, FastifyResponseContext>({
    buildHandlerContext: (adapterRequest, { reply }) => ({
        request: adapterRequest.request,
        reply,
    }),
    waitUntil: (promise, { waitUntil }) => waitUntil?.(promise),
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

const METHOD_OVERRIDE_CONSTRAINT = 'kizunaMethodOverride';

type ConstraintStrategy = Parameters<FastifyInstance['addConstraintStrategy']>[0];
type ConstraintStore = NonNullable<ReturnType<ReturnType<ConstraintStrategy['storage']>['get']>>;

/**
 * Picks the route a method-override POST stands in for: `GET` when the request
 * is one, and nothing otherwise, so every other request matches as usual.
 */
const methodOverrideStrategy: ConstraintStrategy = {
    name: METHOD_OVERRIDE_CONSTRAINT,
    storage: () => {
        const stores = new Map<string, ConstraintStore>();
        return {
            get: (value: string) => stores.get(value) ?? null,
            set: (value: string, store: ConstraintStore) => {
                stores.set(value, store);
            },
        };
    },
    deriveConstraint: (request) =>
        isMethodOverride(request.method ?? '', request.headers[METHOD_OVERRIDE_HEADER], request.headers['content-type'])
            ? 'GET'
            : undefined,
    mustMatchWhenDerived: false,
};

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
        const configBodyLimit = api[BODY_LIMIT_META] as number | undefined;
        const configNestingLimit = api[NESTING_LIMIT_META] as number | undefined;
        const jobRunner = jobRunnerFrom(jobsMeta);
        const mountRoute = (
            routeKey: string,
            route: RouteDefinition,
            lane: Routes,
            resolvedRouter: CoreRouter<Routes, FastifyHandlerContext>,
            method: Method = route.method,
            override = false
        ): void => {
            const shared = sharedSegmentRoute(route.path);
            const bodyLimit = bodyLimitOf(route, configBodyLimit);
            const handler = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
                const adapterRequest: AdapterRequest<FastifyRequest> = {
                    request,
                    method: override ? 'GET' : request.method,
                    resolution:
                        request.kizunaParams?.kind === 'malformed-path'
                            ? request.kizunaParams
                            : {
                                  kind: 'pre-resolved',
                                  routeKey,
                                  route,
                                  params:
                                      request.kizunaParams?.kind === 'matched'
                                          ? request.kizunaParams.params
                                          : ((request.params ?? {}) as Record<string, string>),
                              },
                    query: ((override ? request.body : request.query) ?? {}) as Record<string, string>,
                    headers: request.headers,
                    readBody: () => {
                        if (override) return undefined;
                        if (request.kizunaBodyError !== undefined) throw request.kizunaBodyError;
                        return request.body;
                    },
                    configBodyLimit,
                    configNestingLimit,
                    readRawBody: () => {
                        if (override) return '';
                        if (request.kizunaBodyError !== undefined) throw request.kizunaBodyError;
                        return request.kizunaRawBody ?? '';
                    },
                };

                await adapter.handle({
                    routes: lane,
                    router: resolvedRouter,
                    request: adapterRequest,
                    responseContext: {
                        reply,
                        formatError: options?.formatError,
                        responseValidation: options?.responseValidation,
                        waitUntil: options?.waitUntil,
                    },
                    guards,
                    schemes,
                    requestContext,
                    pluginExports,
                    jobs: jobRunner,
                    responseValidation: options?.responseValidation,
                });
            };
            app.route({
                method: override ? 'POST' : method,
                url: route.path,
                ...(override
                    ? {
                          constraints: {
                              [METHOD_OVERRIDE_CONSTRAINT]: 'GET',
                          },
                      }
                    : {}),
                ...(shared
                    ? {
                          onRequest: [
                              async (request: FastifyRequest, reply: FastifyReply) => {
                                  const params = shared.readParams(request.url.split('?', 1)[0]!);
                                  if (params.kind === 'not-found') {
                                      reply.callNotFound();
                                      return reply;
                                  }
                                  request.kizunaParams = params;
                              },
                          ],
                      }
                    : {}),
                preHandler: [
                    async (request: FastifyRequest) => {
                        request.kizunaRoute = route;
                    },
                ],
                bodyLimit,
                preParsing: [skipRefusedBody(route, bodyLimit), ...(route.rawBody === true ? [keepRawBody] : [])],
                handler,
                errorHandler: async (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
                    // A body refused from its headers, or one past Fastify's `bodyLimit`, is answered by the route like any other.
                    if (error instanceof RefusedBody) return handler(request, reply);
                    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
                        request.kizunaBodyError = new ContentTooLargeError(bodyLimit);
                        return handler(request, reply);
                    }
                    return app.errorHandler(error, request, reply);
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

        if (!app.hasConstraintStrategy(METHOD_OVERRIDE_CONSTRAINT)) app.addConstraintStrategy(methodOverrideStrategy);
        if (!app.hasContentTypeParser('application/x-www-form-urlencoded')) {
            app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
                done(null, entriesToObject(new URLSearchParams(body as string)));
            });
        }
        // A POST standing in for a GET is its own route, which Fastify picks only when the override header asks for GET.
        for (const [lane, resolvedRouter] of [
            [api.routes, api[ROUTER_META]],
            [pluginRoutesOf(api), pluginRouterOf(api)],
        ] as const) {
            for (const { routeKey, route } of adapter.eachRoute(lane, resolvedRouter as CoreRouter<Routes, FastifyHandlerContext>)) {
                if (route.method === 'GET') {
                    mountRoute(routeKey, route, lane, resolvedRouter as CoreRouter<Routes, FastifyHandlerContext>, 'POST', true);
                }
            }
        }

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
): Adapter<FastifyHandlerContext, [app: FastifyInstance, options?: FastifyOptions], Promise<void>> => {
    const inProcess = new WeakMap<object, Promise<FastifyInstance>>();
    const start = async (api: object): Promise<FastifyInstance> => {
        const app = Fastify();
        await app.register(fastifyKizuna, {
            ...defaults,
            api: api as FastifyApi,
        });
        await app.ready();
        return app;
    };
    const appFor = (api: object): Promise<FastifyInstance> => {
        const existing = inProcess.get(api);
        if (existing !== undefined) return existing;
        const ready = start(api);
        inProcess.set(api, ready);
        return ready;
    };
    return {
        name: 'fastify',
        mount: async (api, app, options) => {
            await app.register(fastifyKizuna, {
                ...defaults,
                ...options,
                api: api as FastifyApi,
            });
        },
        fetch: async (api, request) => {
            const app = await appFor(api);
            const injected = await injectedRequestOf(request);
            const response = await app.inject({
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
