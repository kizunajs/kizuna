import type { z } from 'zod';
import {
    defineAdapter,
    entriesToObject,
    headersToObject,
    jobRunnerFrom,
    parseFetchBody,
    renderJsonResult,
    runGate,
    GUARDS_META,
    JOBS_META,
    REQUEST_CONTEXT_META,
    ROUTER_META,
    SCHEMES_META,
    type AdapterRequest,
    type AdapterResult,
    type GuardMap,
    type JobsMeta,
    type RequestContextMap,
} from './adapter.js';
import type { ApiDefinition, ApiPluginsOf, JobsOf, RoutesOf, SchemesOf } from './api-definition.js';
import { flattenRoutes, isRouteDefinition, type GuardReturn } from './handler-pipeline.js';
import type { Router } from './handler-pipeline.js';
import type { JobRunner } from './job-runner.js';
import type { ExtractPathParams } from './path-params.js';
import { pluginExportsOf } from './plugin-server.js';
import type { PluginExportValues } from './plugin.js';
import type { ProblemDetails } from './problem-details.js';
import { resolveSecurityRequirements, type SecurityScheme } from './security-scheme.js';
import { AUTO_GUARD_BRAND, AUTO_RESPONSES_BRAND, type RouteDefinition, type Routes, type StreamResponseDefinition } from './types.js';
import type { ValidationError } from './validation-error.js';
import { isJsonMediaType, isStreamResponse, resolveResponseBody } from './generator-utils.js';

/**
 * A value as it arrives over JSON: a date becomes its ISO string.
 */
type Wire<Value> = Value extends Date
    ? string
    : Value extends Uint8Array | Blob
      ? Value
      : Value extends readonly (infer Item)[]
        ? Wire<Item>[]
        : Value extends object
          ? {
                [Key in keyof Value]: Wire<Value[Key]>;
            }
          : Value;

type ResponseBody<Spec> = Spec extends StreamResponseDefinition
    ? ReadableStream<Uint8Array>
    : Spec extends z.ZodType
      ? Wire<z.output<Spec>>
      : Spec extends {
              body: z.ZodType;
          }
        ? Wire<z.output<Spec['body']>>
        : never;

type DeclaredResult<R extends RouteDefinition> = {
    [Status in keyof R['responses'] & number]: {
        status: Status;
        body: ResponseBody<R['responses'][Status]>;
        headers: Record<string, string>;
    };
}[keyof R['responses'] & number];

type GuardResult<R> = typeof AUTO_RESPONSES_BRAND extends keyof R
    ? {
          status: NonNullable<R[typeof AUTO_RESPONSES_BRAND]>;
          body: typeof AUTO_GUARD_BRAND extends keyof R ? NonNullable<R[typeof AUTO_GUARD_BRAND]> : ProblemDetails;
          headers: Record<string, string>;
      }
    : never;

/**
 * What a call answers: every status the route declares, the `400` kizuna
 * answers for invalid input, and the statuses its guards answer.
 */
export type TestResult<R extends RouteDefinition> =
    | DeclaredResult<R>
    | GuardResult<R>
    | {
          status: 400;
          body: ValidationError;
          headers: Record<string, string>;
      };

type InputArg<Name extends string, Schema> = Schema extends z.ZodType
    ? {} extends z.input<Schema>
        ? {
              [Key in Name]?: z.input<Schema>;
          }
        : {
              [Key in Name]: z.input<Schema>;
          }
    : {};

type ParamsArg<R extends RouteDefinition> = R extends {
    pathParams: z.ZodType;
}
    ? InputArg<'params', R['pathParams']>
    : keyof ExtractPathParams<R['path']> extends never
      ? {}
      : {
            params: {
                [Name in keyof ExtractPathParams<R['path']>]: string | number;
            };
        };

/**
 * A route without a headers schema still takes headers, such as a real
 * credential for its guard to check.
 */
type HeadersArg<R extends RouteDefinition> = R extends {
    headers: z.ZodType;
}
    ? InputArg<'headers', R['headers']>
    : {
          headers?: Record<string, string>;
      };

type CallArgs<R extends RouteDefinition> = ParamsArg<R> & InputArg<'query', R['query']> & InputArg<'body', R['body']> & HeadersArg<R>;

type RouteCall<R extends RouteDefinition> =
    {} extends CallArgs<R> ? (args?: CallArgs<R>) => Promise<TestResult<R>> : (args: CallArgs<R>) => Promise<TestResult<R>>;

export type TestRoutes<R extends Routes> = {
    [Key in keyof R as Key extends symbol ? never : Key]: R[Key] extends RouteDefinition
        ? RouteCall<R[Key]>
        : R[Key] extends Routes
          ? TestRoutes<R[Key]>
          : never;
};

/**
 * Who a call is made as: what each identity's guard would have returned.
 */
export type Caller<Api extends ApiDefinition> = {
    [Name in keyof SchemesOf<Api>]?: GuardReturn<SchemesOf<Api>[Name]>;
};

export type TestClient<Api extends ApiDefinition> = TestRoutes<RoutesOf<Api>> & {
    /**
     * Call as an identity. Its guard is skipped and answers `result`, and the
     * route's roles and `requires` still run. Chain it for a route that
     * requires several identities.
     */
    as: <Name extends keyof SchemesOf<Api> & string>(identity: Name, result: GuardReturn<SchemesOf<Api>[Name]>) => TestClient<Api>;
};

type DeepPartial<Value> = Value extends (...args: never[]) => unknown
    ? Value
    : Value extends object
      ? {
            [Key in keyof Value]?: DeepPartial<Value[Key]>;
        }
      : Value;

export interface TestClientOptions<Api extends ApiDefinition> {
    /**
     * Replaces what handlers receive under `plugins`. Anything left out stays
     * the installed plugin's own.
     */
    plugins?: DeepPartial<PluginExportValues<ApiPluginsOf<Api>>>;
    /**
     * Replaces what handlers receive under `jobs`. Anything left out runs the
     * real job.
     */
    jobs?: DeepPartial<JobRunner<JobsOf<Api>>>;
}

const TEST_ORIGIN = 'http://kizuna.test';

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (value === null || typeof value !== 'object') return false;
    const prototype = Object.getPrototypeOf(value) as unknown;
    return prototype === Object.prototype || prototype === null;
};

const mergeDeep = (base: unknown, override: unknown): unknown => {
    if (!isPlainObject(override)) return override;
    const merged: Record<string, unknown> = isPlainObject(base) ? { ...base } : {};
    for (const [key, value] of Object.entries(override)) {
        merged[key] = mergeDeep(merged[key], value);
    }
    return merged;
};

const serializeValue = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value));

const buildSearchParams = (fields: Record<string, unknown>): URLSearchParams => {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === null) continue;
        for (const item of Array.isArray(value) ? value : [value]) searchParams.append(key, serializeValue(item));
    }
    return searchParams;
};

const buildFormData = (fields: Record<string, unknown>): FormData => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
        for (const item of Array.isArray(value) ? value : [value]) {
            if (item instanceof Blob) formData.append(key, item);
            else if (item !== undefined && item !== null) formData.append(key, serializeValue(item));
        }
    }
    return formData;
};

/**
 * Encodes the body the way the generated clients send it.
 */
const encodeBody = (route: RouteDefinition, body: unknown, headers: Headers): BodyInit => {
    const contentType = route.contentType ?? 'application/json';
    if (contentType === 'multipart/form-data') {
        return body instanceof FormData ? body : buildFormData(body as Record<string, unknown>);
    }
    if (!headers.has('content-type')) headers.set('content-type', contentType);
    if (contentType === 'application/x-www-form-urlencoded') return buildSearchParams(body as Record<string, unknown>);
    if (isJsonMediaType(contentType)) return JSON.stringify(body);
    return body as string | Uint8Array<ArrayBuffer>;
};

interface CallInput {
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: unknown;
    headers?: Record<string, unknown>;
}

const buildRequest = (route: RouteDefinition, args: CallInput): { request: Request; params: Record<string, string> } => {
    const params: Record<string, string> = {};
    const path = route.path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => {
        const value = args.params?.[name];
        if (value === undefined) throw new Error(`Missing path parameter: ${name}`);
        params[name] = serializeValue(value);
        return encodeURIComponent(params[name]);
    });
    const search = buildSearchParams(args.query ?? {}).toString();
    const headers = new Headers();
    for (const [name, value] of Object.entries(args.headers ?? {})) {
        if (value !== undefined && value !== null) headers.set(name, serializeValue(value));
    }
    const sendsBody = args.body !== undefined && route.method !== 'GET' && route.method !== 'HEAD';
    const request = new Request(`${TEST_ORIGIN}${path}${search === '' ? '' : `?${search}`}`, {
        method: route.method,
        headers,
        ...(sendsBody
            ? {
                  body: encodeBody(route, args.body, headers),
              }
            : {}),
    });
    return {
        request,
        params,
    };
};

/**
 * The fields a value carries that its schema does not declare, found as the
 * keys parsing drops.
 */
const undeclaredFields = (schema: z.ZodType, value: unknown): string[] => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) return [];
    const found: string[] = [];
    const walk = (sent: unknown, declared: unknown, path: string): void => {
        if (Array.isArray(sent) && Array.isArray(declared)) {
            sent.forEach((item, index) => walk(item, declared[index], `${path}[${index}]`));
            return;
        }
        if (!isPlainObject(sent) || !isPlainObject(declared)) return;
        for (const key of Object.keys(sent)) {
            const fieldPath = path === '' ? key : `${path}.${key}`;
            if (key in declared) walk(sent[key], declared[key], fieldPath);
            else found.push(fieldPath);
        }
    };
    walk(value, parsed.data, '');
    return found;
};

/**
 * Fails a call that answers what its route does not declare, the checks a
 * served route leaves to response validation or skips.
 */
const assertDeclared = (result: Extract<AdapterResult, { kind: 'success' }>): void => {
    const { routeKey, route, status, body } = result;
    const declared = route.responses[status];
    if (declared === undefined) {
        const guarded = resolveSecurityRequirements(route).length > 0;
        if (guarded && (status === 401 || status === 403)) return;
        throw new Error(`${routeKey} answered ${status}, which it does not declare.`);
    }
    if (status >= 400 || isStreamResponse(declared) || body === undefined) return;
    const schema = resolveResponseBody(declared);
    if (schema === undefined) return;
    const fields = undeclaredFields(schema, body);
    if (fields.length > 0) {
        throw new Error(`${routeKey} answered ${status} with fields its schema does not declare: ${fields.join(', ')}.`);
    }
};

interface TestResponse {
    status: number;
    body: unknown;
    headers: Record<string, string>;
}

const pipeline = defineAdapter<Request, TestResponse, {}, { request: Request }>({
    buildHandlerContext: () => ({}),
    respond: (result, { request }) => {
        if (result.kind === 'handler-error') throw result.error;
        if (result.kind === 'raw-response') throw new Error('A route answered with a raw response, which only plugin routes may.');
        if (result.kind === 'success') assertDeclared(result);
        const rendered = renderJsonResult(result, undefined, request, request.method);
        if (rendered.stream) {
            return {
                status: rendered.status,
                headers: rendered.headers,
                body: rendered.stream({
                    signal: request.signal,
                    validate: true,
                }),
            };
        }
        return {
            status: rendered.status,
            headers: rendered.headers,
            body: rendered.body === undefined || rendered.raw ? rendered.body : (JSON.parse(JSON.stringify(rendered.body)) as unknown),
        };
    },
});

interface ApiParts {
    guards: GuardMap<unknown> | undefined;
    schemes: Record<string, SecurityScheme> | undefined;
    requestContext: RequestContextMap<unknown> | undefined;
}

const apiParts = (api: ApiDefinition): ApiParts => {
    const carried = api as unknown as Record<symbol, unknown>;
    return {
        guards: carried[GUARDS_META] as GuardMap<unknown> | undefined,
        schemes: carried[SCHEMES_META] as Record<string, SecurityScheme> | undefined,
        requestContext: carried[REQUEST_CONTEXT_META] as RequestContextMap<unknown> | undefined,
    };
};

/**
 * Each identity the caller holds answers with what it was given, without
 * running its guard.
 */
const guardsFor = (guards: GuardMap<unknown> | undefined, caller: Record<string, unknown>): GuardMap<unknown> => {
    const replaced: GuardMap<unknown> = {
        ...guards,
    };
    for (const [identity, result] of Object.entries(caller)) {
        if (result !== undefined) replaced[identity] = () => result as Record<string, unknown>;
    }
    return replaced;
};

const buildTree = (
    routes: Routes,
    call: (routeKey: string, route: RouteDefinition, args: CallInput) => Promise<TestResponse>,
    prefix = ''
) => {
    const tree: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(routes)) {
        const routeKey = prefix === '' ? key : `${prefix}.${key}`;
        if (isRouteDefinition(value)) tree[key] = (args: CallInput = {}) => call(routeKey, value, args);
        else if (value && typeof value === 'object') tree[key] = buildTree(value as Routes, call, routeKey);
    }
    return tree;
};

/**
 * Calls an api's routes the way the generated clients do, through the whole
 * request pipeline, without a server. Every guard runs with no credential
 * until `as` names who is calling, and a call fails when the route answers a
 * status, or a field, it does not declare.
 *
 * @example
 * const api = createTestClient(config);
 *
 * const response = await api.as('user', { userId: '1' }).users.getUser({
 *     params: {
 *         id: '1',
 *     },
 * });
 */
export const createTestClient = <Api extends ApiDefinition>(
    config: {
        api: Api;
    },
    options: TestClientOptions<Api> = {}
): TestClient<Api> => {
    const { api } = config;
    const { guards, schemes, requestContext } = apiParts(api);
    const pluginExports = mergeDeep(pluginExportsOf(api), options.plugins ?? {}) as Record<string, unknown>;
    const realJobs = jobRunnerFrom((api as unknown as Record<symbol, unknown>)[JOBS_META] as JobsMeta | undefined);
    const jobs = (options.jobs === undefined ? realJobs : mergeDeep(realJobs, options.jobs)) as ReturnType<typeof jobRunnerFrom>;
    const routes = api.routes as Routes;
    const router = (api as unknown as Record<symbol, unknown>)[ROUTER_META] as Router<Routes, {}>;

    const clientAs = (caller: Record<string, unknown>): TestClient<Api> => {
        const callGuards = guardsFor(guards, caller);
        const call = async (routeKey: string, route: RouteDefinition, args: CallInput): Promise<TestResponse> => {
            const { request, params } = buildRequest(route, args);
            const url = new URL(request.url);
            const adapterRequest: AdapterRequest<Request> = {
                request,
                method: request.method,
                resolution: {
                    kind: 'pre-resolved',
                    routeKey,
                    route,
                    params,
                },
                query: entriesToObject(url.searchParams),
                headers: headersToObject(request.headers),
                readBody: (matched) => parseFetchBody(request, matched),
                readRawBody: () => request.text(),
            };
            return pipeline.handle({
                routes,
                router,
                request: adapterRequest,
                responseContext: {
                    request,
                },
                guards: callGuards,
                schemes,
                requestContext,
                pluginExports,
                jobs,
                responseValidation: true,
            });
        };
        return {
            ...buildTree(routes, call),
            as: (identity: string, result: unknown) =>
                clientAs({
                    ...caller,
                    [identity]: result,
                }),
        } as unknown as TestClient<Api>;
    };

    return clientAs({});
};

/**
 * What one caller meets at one route: the status the gate answers, or
 * `allowed` when it lets the call through.
 */
export type AccessOutcome = number | 'allowed';

/**
 * Who reaches every route, for each caller and for a caller with no
 * credential. Only the gate runs: guards, roles and `requires`, never a
 * handler. Snapshot the table, so a change to who may call a route shows up
 * in review.
 *
 * @example
 * test('who may call each route', async () => {
 *     expect(
 *         await accessMatrix(config, {
 *             owner: {
 *                 member: {
 *                     workspaceUserId: '1',
 *                     role: 'owner',
 *                 },
 *             },
 *         })
 *     ).toMatchSnapshot();
 * });
 */
export const accessMatrix = async <Api extends ApiDefinition, Callers extends Record<string, Caller<Api>>>(
    config: {
        api: Api;
    },
    callers: Callers
): Promise<Record<string, Record<'anonymous' | (keyof Callers & string), AccessOutcome>>> => {
    const { api } = config;
    const { guards, schemes, requestContext } = apiParts(api);
    const routes = flattenRoutes(api.routes as Routes);
    if (routes.length === 0) throw new Error('accessMatrix found no routes, so it would check nothing.');

    const everyone: Record<string, Record<string, unknown>> = {
        anonymous: {},
        ...callers,
    };
    const matrix: Record<string, Record<string, AccessOutcome>> = {};
    for (const { routeKey, route } of routes) {
        const row: Record<string, AccessOutcome> = {};
        for (const [name, caller] of Object.entries(everyone)) {
            const request = new Request(`${TEST_ORIGIN}${route.path}`, {
                method: route.method,
            });
            const gate = await runGate({
                routeKey,
                route,
                params: {},
                request: {
                    request,
                    method: route.method,
                    resolution: {
                        kind: 'pre-resolved',
                        routeKey,
                        route,
                        params: {},
                    },
                    query: {},
                    headers: {},
                    readBody: () => undefined,
                },
                handlerContext: {},
                guards: guardsFor(guards, caller),
                schemes,
                contextResolvers: requestContext,
                responseValidation: false,
            });
            row[name] = gate.kind === 'allowed' ? 'allowed' : gate.status;
        }
        matrix[routeKey] = row;
    }
    return matrix as Record<string, Record<'anonymous' | (keyof Callers & string), AccessOutcome>>;
};
