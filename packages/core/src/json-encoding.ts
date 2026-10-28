import type { z } from 'zod';
import { readDefType } from './zod-internals.js';

/**
 * What the wire carries for a type JSON Schema has no keyword for. A route's
 * query, path and headers arrive as text that kizuna coerces, and JSON writes
 * a `Date` as its ISO string.
 */
const JSON_ENCODING: Record<string, Record<string, unknown>> = {
    date: {
        type: 'string',
        format: 'date-time',
    },
    bigint: {
        type: 'string',
    },
};

/**
 * The keywords that already say what a value is. A schema holding none of them
 * carries at most metadata, like a description or a brand.
 */
const SHAPE_KEYWORDS = ['type', '$ref', 'anyOf', 'oneOf', 'allOf', 'enum', 'const'];

/**
 * An `override` for `z.toJSONSchema` that gives a date or bigint its wire form,
 * where `unrepresentable: 'any'` would otherwise leave a schema with no type.
 */
export const encodeForWire = ({ zodSchema, jsonSchema }: { zodSchema: z.core.$ZodType; jsonSchema: Record<string, unknown> }): void => {
    const encoding = JSON_ENCODING[readDefType(zodSchema) ?? ''];
    if (encoding && !SHAPE_KEYWORDS.some((keyword) => keyword in jsonSchema)) Object.assign(jsonSchema, encoding);
};
