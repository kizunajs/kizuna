import type { Contract, RouteDefinition, Routes } from '@ts-kizuna/core';
import {
    isStreamResponse,
    resolveResponseBody,
    resolveResponseHeaders,
    streamContentType,
    toPascalCase,
    type StreamMode,
} from '@ts-kizuna/core/generator';
import { TypeCollector, typeOf } from './zod-to-typescript.js';

/**
 * What a generated client is called and where its runtime comes from.
 */
export interface FetchClientOptions {
    /**
     * Module the generated file imports its runtime from.
     *
     * @default '@ts-kizuna/fetch'
     */
    runtimeModule?: string;
    /**
     * Command the file's header tells a reader to run.
     *
     * @default 'kizuna generate'
     */
    regenerateCommand?: string;
}

const indent = (text: string, depth = 1): string =>
    text
        .split('\n')
        .map((line) => (line.length > 0 ? '    '.repeat(depth) + line : line))
        .join('\n');

const pathParamNames = (path: string): string[] => [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => match[1] ?? '');

const streamBody = (mode: StreamMode): string => {
    if (mode === 'binary') return 'AsyncIterable<Uint8Array>';
    if (mode === 'text') return 'AsyncIterable<string>';
    return 'AsyncIterable<{ event?: string; data: string; id?: string; retry?: number }>';
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

    if (route.body) {
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

    const results = Object.entries(route.responses).map(([status, response]) => {
        const headers = resolveResponseHeaders(response);
        const headerType = headers ? typeOf(headers, collector, `${namespace}${status}Headers`) : 'Record<string, string>';

        if (isStreamResponse(response)) {
            const mode: StreamMode = streamContentType(response).includes('event-stream')
                ? 'events'
                : streamContentType(response).startsWith('text/')
                  ? 'text'
                  : 'binary';
            return `{ status: ${status}; body: ${streamBody(mode)}; headers: ${headerType} }`;
        }

        const schema = resolveResponseBody(response);
        const body = schema ? typeOf(schema, collector, `${namespace}${status}`) : 'undefined';
        return `{ status: ${status}; body: ${body}; headers: ${headerType} }`;
    });

    members.push(`export type Result =\n${indent(results.map((result) => `| ${result}`).join('\n'))};`);

    const argsType = `{\n${indent(args.map((arg) => `${arg};`).join('\n'))}\n}`;
    const optional = args.every((arg) => arg.includes('?:'));

    const tableEntries = [`method: '${route.method}'`, `path: '${route.path}'`];
    if (route.contentType) tableEntries.push(`contentType: '${route.contentType}'`);
    const responses = Object.entries(route.responses).map(([status, response]) =>
        isStreamResponse(response) ? `${status}: { stream: { contentType: '${streamContentType(response)}' } }` : `${status}: {}`
    );
    tableEntries.push(`responses: {\n${indent(responses.map((entry) => `${entry},`).join('\n'))}\n}`);

    return {
        namespace,
        signature: `${key}(args${optional ? '?' : ''}: ${argsType}): Promise<API.${namespace}.Result>;`,
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
 * Renders a TypeScript client from a contract: its named types, the route table
 * the runtime reads, and a `createClient` typed against both.
 */
export const generateFetchClient = (contract: Contract, options: FetchClientOptions = {}): string => {
    const { runtimeModule = '@ts-kizuna/fetch', regenerateCommand = 'kizuna generate' } = options;
    const collector = new TypeCollector();
    const tree = emitTree(contract.routes, '', collector);

    const models = collector.all().map((model) => {
        const doc = model.description ? `/**\n * ${model.description}\n */\n` : '';
        return `${doc}export type ${model.name} = ${model.body};`;
    });

    const api = [...models, ...tree.declarations].join('\n\n');

    return `/* eslint-disable */
/**
 * Generated by @ts-kizuna/fetch. Do not edit.
 *
 * Regenerate: ${regenerateCommand}
 */
import { createGeneratedClient, type ClientConfig, type GeneratedRoutes } from '${runtimeModule}';

export namespace API {
${indent(api)}
}

export interface Client {
${indent(tree.signatures)}
}

const routes: GeneratedRoutes = {
${indent(tree.table)}
};

/**
 * A client for this API. Pass the base URL and anything else the runtime takes.
 */
export const createClient = (config: ClientConfig): Client => createGeneratedClient(routes, config) as unknown as Client;
`;
};
