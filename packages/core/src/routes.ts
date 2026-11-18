import type { z } from 'zod';
import { ROUTES_GROUP, type Routes, type RouteDefinition, type ResponseDefinition } from './types.js';
import { isRouteDefinition } from './handler-pipeline.js';
import {
    findCoercedSchemaPath,
    findSelfReferenceIssue,
    isBinarySchema,
    isFileSchema,
    isVoidSchema,
    readDef,
    readDefType,
    readObjectShape,
    resolveBaseType,
    unwrapOptionalWrappers,
    type SelfReferenceIssue,
} from './zod-internals.js';
import { resolveCoercionPlans } from './coercion.js';
import { parsePath, type PathParamsCheck } from './path-params.js';
import { isJsonQueryField, isStreamResponse, isZodSchema } from './generator-utils.js';
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
 * Every schema a route declares, each with where it sits.
 */
const schemasOf = (route: RouteDefinition): Array<[string, z.core.$ZodType]> => {
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
    return targets.filter((target): target is [string, z.core.$ZodType] => target[1] !== undefined);
};

/**
 * Throws if any of a route's schemas use `z.coerce`. Built-in query/path/header
 * coercion makes it redundant.
 */
const assertNoCoercion = (route: RouteDefinition, routeKey: string): void => {
    for (const [field, schema] of schemasOf(route)) {
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

const selfReferenceMessage = (routeKey: string, location: string, kind: SelfReferenceIssue['kind']): string => {
    if (kind === 'lazy') {
        return (
            `Route "${routeKey}" uses z.lazy at "${location}", which has no type a client can name.\n` +
            'Make the schema a Kizuna.model and refer to it with a getter:\n' +
            '    get replies() {\n' +
            '        return z.array(CommentSchema);\n' +
            '    },'
        );
    }
    if (kind === 'unnamed') {
        return (
            `Route "${routeKey}" holds a schema inside itself at "${location}". A client can only refer to a schema by its name, ` +
            "so wrap it in Kizuna.model({ title: 'Comment', schema: ... })."
        );
    }
    return (
        `Route "${routeKey}" holds a model directly inside itself at "${location}". A Swift struct cannot contain itself, ` +
        'so hold it in a list, or hold its id.'
    );
};

/**
 * Throws when a schema holds itself in a way no client can write.
 */
const assertSelfReferencesNamed = (route: RouteDefinition, routeKey: string): void => {
    for (const [field, schema] of schemasOf(route)) {
        const issue = findSelfReferenceIssue(schema);
        if (issue === undefined) continue;
        throw new Error(selfReferenceMessage(routeKey, issue.path ? `${field}.${issue.path}` : field, issue.kind));
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
 * The options of a union, nested ones included, or the field alone. A query,
 * path, header or form field is sent as text, so each option has to be.
 */
const optionsOf = (schema: z.core.$ZodType): z.core.$ZodType[] => {
    const def = readDef(unwrapOptionalWrappers(schema).inner);
    return def.type === 'union' ? (def.options ?? []).flatMap(optionsOf) : [schema];
};

/**
 * Throws when a path parameter is declared as a structured type. A path segment
 * arrives as one string, so these are not supported.
 */
const assertPathParamsAreScalar = (route: RouteDefinition, routeKey: string): void => {
    const shape = route.pathParams ? readObjectShape(route.pathParams) : undefined;
    if (!shape) return;
    for (const [name, fieldSchema] of Object.entries(shape)) {
        if (optionsOf(fieldSchema).every((option) => !STRUCTURED_TYPES.has(resolveBaseType(option)))) continue;
        throw new Error(
            `Route "${routeKey}" declares path parameter "${name}" as ${describeField(fieldSchema)}. ` +
                `A path parameter arrives as a single string, so this is not supported.\n` +
                `Use a scalar schema (z.string(), z.int(), z.uuid(), z.enum([...])), move the value to query, ` +
                `or parse it yourself with z.string().transform(...).`
        );
    }
};

/**
 * What a field holds once optional and default wrappers are peeled away: a schema kind, or a file or bytes.
 */
const fieldKind = (schema: z.core.$ZodType): string => {
    const { inner } = unwrapOptionalWrappers(schema);
    if (isFileSchema(inner)) return 'file';
    if (isBinarySchema(inner)) return 'BinarySchema';
    return resolveBaseType(inner);
};

const listElement = (schema: z.core.$ZodType): z.core.$ZodType | undefined => {
    const def = readDef(unwrapOptionalWrappers(schema).inner);
    return def.type === 'array' ? def.element : undefined;
};

const isValue = (kind: string): boolean => !STRUCTURED_TYPES.has(kind) && kind !== 'file' && kind !== 'BinarySchema';

/**
 * Names a field the way an error shows it: its kind, what a list holds, or the
 * option of a union that cannot be sent.
 */
const describeField = (schema: z.core.$ZodType): string => {
    const options = optionsOf(schema);
    if (options.length > 1) {
        const unsendable = options.find((option) => !isValue(fieldKind(option))) ?? options[0]!;
        return `a union holding ${describeField(unsendable)}`;
    }
    const element = listElement(schema);
    return element === undefined ? fieldKind(schema) : `array of ${describeField(element)}`;
};

const fieldsOf = (schema: z.ZodType | undefined): [string, z.core.$ZodType][] => Object.entries((schema && readObjectShape(schema)) ?? {});

/**
 * A query string carries values and lists of values in OpenAPI's default `form` style. Anything else travels
 * as one JSON text. Only a file cannot be sent.
 */
const assertQuerySendable = (route: RouteDefinition, routeKey: string): void => {
    for (const [name, field] of fieldsOf(route.query)) {
        if (isJsonQueryField(field)) continue;
        const sendable = optionsOf(field).every((option) =>
            optionsOf(listElement(option) ?? option).every((value) => isValue(fieldKind(value)))
        );
        if (sendable) continue;
        throw new Error(
            `Route "${routeKey}" declares query field "${name}" as ${describeField(field)}. ` +
                'A query string carries text and JSON. A file needs a multipart form body.'
        );
    }
};

/**
 * A header carries one value.
 */
const assertHeadersSendable = (route: RouteDefinition, routeKey: string): void => {
    for (const [name, field] of fieldsOf(route.headers)) {
        if (optionsOf(field).every((option) => listElement(option) === undefined && isValue(fieldKind(option)))) continue;
        throw new Error(
            `Route "${routeKey}" declares header "${name}" as ${describeField(field)}. ` +
                'A header carries one value, so this cannot be sent.\n' +
                'Use a scalar schema (z.string(), z.int(), z.enum([...])), or split it into headers of their own.'
        );
    }
};

/**
 * A form sends a file part as a File, and only a multipart form carries one.
 */
const assertFormFileKind = (kind: string, name: string, multipart: boolean, routeKey: string): void => {
    if (kind === 'BinarySchema') {
        throw new Error(
            `Route "${routeKey}" declares form field "${name}" as BinarySchema, but a form sends a file part as a File. ` +
                'Declare it with FileSchema.'
        );
    }
    if (kind === 'file' && !multipart) {
        throw new Error(
            `Route "${routeKey}" declares form field "${name}" as a file, which a urlencoded body cannot carry. ` +
                "Send it as contentType: 'multipart/form-data'."
        );
    }
};

/**
 * A form carries values and lists of values, and a multipart one carries files too (RFC 7578).
 */
const assertFormFieldsSendable = (route: RouteDefinition, routeKey: string): void => {
    if (route.contentType !== 'multipart/form-data' && route.contentType !== 'application/x-www-form-urlencoded') return;
    const multipart = route.contentType === 'multipart/form-data';
    for (const [name, field] of fieldsOf(route.body)) {
        const kinds = optionsOf(field).flatMap((option) => optionsOf(listElement(option) ?? option).map(fieldKind));
        for (const kind of kinds) assertFormFileKind(kind, name, multipart, routeKey);
        if (kinds.every((kind) => kind === 'file' || isValue(kind))) continue;
        throw new Error(
            `Route "${routeKey}" declares form field "${name}" as ${describeField(field)}. ` +
                'A form carries values, lists of values and files, so this cannot be sent.\n' +
                'Split it into fields of their own, or take the body as JSON.'
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

/**
 * The statuses RFC 9110 gives no content: 204 (section 15.3.5), 205 (15.3.6)
 * and 304 (15.4.5).
 */
const NO_CONTENT_STATUSES: ReadonlySet<number> = new Set([204, 205, 304]);

/**
 * A response with no content is declared `z.void()`. `z.undefined()` reads the
 * same in a handler, but the OpenAPI document and the generated clients take
 * it as a JSON body and try to decode one.
 */
export const assertNoContentResponses = (route: RouteDefinition, routeKey: string): void => {
    for (const [status, response] of Object.entries(route.responses)) {
        for (const schema of responseSchemas(response)) {
            if (readDefType(schema) !== 'undefined') continue;
            throw new Error(
                `Route '${routeKey}' declares its ${status} response as \`z.undefined()\`, which the generated clients read as a JSON body. ` +
                    'Declare `z.void()` for a response with no content.'
            );
        }
        if (!NO_CONTENT_STATUSES.has(Number(status))) continue;
        if (!isStreamResponse(response) && isVoidSchema(isZodSchema(response) ? response : response.body)) continue;
        throw new Error(
            `Route '${routeKey}' declares a body on its ${status} response. A ${status} carries no content, so declare it \`z.void()\`.`
        );
    }
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
            assertQuerySendable(value, fullKey);
            assertHeadersSendable(value, fullKey);
            assertFormFieldsSendable(value, fullKey);
            assertNoCoercion(value, fullKey);
            assertSelfReferencesNamed(value, fullKey);
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
