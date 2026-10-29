import { isRichText, resolveRef, typeOf, type JsonSchema } from './schema.js';

const SCALARS = ['string', 'number', 'integer', 'boolean'];

const isScalar = (schema: JsonSchema, root: JsonSchema): boolean => {
    const resolved = resolveRef(schema, root);
    return SCALARS.includes(typeOf(resolved) ?? '') && resolved.brand === undefined && !isRichText(resolved);
};

/**
 * Whether a field's value reads as a line of text, so a field nobody may
 * change shows it as text rather than as a greyed-out input: a string,
 * number, yes or no, choice, or a list of them. An id, an image or rich text
 * keeps its own control.
 */
export const readsAsText = (schema: JsonSchema): boolean => {
    const resolved = resolveRef(schema, schema);
    if (isRichText(schema) || isRichText(resolved)) return false;
    if (typeOf(resolved) === 'array') return isScalar(resolved.items ?? {}, schema);
    return isScalar(resolved, schema);
};

/**
 * A value as a read-only field shows it, or `undefined` when it holds none.
 * A choice reads as its label, yes or no as Yes and No, and a date in the
 * reader's own words.
 */
export const readOnlyTextOf = (
    schema: JsonSchema,
    value: unknown,
    labels: Record<string, string> | undefined,
    locale?: string
): string | undefined => {
    if (value === undefined || value === null || value === '') return undefined;
    const resolved = resolveRef(schema, schema);
    if (Array.isArray(value)) {
        const items = value
            .map((item) => readOnlyTextOf(resolved.items ?? {}, item, labels, locale))
            .filter((item): item is string => item !== undefined);
        return items.length === 0 ? undefined : items.join(', ');
    }
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return value.toLocaleString(locale);
    const text = String(value);
    if (labels?.[text] !== undefined) return labels[text];
    const date = new Date(text);
    if (resolved.format === 'date-time' && !Number.isNaN(date.getTime())) {
        return date.toLocaleString(locale, {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    }
    if (resolved.format === 'date' && !Number.isNaN(date.getTime())) {
        return date.toLocaleDateString(locale, {
            dateStyle: 'medium',
            timeZone: 'UTC',
        });
    }
    return text;
};
