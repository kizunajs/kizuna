import type { z } from 'zod';
import type { ApiDefinition, RouteDefinition, Routes } from 'kizunajs';
import { ValidationErrorSchema } from 'kizunajs/schemas';
import {
    isStreamResponse,
    isVoidSchema,
    readObjectShape,
    resolveResponseBody,
    resolveResponseHeaders,
    streamContentType,
    toPascalCase,
    unwrapOptionalWrappers,
    type StreamMode,
} from 'kizunajs/generator';
import { TypeCollector, docComment, sampleObject, sampleValue, typeOf } from './zod-to-typescript.js';

/**
 * What a generated client is called and where its runtime comes from.
 */
export interface FetchClientOptions {
    /**
     * Module the generated file imports its runtime from.
     *
     * @default '@kizunajs/fetch'
     */
    runtimeModule?: string;
    /**
     * Command the file's header tells a reader to run.
     *
     * @default 'kizuna generate'
     */
    regenerateCommand?: string;
    /**
     * Path to the api this was generated from, relative to the generated
     * file. Named in the header so tooling can tell when the client has fallen
     * behind, and so a reader knows where the API is declared.
     */
    source?: string;
}

const indent = (text: string, depth = 1): string =>
    text
        .split('\n')
        .map((line) => (line.length > 0 ? '    '.repeat(depth) + line : line))
        .join('\n');

const pathParamNames = (path: string): string[] => [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => match[1] ?? '');

/**
 * One server-sent event, typed from what the response declares. A record of
 * event name to schema becomes a union discriminated on `event`; a single
 * schema is the only shape a message takes.
 */
const eventUnion = (stream: unknown, collector: TypeCollector, namespace: string): string => {
    const frame = 'id?: string; retry?: number';
    if (stream && typeof stream === 'object' && !('_zod' in stream) && !('_def' in stream)) {
        const arms = Object.entries(stream as Record<string, unknown>).map(
            ([event, schema]) =>
                `{ event: '${event}'; data: ${typeOf(schema as never, collector, `${namespace}${toPascalCase(event)}`)}; ${frame} }`
        );
        return arms.length > 0 ? arms.join(' | ') : `{ event?: string; data: string; ${frame} }`;
    }
    return `{ event?: string; data: ${typeOf(stream as never, collector, `${namespace}Message`)}; ${frame} }`;
};

const streamBody = (mode: StreamMode, stream: unknown, collector: TypeCollector, namespace: string): string => {
    if (mode === 'binary') return 'AsyncIterable<Uint8Array>';
    if (mode === 'text') return 'AsyncIterable<string>';
    return `AsyncIterable<${eventUnion(stream, collector, namespace)}>`;
};

interface RouteEmit {
    /**
     * `UsersGetUser`.
     */
    namespace: string;
    /**
     * The method signature this route contributes to the client tree.
     */
    signature: string;
    declaration: string;
    table: string;
}

/**
 * The call a route's `@example` shows: the arguments it cannot be called
 * without, filled with values of the shape each schema declares.
 */
const exampleCall = (routeKey: string, route: RouteDefinition): string => {
    const entries: string[] = [];
    const params = pathParamNames(route.path);
    if (params.length > 0) {
        const shape = route.pathParams ? readObjectShape(route.pathParams) : undefined;
        const fields = params.map((name) => {
            const declared = shape?.[name];
            return `${name}: ${declared ? sampleValue(declared, 0, name) : "'1'"},`;
        });
        entries.push(`params: {\n${indent(fields.join('\n'))}\n},`);
    }
    if (route.query && requiresArgument(route.query)) entries.push(`query: ${sampleObject(route.query)},`);
    if (route.body && !isVoidSchema(route.body) && requiresArgument(route.body)) {
        entries.push(`body: ${sampleValue(route.body)},`);
    }

    const args = entries.length > 0 ? `{\n${indent(entries.join('\n'))}\n}` : '';
    return `const result = await client.${routeKey}(${args});`;
};

/**
 * Whether a schema has anything a caller has to pass, so a route whose query is
 * every-field-optional keeps its example to the call itself.
 */
const requiresArgument = (schema: z.core.$ZodType): boolean => {
    const shape = readObjectShape(schema);
    if (!shape) return true;
    return Object.values(shape).some((field) => !unwrapOptionalWrappers(field).optional);
};

/**
 * What an editor shows above a client method: what the route is for, whether it
 * is on its way out, and how it is called.
 */
const routeDoc = (routeKey: string, route: RouteDefinition): string => {
    const lines: string[] = [];
    if (route.summary) lines.push(route.summary);
    if (route.description) {
        if (lines.length > 0) lines.push('');
        lines.push(route.description);
    }

    if (route.deprecated !== undefined && route.deprecated !== false) {
        const message =
            typeof route.deprecated === 'string'
                ? route.deprecated
                : typeof route.deprecated === 'object'
                  ? route.deprecated.message
                  : undefined;
        if (lines.length > 0) lines.push('');
        lines.push(`@deprecated ${message ?? ''}`.trimEnd());
    }

    if (lines.length > 0) lines.push('');
    lines.push('@example', exampleCall(routeKey, route));
    return docComment(lines);
};

const emitRoute = (routeKey: string, key: string, route: RouteDefinition, collector: TypeCollector): RouteEmit => {
    const namespace = routeKey.split('.').map(toPascalCase).join('');
    const members: string[] = [];
    const args: string[] = [];

    const params = pathParamNames(route.path);
    if (params.length > 0) {
        const body = route.pathParams
            ? typeOf(route.pathParams, collector, `${namespace}Params`)
            : `{\n${indent(params.map((name) => `${name}: string;`).join('\n'))}\n}`;
        members.push(`export type Params = ${body};`);
        args.push(`params: API.${namespace}.Params`);
    }

    if (route.query) {
        members.push(`export type Query = ${typeOf(route.query, collector, `${namespace}Query`)};`);
        args.push(`query?: API.${namespace}.Query`);
    }

    if (route.body && !isVoidSchema(route.body)) {
        members.push(`export type Body = ${typeOf(route.body, collector, `${namespace}Body`)};`);
        args.push(`body: API.${namespace}.Body`);
    }

    if (route.headers) {
        members.push(`export type Headers = ${typeOf(route.headers, collector, `${namespace}Headers`)};`);
        args.push(`headers?: API.${namespace}.Headers`);
    } else {
        args.push('headers?: Record<string, string>');
    }

    args.push('fetchOptions?: RequestInit');

    // The route tree never carries the automatic 400, so the union adds it here.
    const validates = route.body !== undefined || route.query !== undefined;
    const declaredBadRequest = Object.keys(route.responses).includes('400');
    const validationBody = validates ? typeOf(ValidationErrorSchema, collector, 'ValidationError') : undefined;

    const results = Object.entries(route.responses).map(([status, response]) => {
        const headers = resolveResponseHeaders(response);
        const headerType = headers ? typeOf(headers, collector, `${namespace}${status}Headers`) : 'Record<string, string>';

        if (isStreamResponse(response)) {
            const mode: StreamMode = streamContentType(response).includes('event-stream')
                ? 'events'
                : streamContentType(response).startsWith('text/')
                  ? 'text'
                  : 'binary';
            return `{ status: ${status}; body: ${streamBody(mode, (response as { stream?: unknown }).stream, collector, `${namespace}${status}`)}; headers: ${headerType} }`;
        }

        const schema = resolveResponseBody(response);
        const body = schema ? typeOf(schema, collector, `${namespace}${status}`) : 'undefined';
        const widened = status === '400' && validationBody ? `${body} | ${validationBody}` : body;
        return `{ status: ${status}; body: ${widened}; headers: ${headerType} }`;
    });

    if (validationBody && !declaredBadRequest) {
        results.push(`{ status: 400; body: ${validationBody}; headers: Record<string, string> }`);
    }

    members.push(`export type Result =\n${indent(results.map((result) => `| ${result}`).join('\n'))};`);

    const argsType = `{\n${indent(args.map((arg) => `${arg};`).join('\n'))}\n}`;

    const tableEntries = [`method: '${route.method}'`, `path: '${route.path}'`];
    if (route.contentType) tableEntries.push(`contentType: '${route.contentType}'`);
    const responses = Object.entries(route.responses).map(([status, response]) =>
        isStreamResponse(response) ? `${status}: { stream: { contentType: '${streamContentType(response)}' } }` : `${status}: {}`
    );
    tableEntries.push(`responses: {\n${indent(responses.map((entry) => `${entry},`).join('\n'))}\n}`);

    const streams = Object.values(route.responses).some((response) => isStreamResponse(response));

    return {
        namespace,
        signature: `${routeDoc(routeKey, route)}${key}: ClientMethod<'${route.method}', ${streams}, ${argsType}, API.${namespace}.Result>;`,
        declaration: `export namespace ${namespace} {\n${indent(members.join('\n\n'))}\n}`,
        table: `${key}: {\n${indent(tableEntries.map((entry) => `${entry},`).join('\n'))}\n},`,
    };
};

const isRoute = (value: unknown): value is RouteDefinition =>
    !!value && typeof value === 'object' && typeof (value as RouteDefinition).method === 'string';

interface TreeEmit {
    signatures: string;
    table: string;
    declarations: string[];
}

const emitTree = (routes: Routes, prefix: string, collector: TypeCollector): TreeEmit => {
    const signatures: string[] = [];
    const tables: string[] = [];
    const declarations: string[] = [];

    for (const key of Object.keys(routes)) {
        const node = routes[key];
        const routeKey = prefix ? `${prefix}.${key}` : key;

        if (isRoute(node)) {
            const emitted = emitRoute(routeKey, key, node, collector);
            signatures.push(emitted.signature);
            tables.push(emitted.table);
            declarations.push(emitted.declaration);
            continue;
        }

        if (node && typeof node === 'object') {
            const group = emitTree(node as Routes, routeKey, collector);
            signatures.push(`${key}: {\n${indent(group.signatures)}\n};`);
            tables.push(`${key}: {\n${indent(group.table)}\n},`);
            declarations.push(...group.declarations);
        }
    }

    return {
        signatures: signatures.join('\n'),
        table: tables.join('\n'),
        declarations,
    };
};

/**
 * Renders a TypeScript client from an api: its named types, the route table
 * the runtime reads, and a `createClient` typed against both.
 */
/**
 * The headers a request context declares, as one interface the caller fills
 * once. Absent when the API declares no request context that reads headers.
 */
const emitRequestContext = (contract: ApiDefinition, collector: TypeCollector): string | undefined => {
    const declarations = Object.values(contract.requestContext ?? {});
    const fields: string[] = [];
    for (const declaration of declarations) {
        const headers = (declaration as { headers?: unknown }).headers;
        if (!headers) continue;
        const rendered = typeOf(headers as never, collector, 'RequestContext');
        const inner = rendered
            .trim()
            .replace(/^\{/, '')
            .replace(/\}$/, '')
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line !== '')
            .join('\n');
        if (inner !== '') fields.push(inner);
    }
    return fields.length > 0 ? `export interface RequestContext {\n${indent(fields.join('\n'))}\n}` : undefined;
};

export const generateFetchClient = (contract: ApiDefinition, options: FetchClientOptions = {}): string => {
    const { runtimeModule = '@kizunajs/fetch', regenerateCommand = 'kizuna generate', source } = options;
    const collector = new TypeCollector();
    const tree = emitTree(contract.routes, '', collector);

    const models = collector.all().map((model) => {
        const doc = model.description ? `/**\n * ${model.description}\n */\n` : '';
        return `${doc}export type ${model.name} = ${model.body};`;
    });

    const api = [...models, ...tree.declarations].join('\n\n');
    const requestContext = emitRequestContext(contract, collector);

    const header = [
        ' * Generated by @kizunajs/fetch. Do not edit.',
        ' *',
        ...(source === undefined ? [] : [` * Source: ${source}`]),
        ` * Regenerate: ${regenerateCommand}`,
    ].join('\n');

    return `/* eslint-disable */
/**
${header}
 */
import { createGeneratedClient, type ClientConfig, type ClientMethod, type GeneratedRoutes } from '${runtimeModule}';

export namespace API {
${indent(api)}
}

export interface Client {
${indent(tree.signatures)}
}

const routes: GeneratedRoutes = {
${indent(tree.table)}
};

${
    requestContext === undefined
        ? `/**
 * A client for this API. Pass the base URL and anything else the runtime takes.
 */
export const createClient = (config: ClientConfig): Client => createGeneratedClient(routes, config) as unknown as Client;`
        : `${requestContext}

/**
 * A client for this API. Pass the base URL, the request context headers this
 * API declares, and anything else the runtime takes.
 */
export const createClient = (config: ClientConfig & { requestContext?: RequestContext }): Client =>
    createGeneratedClient(routes, config) as unknown as Client;`
}
`;
};
