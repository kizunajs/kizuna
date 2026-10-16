import type { z } from 'zod';
import type { RouteDefinition } from './types.js';
import {
    readDef,
    readDiscriminatedUnion,
    readDiscriminatorLiteral,
    readObjectShape,
    resolveBaseType,
    WRAPPER_TYPES,
} from './zod-internals.js';

/**
 * The schema kinds a path/query/header string is coerced into. A field of any
 * other kind arrives usable as is.
 */
const COERCIBLE_TYPES: ReadonlySet<string> = new Set(['number', 'int', 'boolean', 'bigint', 'date']);

type CoercionField =
    | {
          key: string;
          type: string;
          array: false;
      }
    | {
          key: string;
          type: string | undefined;
          array: true;
      };

/**
 * The fields of one request schema that need coercion, or `null` when none do.
 * Resolved once per schema so a request only visits fields that can change.
 */
export type CoercionPlan = CoercionField[] | null;

const resolveArrayElement = (schema: z.core.$ZodType): z.core.$ZodType | undefined => {
    const def = readDef(schema);
    if (def.type === 'array' && def.element) {
        return def.element;
    }
    if (def.type && WRAPPER_TYPES.has(def.type) && def.innerType) {
        return resolveArrayElement(def.innerType);
    }
    if (def.type === 'pipe' && def.in) {
        return resolveArrayElement(def.in);
    }
    return undefined;
};

const buildCoercionPlan = (schema: z.ZodType): CoercionPlan => {
    const shape = readObjectShape(schema);
    if (!shape) return null;
    const fields: CoercionField[] = [];
    for (const [key, fieldSchema] of Object.entries(shape)) {
        const baseType = resolveBaseType(fieldSchema);
        if (baseType === 'array') {
            const element = resolveArrayElement(fieldSchema);
            const elementType = element ? resolveBaseType(element) : undefined;
            fields.push({
                key,
                type: elementType !== undefined && COERCIBLE_TYPES.has(elementType) ? elementType : undefined,
                array: true,
            });
            continue;
        }
        if (COERCIBLE_TYPES.has(baseType)) {
            fields.push({
                key,
                type: baseType,
                array: false,
            });
        }
    }
    return fields.length > 0 ? fields : null;
};

const plans = new WeakMap<z.ZodType, CoercionPlan>();

/**
 * The coercion plan for a request schema, built on first sight and cached
 * afterwards. {@link resolveCoercionPlans} fills the cache at startup, leaving
 * the request path a single `WeakMap` read.
 */
export const coercionPlanFor = (schema: z.ZodType): CoercionPlan => {
    const cached = plans.get(schema);
    if (cached !== undefined) return cached;
    const plan = buildCoercionPlan(schema);
    plans.set(schema, plan);
    return plan;
};

/**
 * Resolves the plans for a route's coerced schemas ahead of any request. Called
 * when a config is defined and when an API is assembled.
 */
export const resolveCoercionPlans = (route: RouteDefinition): void => {
    if (route.pathParams) coercionPlanFor(route.pathParams);
    if (route.query) coercionPlanFor(route.query);
    if (route.headers) coercionPlanFor(route.headers);
    if (route.body) {
        if (isFormBody(route)) coercionPlanFor(route.body);
        else jsonConverterFor(route.body);
    }
};

/**
 * Whether a route's body is a form, whose fields arrive as strings the way a query's do.
 */
export const isFormBody = (route: RouteDefinition): boolean =>
    route.contentType === 'multipart/form-data' || route.contentType === 'application/x-www-form-urlencoded';

const DECIMAL_INTEGER = /^-?[0-9]+$/;

const coerceValue = (value: unknown, type: string): unknown => {
    if (typeof value !== 'string') return value;
    if (type === 'number' || type === 'int') {
        const coerced = Number(value);
        return Number.isNaN(coerced) ? value : coerced;
    }
    if (type === 'boolean') {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return value;
    }
    if (type === 'bigint') return DECIMAL_INTEGER.test(value) ? BigInt(value) : value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date;
};

/**
 * A lone value is a one-item list, the way OpenAPI's default `form` style
 * sends `?tag=work`.
 */
const coerceArray = (value: unknown, type: string | undefined): unknown => {
    const items = Array.isArray(value) ? value : [value];
    if (type === undefined) return items;
    let changed = items !== value;
    const coerced = items.map((item) => {
        const next = coerceValue(item, type);
        if (next !== item) changed = true;
        return next;
    });
    return changed ? coerced : value;
};

/**
 * Applies a plan to one stage's raw input, returning the input itself when no
 * field changed.
 */
export const applyCoercion = (input: unknown, plan: CoercionPlan): unknown => {
    if (plan === null || !input || typeof input !== 'object' || Array.isArray(input)) return input;
    const record = input as Record<string, unknown>;
    let result: Record<string, unknown> | undefined;
    for (const field of plan) {
        const value = record[field.key];
        if (value === undefined) continue;
        const coerced = field.array ? coerceArray(value, field.type) : coerceValue(value, field.type);
        if (coerced === value) continue;
        result ??= { ...record };
        result[field.key] = coerced;
    }
    return result ?? input;
};

/**
 * Converts the strings a JSON body carries for its dates and bigints, or `null`
 * when the schema has neither.
 */
type JsonConverter = ((value: unknown) => unknown) | null;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const convertEntries = (record: Record<string, unknown>, converterFor: (key: string) => JsonConverter): Record<string, unknown> => {
    let result: Record<string, unknown> | undefined;
    for (const [key, value] of Object.entries(record)) {
        const convert = converterFor(key);
        if (!convert || value === undefined) continue;
        const converted = convert(value);
        if (converted === value) continue;
        result ??= { ...record };
        result[key] = converted;
    }
    return result ?? record;
};

const convertItems = (items: unknown[], converterAt: (index: number) => JsonConverter): unknown[] => {
    let changed = false;
    const converted = items.map((item, index) => {
        const next = converterAt(index)?.(item) ?? item;
        if (next !== item) changed = true;
        return next;
    });
    return changed ? converted : items;
};

const jsonConverters = new WeakMap<z.core.$ZodType, JsonConverter>();

const buildJsonConverter = (schema: z.core.$ZodType): JsonConverter => {
    const def = readDef(schema);
    if (def.type && WRAPPER_TYPES.has(def.type) && def.innerType) return jsonConverterFor(def.innerType);
    if (def.type === 'pipe' && def.in) return jsonConverterFor(def.in);
    if (def.type === 'date' || def.type === 'bigint') {
        const type = def.type;
        return (value) => coerceValue(value, type);
    }
    if (def.shape) {
        const fields = new Map<string, NonNullable<JsonConverter>>();
        for (const [key, field] of Object.entries(def.shape)) {
            const convert = jsonConverterFor(field);
            if (convert) fields.set(key, convert);
        }
        if (fields.size === 0) return null;
        return (value) => (isRecord(value) ? convertEntries(value, (key) => fields.get(key) ?? null) : value);
    }
    if (def.type === 'array' && def.element) {
        const convert = jsonConverterFor(def.element);
        if (!convert) return null;
        return (value) => (Array.isArray(value) ? convertItems(value, () => convert) : value);
    }
    if (def.type === 'tuple' && def.items) {
        const converters = def.items.map(jsonConverterFor);
        const rest = def.rest ? jsonConverterFor(def.rest) : null;
        if (!rest && converters.every((convert) => convert === null)) return null;
        return (value) => (Array.isArray(value) ? convertItems(value, (index) => converters[index] ?? rest) : value);
    }
    if (def.type === 'record' && def.valueType) {
        const convert = jsonConverterFor(def.valueType);
        if (!convert) return null;
        return (value) => (isRecord(value) ? convertEntries(value, () => convert) : value);
    }
    const union = readDiscriminatedUnion(schema);
    if (union) {
        const variants = new Map<unknown, NonNullable<JsonConverter>>();
        for (const option of union.options) {
            const convert = jsonConverterFor(option);
            const literal = readDiscriminatorLiteral(option, union.discriminator);
            if (convert && literal !== undefined) variants.set(literal, convert);
        }
        if (variants.size === 0) return null;
        return (value) => {
            if (!isRecord(value)) return value;
            const convert = variants.get(value[union.discriminator]);
            return convert ? convert(value) : value;
        };
    }
    return null;
};

/**
 * The converter for a JSON body schema, built on first sight and cached
 * afterwards.
 */
export const jsonConverterFor = (schema: z.core.$ZodType): JsonConverter => {
    const cached = jsonConverters.get(schema);
    if (cached !== undefined) return cached;
    // A recursive schema reaches itself while building, so it finds a stand-in that forwards to the finished converter.
    let built: JsonConverter = null;
    jsonConverters.set(schema, (value) => (built ? built(value) : value));
    built = buildJsonConverter(schema);
    jsonConverters.set(schema, built);
    return built;
};

/**
 * Coerces a request body: a form's fields from their strings, a JSON body's dates
 * and bigints from theirs.
 */
export const coerceBody = (route: RouteDefinition, body: unknown): unknown => {
    if (!route.body) return body;
    if (isFormBody(route)) return applyCoercion(body, coercionPlanFor(route.body));
    const convert = jsonConverterFor(route.body);
    return convert ? convert(body) : body;
};
