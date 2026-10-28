import type { JsonSchema } from './schema.js';

/**
 * The longest plain string that still edits on one line.
 */
const ONE_LINE_LENGTH = 120;

/**
 * The input a string edits in. A string with a `format` is one value, so it
 * stays on one line, typed as an email or a URL when it is one. A plain
 * string edits on one line too, unless its `maxLength` lets it run past
 * 120 characters, which gets a textarea.
 */
export const stringInputOf = (schema: JsonSchema): 'email' | 'url' | 'text' | 'textarea' => {
    if (schema.format === 'email') return 'email';
    if (schema.format === 'uri') return 'url';
    if (schema.format !== undefined) return 'text';
    return schema.maxLength !== undefined && schema.maxLength > ONE_LINE_LENGTH ? 'textarea' : 'text';
};

/**
 * How near its limit a string gets before its counter shows: nine tenths.
 */
const COUNTER_FROM = 0.9;

/**
 * Whether a string's counter shows. It stays out of the way until the text
 * nears the limit, so only a field about to run out of room counts.
 */
export const counterShown = (length: number, maxLength: number | undefined): boolean =>
    maxLength !== undefined && length >= Math.floor(maxLength * COUNTER_FROM);
