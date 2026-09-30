import { z } from 'zod';
import type { RouteDefinition } from './types.js';
import { isVoidSchema, readDef } from './zod-internals.js';
import type { BuiltinIssueCode, IssueLiteral } from './validation-error.js';

/**
 * The static message a rule was given, keyed by the code that rule fails
 * with, so a client's `check` returns the same text the server sends.
 */
export type RuleMessages = Partial<Record<BuiltinIssueCode, string>>;

interface RuleNodeBase {
    /**
     * Whether the field has to be present. A field with a default is not.
     */
    required: boolean;
    nullable: boolean;
    messages: RuleMessages;
}

/**
 * One field's rules, as the generators emit them into every client. A kind the
 * clients cannot check locally, a union or a record say, is `unknown`, and the
 * server stays the only place that rule runs.
 */
export type RuleNode =
    | (RuleNodeBase & {
          kind: 'object';
          fields: Record<string, RuleNode>;
          /**
           * A strict object refuses keys it does not declare.
           */
          strict: boolean;
      })
    | (RuleNodeBase & {
          kind: 'array';
          items: RuleNode;
          minItems?: number;
          maxItems?: number;
      })
    | (RuleNodeBase & {
          kind: 'string';
          minLength?: number;
          maxLength?: number;
          length?: number;
          format?: string;
          pattern?: string;
      })
    | (RuleNodeBase & {
          kind: 'number';
          integer: boolean;
          minimum?: number;
          maximum?: number;
          exclusiveMinimum?: number;
          exclusiveMaximum?: number;
          multipleOf?: number;
      })
    | (RuleNodeBase & {
          kind: 'boolean';
      })
    | (RuleNodeBase & {
          kind: 'enum';
          values: IssueLiteral[];
      })
    | (RuleNodeBase & {
          kind: 'unknown';
      });

/**
 * A route's rules per request part. A part the route does not declare is
 * absent.
 */
export interface RequestRules {
    params?: RuleNode;
    query?: RuleNode;
    headers?: RuleNode;
    body?: RuleNode;
}

/**
 * Whether a request to this route can fail validation, which is when the
 * automatic 400 joins its responses.
 */
export const validatesRequest = (route: RouteDefinition): boolean =>
    route.pathParams !== undefined ||
    route.query !== undefined ||
    route.headers !== undefined ||
    (route.body !== undefined && !isVoidSchema(route.body));

type JsonSchema = Record<string, unknown>;

const WRAPPER_TYPES: ReadonlySet<string> = new Set(['optional', 'nullable', 'default', 'prefault', 'nonoptional', 'readonly', 'catch']);

interface CheckDef {
    check?: string;
    format?: string;
    error?: unknown;
}

const messageOf = (error: unknown): string | undefined => {
    if (typeof error !== 'function' || error.length !== 0) return undefined;
    const produced: unknown = (error as () => unknown)();
    if (typeof produced === 'string') return produced;
    if (produced && typeof produced === 'object' && typeof (produced as { message?: unknown }).message === 'string') {
        return (produced as { message: string }).message;
    }
    return undefined;
};

const checkDefOf = (check: unknown): CheckDef => {
    const internal = (check as { _zod?: { def?: CheckDef } })._zod?.def;
    if (internal) return internal;
    return (check as { def?: CheckDef }).def ?? {};
};

const pathKey = (path: string[]): string => JSON.stringify(path);

/**
 * Walks a schema alongside the JSON Schema walk, collecting the static
 * message each rule was given. Read through the schema's internals, because
 * `z.toJSONSchema` drops messages.
 */
const collectMessages = (schema: z.core.$ZodType, path: string[], into: Map<string, RuleMessages>, seen: Set<z.core.$ZodType>): void => {
    if (seen.has(schema)) return;
    seen.add(schema);
    const def = readDef(schema);
    if (def.type !== undefined && WRAPPER_TYPES.has(def.type) && def.innerType) {
        collectMessages(def.innerType, path, into, seen);
        return;
    }
    if (def.type === 'pipe' && def.in) {
        collectMessages(def.in, path, into, seen);
        return;
    }

    const messages: RuleMessages = into.get(pathKey(path)) ?? {};
    const typeMessage = messageOf((def as { error?: unknown }).error);
    if (typeMessage !== undefined) {
        if (def.type === 'string' && def.format !== undefined) {
            messages[def.format === 'regex' ? 'pattern_mismatch' : 'invalid_format'] = typeMessage;
        } else {
            messages.invalid_type = typeMessage;
            messages.required = typeMessage;
        }
    }
    const isArray = def.type === 'array';
    for (const check of def.checks ?? []) {
        const checkDef = checkDefOf(check);
        const message = messageOf(checkDef.error);
        if (message === undefined) continue;
        switch (checkDef.check) {
            case 'min_length':
                messages[isArray ? 'too_few' : 'too_short'] = message;
                break;
            case 'max_length':
                messages[isArray ? 'too_many' : 'too_long'] = message;
                break;
            case 'length_equals':
                messages.wrong_length = message;
                break;
            case 'greater_than':
                messages.too_small = message;
                break;
            case 'less_than':
                messages.too_big = message;
                break;
            case 'multiple_of':
                messages.not_multiple_of = message;
                break;
            case 'string_format':
                messages[checkDef.format === 'regex' ? 'pattern_mismatch' : 'invalid_format'] = message;
                break;
            case 'number_format':
                messages.invalid_type = message;
                break;
            default:
                break;
        }
    }
    if (Object.keys(messages).length > 0) into.set(pathKey(path), messages);

    if (def.type === 'object' && def.shape) {
        for (const [key, field] of Object.entries(def.shape)) collectMessages(field, [...path, key], into, seen);
    }
    if (isArray && def.element) collectMessages(def.element, [...path, 'items'], into, seen);
};

const SAFE_INTEGER_BOUNDS = new Set([Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]);

const numberField = (schema: JsonSchema, key: string, dropSafeBounds = false): number | undefined => {
    const value = schema[key];
    if (typeof value !== 'number') return undefined;
    if (dropSafeBounds && SAFE_INTEGER_BOUNDS.has(value)) return undefined;
    return value;
};

const typeOf = (schema: JsonSchema): { type: string | undefined; nullable: boolean } => {
    const declared = schema.type;
    if (Array.isArray(declared)) {
        const types = declared.filter((entry): entry is string => typeof entry === 'string' && entry !== 'null');
        return {
            type: types.length === 1 ? types[0] : undefined,
            nullable: declared.includes('null'),
        };
    }
    return {
        type: typeof declared === 'string' ? declared : undefined,
        nullable: false,
    };
};

/**
 * `anyOf: [X, { type: 'null' }]` is how Zod writes a nullable schema. Anything
 * else under `anyOf` or `oneOf` is a union the clients do not check.
 */
const unwrapNullable = (schema: JsonSchema): { schema: JsonSchema; nullable: boolean } => {
    const variants = (schema.anyOf ?? schema.oneOf) as JsonSchema[] | undefined;
    if (!Array.isArray(variants) || variants.length !== 2) {
        return {
            schema,
            nullable: false,
        };
    }
    const nullIndex = variants.findIndex((variant) => variant.type === 'null');
    if (nullIndex === -1) {
        return {
            schema,
            nullable: false,
        };
    }
    const other = variants[nullIndex === 0 ? 1 : 0];
    return {
        schema: other ?? schema,
        nullable: true,
    };
};

const nodeFrom = (input: JsonSchema, required: boolean, path: string[], messages: Map<string, RuleMessages>): RuleNode => {
    const unwrapped = unwrapNullable(input);
    const schema = unwrapped.schema;
    const { type, nullable: typeNullable } = typeOf(schema);
    const base: RuleNodeBase = {
        required,
        nullable: unwrapped.nullable || typeNullable,
        messages: messages.get(pathKey(path)) ?? {},
    };

    if (schema.$ref !== undefined || schema.anyOf !== undefined || schema.oneOf !== undefined || schema.allOf !== undefined) {
        return {
            ...base,
            kind: 'unknown',
        };
    }
    if (Array.isArray(schema.enum)) {
        return {
            ...base,
            kind: 'enum',
            values: schema.enum as IssueLiteral[],
        };
    }
    if (schema.const !== undefined) {
        return {
            ...base,
            kind: 'enum',
            values: [schema.const as IssueLiteral],
        };
    }

    switch (type) {
        case 'string': {
            const minLength = numberField(schema, 'minLength');
            const maxLength = numberField(schema, 'maxLength');
            const exact = minLength !== undefined && minLength === maxLength;
            return {
                ...base,
                kind: 'string',
                ...(exact
                    ? {
                          length: minLength,
                      }
                    : {
                          ...(minLength !== undefined ? { minLength } : {}),
                          ...(maxLength !== undefined ? { maxLength } : {}),
                      }),
                ...(typeof schema.format === 'string' ? { format: schema.format } : {}),
                ...(typeof schema.pattern === 'string' ? { pattern: schema.pattern } : {}),
            };
        }
        case 'integer':
        case 'number': {
            const minimum = numberField(schema, 'minimum', type === 'integer');
            const maximum = numberField(schema, 'maximum', type === 'integer');
            const exclusiveMinimum = numberField(schema, 'exclusiveMinimum');
            const exclusiveMaximum = numberField(schema, 'exclusiveMaximum');
            const multipleOf = numberField(schema, 'multipleOf');
            return {
                ...base,
                kind: 'number',
                integer: type === 'integer',
                ...(minimum !== undefined ? { minimum } : {}),
                ...(maximum !== undefined ? { maximum } : {}),
                ...(exclusiveMinimum !== undefined ? { exclusiveMinimum } : {}),
                ...(exclusiveMaximum !== undefined ? { exclusiveMaximum } : {}),
                ...(multipleOf !== undefined ? { multipleOf } : {}),
            };
        }
        case 'boolean':
            return {
                ...base,
                kind: 'boolean',
            };
        case 'array': {
            const items = schema.items;
            if (!items || typeof items !== 'object' || Array.isArray(schema.prefixItems)) {
                return {
                    ...base,
                    kind: 'unknown',
                };
            }
            const minItems = numberField(schema, 'minItems');
            const maxItems = numberField(schema, 'maxItems');
            return {
                ...base,
                kind: 'array',
                items: nodeFrom(items as JsonSchema, true, [...path, 'items'], messages),
                ...(minItems !== undefined ? { minItems } : {}),
                ...(maxItems !== undefined ? { maxItems } : {}),
            };
        }
        case 'object': {
            const properties = schema.properties;
            if (!properties || typeof properties !== 'object') {
                return {
                    ...base,
                    kind: 'unknown',
                };
            }
            const requiredKeys = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
            const fields: Record<string, RuleNode> = {};
            for (const [key, property] of Object.entries(properties as Record<string, JsonSchema>)) {
                fields[key] = nodeFrom(property, requiredKeys.has(key), [...path, key], messages);
            }
            return {
                ...base,
                kind: 'object',
                fields,
                strict: schema.additionalProperties === false,
            };
        }
        default:
            return {
                ...base,
                kind: 'unknown',
            };
    }
};

/**
 * The rules of one request part, as a tree shaped like the input. Read from
 * the schema's JSON Schema form, the same call the OpenAPI generator makes,
 * plus the static message each rule was given.
 */
export const readSchemaRules = (schema: z.core.$ZodType): RuleNode => {
    const json = z.toJSONSchema(schema as z.ZodType, {
        io: 'input',
        unrepresentable: 'any',
    }) as JsonSchema;
    const messages = new Map<string, RuleMessages>();
    collectMessages(schema, [], messages, new Set());
    return nodeFrom(json, true, [], messages);
};

/**
 * Every rule of a route's request, per part, for the generators to write into
 * the clients. Refinements, transforms and messages written as functions are
 * not in it; those stay on the server.
 */
export const readRequestRules = (route: RouteDefinition): RequestRules => {
    const rules: RequestRules = {};
    if (route.pathParams) rules.params = readSchemaRules(route.pathParams);
    if (route.query) rules.query = readSchemaRules(route.query);
    if (route.headers) rules.headers = readSchemaRules(route.headers);
    if (route.body && !isVoidSchema(route.body)) rules.body = readSchemaRules(route.body);
    return rules;
};
