import type { z } from 'zod';
import { ROUTES_GROUP, type Routes, type RouteDefinition, type ResponseDefinition } from './types.js';
import { isRouteDefinition } from './handler-pipeline.js';
import { findCoercedSchemaPath, readObjectShape, resolveBaseType } from './zod-internals.js';
import { resolveCoercionPlans } from './coercion.js';
import { parsePath, type PathParamsCheck } from './path-params.js';
import { isStreamResponse, isZodSchema } from './generator-utils.js';
import { assertValidStreams, streamSchemas } from './stream.js';
import { expandStreamTools } from './tool-events.js';

const isEmptyObjectSchema = (schema: unknown): boolean => {
    if (!schema || typeof schema !== 'object') return false;
    const candidate = schema as Record<string, unknown>;
    return typeof candidate.shape === 'object' && candidate.shape !== null && Object.keys(candidate.shape as object).length === 0;
};

const responseSchemas = (response: ResponseDefinition): z.core.$ZodType[] => {
    if (isZodSchema(response)) return [response];
    if (isStreamResponse(response)) return streamSchemas(response.stream);
    return [response.body];
};

/**
 * Throws if any of a route's schemas use `z.coerce`. Built-in query/path/header
 * coercion makes it redundant.
 */
const assertNoCoercion = (route: RouteDefinition, routeKey: string): void => {
    const targets: Array<[string, z.core.$ZodType | undefined]> = [
        ['body', route.body],
        ['query', route.query],
        ['pathParams', route.pathParams],
        ['headers', route.headers],
    ];
    for (const [status, response] of Object.entries(route.responses)) {
        for (const schema of responseSchemas(response)) {
            targets.push([`responses.${status}`, schema]);
        }
    }
    for (const [field, schema] of targets) {
        if (!schema) continue;
        const coercedPath = findCoercedSchemaPath(schema);
        if (coercedPath === undefined) continue;
        const location = coercedPath ? `${field}.${coercedPath}` : field;
        throw new Error(
            `Route "${routeKey}" uses z.coerce at "${location}". z.coerce is not allowed in a kizuna route.\n` +
                `kizuna automatically coerces query, path, and header params to their declared types for you, ` +
                `so use z.number(), z.date(), or z.bigint() instead.`
        );
    }
};

/**
 * Throws when a route's `pathParams` keys and its path's `:param` placeholders
 * disagree. Unchecked, the stray key is dropped from the OpenAPI document and
 * the handler validates params the request never carries.
 */
const assertPathParamsMatchPath = (route: RouteDefinition, routeKey: string): void => {
    const shape = route.pathParams ? readObjectShape(route.pathParams) : undefined;
    if (!shape) return;
    const declared = Object.keys(shape);
    const { paramNames } = parsePath(route.path);
    const unmatched = declared.filter((name) => !paramNames.includes(name));
    const undeclared = paramNames.filter((name) => !declared.includes(name));
    if (unmatched.length === 0 && undeclared.length === 0) return;
    const details = [
        unmatched.length > 0 ? `declared in pathParams but not in the path: ${unmatched.join(', ')}` : undefined,
        undeclared.length > 0 ? `in the path but not declared in pathParams: ${undeclared.join(', ')}` : undefined,
    ].filter((detail) => detail !== undefined);
    throw new Error(`Route "${routeKey}" has pathParams that do not match its path "${route.path}": ${details.join('; ')}.`);
};

const STRUCTURED_TYPES: ReadonlySet<string> = new Set(['object', 'array', 'record', 'tuple', 'map', 'set']);

/**
 * Throws when a path parameter is declared as a structured type. A path segment
 * arrives as one string, so these are not supported.
 */
const assertPathParamsAreScalar = (route: RouteDefinition, routeKey: string): void => {
    const shape = route.pathParams ? readObjectShape(route.pathParams) : undefined;
    if (!shape) return;
    for (const [name, fieldSchema] of Object.entries(shape)) {
        const baseType = resolveBaseType(fieldSchema);
        if (!STRUCTURED_TYPES.has(baseType)) continue;
        throw new Error(
            `Route "${routeKey}" declares path parameter "${name}" as ${baseType}. ` +
                `A path parameter arrives as a single string, so this is not supported.\n` +
                `Use a scalar schema (z.string(), z.int(), z.uuid(), z.enum([...])), move the value to query, ` +
                `or parse it yourself with z.string().transform(...).`
        );
    }
};

/**
 * A tool's description is the one thing a model reads before choosing it, so a
 * route that publishes as one has to carry it.
 */
const assertToolDescribed = (route: RouteDefinition, routeKey: string): void => {
    if (route.tool === undefined || route.tool === false) return;
    const described = route.tool === true ? route.summary : (route.tool.description ?? route.summary);
    if (described) return;
    throw new Error(
        `Route "${routeKey}" declares \`tool\` but describes nothing. A model reads the description before it calls, ` +
            'so give the route a `summary`, or `tool: { description }`.'
    );
};

const validateRoutes = (routes: Routes, prefix?: string): void => {
    for (const [key, value] of Object.entries(routes)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (isRouteDefinition(value)) {
            if (isEmptyObjectSchema(value.body)) {
                throw new Error(`Route "${fullKey}" has an empty body schema (z.object({})). Use z.void() or omit the body field.`);
            }
            expandStreamTools(value, fullKey);
            assertPathParamsMatchPath(value, fullKey);
            assertPathParamsAreScalar(value, fullKey);
            assertNoCoercion(value, fullKey);
            assertValidStreams(value, fullKey);
            assertToolDescribed(value, fullKey);
            resolveCoercionPlans(value);
        } else if (value && typeof value === 'object') {
            validateRoutes(value as Routes, fullKey);
        }
    }
};

const isDeclared = (value: unknown): boolean => typeof value === 'object' && value !== null && ROUTES_GROUP in value;

const groupOf = (value: unknown): string | undefined =>
    isDeclared(value) ? (value as Record<typeof ROUTES_GROUP, string>)[ROUTES_GROUP] : undefined;

/**
 * Throw on a grouped tree nested inside another. It belongs in `defineConfig`'s
 * list.
 */
const assertNoGroupInside = (routes: Routes, prefix?: string): void => {
    for (const [key, value] of Object.entries(routes)) {
        if (isRouteDefinition(value) || !value || typeof value !== 'object') continue;
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const group = groupOf(value);
        if (group !== undefined && group !== '') {
            throw new Error(
                `"${fullKey}" was declared into the group ${group}, so its key comes from there. List it in defineConfig's \`routes\` instead of nesting it.`
            );
        }
        assertNoGroupInside(value as Routes, fullKey);
    }
};

/**
 * Validate a tree of routes and stamp its group's path, `''` for none.
 */
export function groupRoutes<const T extends Routes>(routes: T & PathParamsCheck<T>): T;
export function groupRoutes<const T extends Routes>(group: string, routes: T & PathParamsCheck<T>): T;
export function groupRoutes(first: string | Routes, second?: Routes): Routes {
    const routes = typeof first === 'string' ? second! : first;
    assertNoGroupInside(routes);
    (routes as Record<typeof ROUTES_GROUP, string>)[ROUTES_GROUP] = typeof first === 'string' ? first : '';
    validateRoutes(routes);
    return routes;
}

/**
 * Merge `source` into `target`, throwing when both hold the same key.
 */
const mergeRoutes = (target: Routes, source: Routes, path: string): void => {
    for (const [key, value] of Object.entries(source)) {
        const fullKey = path === '' ? key : `${path}.${key}`;
        const existing = target[key];
        if (existing === undefined) {
            target[key] = value;
            continue;
        }
        if (isRouteDefinition(existing) || isRouteDefinition(value)) {
            throw new Error(`Two routes claim the key "${fullKey}". Rename one, or declare it into another group.`);
        }
        // A spread keeps the group symbol.
        const merged: Routes = {
            ...existing,
        };
        mergeRoutes(merged, value as Routes, fullKey);
        target[key] = merged;
    }
};

/**
 * The route tree a list of declared trees makes, each at its group's path.
 */
export const assembleRoutes = (declared: readonly Routes[]): Routes => {
    const root: Routes = {};
    for (const entry of declared) {
        // A plain object is routes in no group.
        const routes = isDeclared(entry) ? entry : groupRoutes(entry);
        const group = (routes as Record<typeof ROUTES_GROUP, string>)[ROUTES_GROUP];
        let node = root;
        let path = '';
        for (const segment of group === '' ? [] : group.split('.')) {
            path = path === '' ? segment : `${path}.${segment}`;
            const existing = node[segment];
            if (isRouteDefinition(existing)) {
                throw new Error(`The route "${path}" sits where the group ${group} needs its key. Rename the route, or the group.`);
            }
            if (existing === undefined) node[segment] = {};
            node = node[segment] as Routes;
        }
        if (group !== '') (node as Record<typeof ROUTES_GROUP, string>)[ROUTES_GROUP] = group;
        mergeRoutes(node, routes, path);
    }
    return root;
};
