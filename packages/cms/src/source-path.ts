import { vercelStegaClean, vercelStegaCombine } from '@vercel/stega';
import type { z } from 'zod';
import { readDef, readMetaBrand, unwrapOptionalWrappers } from 'kizunajs/generator';
import { isImageSchema } from './image.js';
import { optionOf } from './union.js';
import type { ContentDefinition } from './definitions.js';
import { decodeSource, IMAGE_MARKER, SOURCE_ORIGIN, type SourcePayload } from './source-marks.js';

export { decodeImageSource, decodeSource, IMAGE_MARKER, type Source } from './source-marks.js';

/**
 * A string carrying its document and field path as hidden characters, the way
 * Vercel's stega does for every visual editing tool. Strings that look like
 * dates or URLs are left alone, so links keep working; the fields panel edits
 * those.
 */
export const withSourcePath = (value: string, path: string, ref?: string): string =>
    vercelStegaCombine(value, {
        origin: SOURCE_ORIGIN,
        ...(ref === undefined ? {} : { ref }),
        path,
    } satisfies SourcePayload);

/**
 * The field path hidden in a string, or `undefined`.
 */
export const decodePath = (text: string): string | undefined => decodeSource(text)?.path;

/**
 * A value without any hidden paths.
 */
export const stripPaths = <T>(value: T): T => vercelStegaClean(value);

/**
 * Whether a string is text a page shows, the only kind the preview marks. An
 * id, a URL, an email or a value with a pattern is something code compares or
 * links to, and invisible characters in it would break that.
 */
const isDisplayText = (schema: z.core.$ZodType): boolean => {
    const inner = unwrapOptionalWrappers(schema).inner;
    if (readDef(inner).type !== 'string' || readMetaBrand(schema) !== undefined || readMetaBrand(inner) !== undefined) return false;
    const bag = (inner as { _zod: { bag: { format?: string; patterns?: Set<RegExp> } } })._zod.bag;
    return bag.format === undefined && (bag.patterns === undefined || bag.patterns.size === 0);
};

/**
 * Resolved content with every piece of display text marked with its field
 * path, and every image URL with it as a fragment. Fields named in `plain`,
 * like the ones an address reads, stay as they are. Draft mode only; outside
 * it the reader adds nothing.
 */
export const encodeSourcePaths = (
    page: ContentDefinition,
    content: Record<string, unknown>,
    ref?: string,
    plain: readonly string[] = []
): Record<string, unknown> => {
    const walk = (schema: z.core.$ZodType, value: unknown, path: string): unknown => {
        if (value === undefined || value === null) return value;
        if (isImageSchema(schema) && typeof value === 'object') {
            const image = value as { url?: string; alt?: string };
            return {
                ...image,
                ...(typeof image.url === 'string'
                    ? { url: `${image.url}${IMAGE_MARKER}${encodeURIComponent(ref === undefined ? path : `${path}@${ref}`)}` }
                    : {}),
                ...(typeof image.alt === 'string' ? { alt: withSourcePath(image.alt, path, ref) } : {}),
            };
        }
        const def = readDef(unwrapOptionalWrappers(schema).inner);
        if (typeof value === 'string') return isDisplayText(schema) ? withSourcePath(value, path, ref) : value;
        if (def.type === 'array' && def.element !== undefined && Array.isArray(value)) {
            return value.map((item, index) => walk(def.element!, item, `${path}.${index}`));
        }
        if (def.options !== undefined) {
            const option = optionOf(def.options, value);
            return option === undefined ? value : walk(option, value, path);
        }
        if (def.type === 'object' && def.shape !== undefined && typeof value === 'object') {
            const encoded: Record<string, unknown> = {};
            for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
                const childSchema = def.shape[key];
                encoded[key] = childSchema === undefined ? child : walk(childSchema, child, `${path}.${key}`);
            }
            return encoded;
        }
        return value;
    };
    // Keys that are no field, like an item's `id`, pass through as they are.
    const encoded: Record<string, unknown> = {
        ...content,
    };
    for (const field of page.fields) {
        encoded[field.name] = plain.includes(field.name) ? content[field.name] : walk(field.schema, content[field.name], field.name);
    }
    return encoded;
};
