import { z } from 'zod';
import type { RouteDefinition, RouteToolOptions, Routes } from './types.js';
import { flattenRoutes, type FlattenedRoute } from './handler-pipeline.js';
import { parsePath } from './path-params.js';
import { resolveSecurityRequirements } from './security-scheme.js';
import { routeStreams } from './stream.js';
import { deriveToolNames } from './tool-name.js';
import { isVoidSchema, readObjectShape } from './zod-internals.js';

/**
 * What a route says about publishing itself, or `undefined` when it says
 * nothing.
 */
export const toolOptionsOf = (route: RouteDefinition): RouteToolOptions | undefined => {
    if (route.tool === undefined || route.tool === false) return undefined;
    return route.tool === true ? {} : route.tool;
};

/**
 * Why a route cannot run as a tool, or `undefined` when it can.
 */
export const toolRefusal = (route: RouteDefinition): string | undefined => {
    if (route.hidden === true) return 'it is hidden, and a hidden route never publishes';
    if (route.contentType !== undefined && route.contentType !== 'application/json') {
        return `it takes a ${route.contentType} body, and tool input is JSON`;
    }
    if (routeStreams(route)) return 'it streams, and a tool result is one value';
    return undefined;
};

/**
 * The routes a model may call: the ones that declared `tool`, less the ones
 * whose shape a tool call cannot carry.
 */
export const selectToolRoutes = (routes: FlattenedRoute[]): FlattenedRoute[] =>
    routes.filter(({ route }) => toolOptionsOf(route) !== undefined && toolRefusal(route) === undefined);

const describeRoles = (route: RouteDefinition): string | undefined =>
    route.roles !== undefined && route.roles.length > 0 ? `Roles: ${route.roles.join(', ')}` : undefined;

const describeRequires = (route: RouteDefinition): string | undefined => {
    const requires = route.requires;
    if (requires === undefined) return undefined;
    const names = Object.entries(requires).flatMap(([resource, verbs]) => verbs.map((verb) => `${resource}:${verb}`));
    return names.length > 0 ? `Permissions: ${names.join(', ')}` : undefined;
};

/**
 * What a model reads before it calls the route.
 */
export const describeTool = (route: RouteDefinition): string => {
    const parts: string[] = [];
    const declared = toolOptionsOf(route)?.description;
    if (declared) parts.push(declared);
    else if (route.summary) parts.push(route.summary);
    if (route.description) parts.push(route.description);
    if (parts.length === 0) parts.push(`${route.method} ${route.path}`);
    parts.push(`\nHTTP: ${route.method} ${route.path}`);

    const requirements = resolveSecurityRequirements(route);
    if (requirements.length > 0) {
        parts.push(`Requires: ${requirements.map(({ scheme }) => scheme).join(', ')}`);
    }
    const roles = describeRoles(route);
    if (roles !== undefined) parts.push(roles);
    const permissions = describeRequires(route);
    if (permissions !== undefined) parts.push(permissions);

    return parts.join('\n');
};

export interface ToolInputSchema {
    shape: Record<string, z.ZodType> | undefined;
    hasParams: boolean;
    hasQuery: boolean;
    hasBody: boolean;
}

/**
 * The `{ params, query, body }` a model sends to call the route.
 */
export const buildToolInputSchema = (route: RouteDefinition): ToolInputSchema => {
    const shape: Record<string, z.ZodType> = {};
    let hasParams = false;
    let hasQuery = false;
    let hasBody = false;

    const paramNames = parsePath(route.path).paramNames;
    if (paramNames.length > 0) {
        hasParams = true;
        const paramShape: Record<string, z.ZodType> = {};
        const explicitShape = (route.pathParams ? readObjectShape(route.pathParams) : undefined) as Record<string, z.ZodType> | undefined;
        for (const name of paramNames) {
            paramShape[name] = explicitShape?.[name] ?? z.string();
        }
        shape['params'] = z.object(paramShape);
    }

    if (route.query) {
        hasQuery = true;
        shape['query'] = route.query.safeParse({}).success ? route.query.optional() : route.query;
    }

    if (route.body && !isVoidSchema(route.body)) {
        hasBody = true;
        shape['body'] = route.body.safeParse(undefined).success ? route.body.optional() : route.body;
    }

    return {
        shape: Object.keys(shape).length === 0 ? undefined : shape,
        hasParams,
        hasQuery,
        hasBody,
    };
};

/**
 * One route as a model sees it.
 */
export interface ToolDefinition {
    /**
     * What the model calls it, e.g. `users_list_users`.
     */
    name: string;
    /**
     * What the stream events call it, e.g. `users.listUsers`.
     */
    key: string;
    description: string;
    /**
     * The `{ params, query, body }` it takes, as JSON Schema.
     */
    inputSchema: Record<string, unknown>;
}

const toJsonSchema = (route: RouteDefinition): Record<string, unknown> => {
    const { shape } = buildToolInputSchema(route);
    const { $schema: _, ...schema } = z.toJSONSchema(z.object(shape ?? {}), {
        io: 'input',
        unrepresentable: 'any',
        override: ({ jsonSchema }) => {
            delete jsonSchema.brand;
        },
    }) as Record<string, unknown>;
    return schema;
};

/**
 * One {@link ToolDefinition} per route.
 */
export const buildToolDefinitions = (routes: Routes): ToolDefinition[] => {
    const entries = flattenRoutes(routes);
    const names = deriveToolNames(
        entries.map(({ routeKey }) => ({
            key: routeKey,
            origin: 'route',
        }))
    );

    return entries.map(({ routeKey, route }) => ({
        name: names.get(routeKey)!,
        key: routeKey,
        description: describeTool(route),
        inputSchema: toJsonSchema(route),
    }));
};
