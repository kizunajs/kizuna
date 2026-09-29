import type { z } from 'zod';
import { readDef } from './zod-internals.js';

/**
 * What a brand wraps. Every client can give a scalar a type of its own.
 */
export type BrandableSchema = z.ZodType<string | number | bigint | boolean | Date>;

const BRANDABLE_TYPES = new Set(['string', 'number', 'bigint', 'boolean', 'date']);

/**
 * Brand a Zod schema, so the server and every generated client type its values
 * as that brand. The schema is a string, number, bigint, boolean or date.
 *
 * ```ts
 * const UserId = Kizuna.brand('UserId', z.string());
 * ```
 */
export const createBrand = <Brand extends string, T extends BrandableSchema>(brand: Brand, schema: T): z.core.$ZodBranded<T, Brand> => {
    const type = readDef(schema).type;
    if (type === undefined || !BRANDABLE_TYPES.has(type)) {
        throw new Error(
            `Kizuna.brand('${brand}') takes a string, number, bigint, boolean or date schema, not \`${type ?? 'unknown'}\`. Put .optional() or .nullable() on the brand instead.`
        );
    }
    return schema.meta({
        brand,
    }) as z.core.$ZodBranded<T, Brand>;
};
