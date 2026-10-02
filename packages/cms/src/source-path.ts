import { vercelStegaClean, vercelStegaCombine, vercelStegaDecode } from '@vercel/stega';
import type { z } from 'zod';
import { readDef, readMetaBrand, unwrapOptionalWrappers } from 'kizunajs/generator';
import { isImageSchema } from './image.js';
import { optionOf } from './union.js';
import type { ContentDefinition } from './definitions.js';

const ORIGIN = 'kizuna-cms';

interface SourcePayload {
    origin: string;
    ref?: string;
    path: string;
}

/**
 * Where a rendered value came from: the document, and the field within it.
 */
export interface Source {
    ref: string | undefined;
    path: string;
}

/**
 * A string carrying its document and field path as hidden characters, the way
 * Vercel's stega does for every visual editing tool. Strings that look like
 * dates or URLs are left alone, so links keep working; the fields panel edits
 * those.
 */
export const withSourcePath = (value: string, path: string, ref?: string): string =>
    vercelStegaCombine(value, {
        origin: ORIGIN,
        ...(ref === undefined ? {} : { ref }),
        path,
    } satisfies SourcePayload);

/**
 * The document and field path hidden in a string, or `undefined`.
 */
export const decodeSource = (text: string): Source | undefined => {
    const payload = vercelStegaDecode<Partial<SourcePayload>>(text);
    if (payload?.origin !== ORIGIN || typeof payload.path !== 'string') return undefined;
    return {
        ref: typeof payload.ref === 'string' ? payload.ref : undefined,
        path: payload.path,
    };
};

/**
 * The field path hidden in a string, or `undefined`.
 */
export const decodePath = (text: string): string | undefined => decodeSource(text)?.path;

/**
 * A value without any hidden paths.
 */
export const stripPaths = <T>(value: T): T => vercelStegaClean(value);

/**
 * The marker an image URL carries in draft mode, followed by the field path,
 * and the document after a `@`.
 */
export const IMAGE_MARKER = '#kizuna-cms=';

/**
 * The source an image URL's fragment names.
 */
export const decodeImageSource = (fragment: string): Source => {
    const [path, ref] = decodeURIComponent(fragment).split('@');
    return {
        ref: ref === undefined || ref === '' ? undefined : ref,
        path: path ?? '',
    };
};

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
    const encoded: Record<string, unknown> = {};
    for (const field of page.fields) {
        encoded[field.name] = plain.includes(field.name) ? content[field.name] : walk(field.schema, content[field.name], field.name);
    }
    return encoded;
};
