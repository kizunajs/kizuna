import { vercelStegaClean, vercelStegaCombine, vercelStegaDecode } from '@vercel/stega';
import type { z } from 'zod';
import { readDef, unwrapOptionalWrappers } from 'kizunajs/generator';
import { isImageSchema } from './image.js';
import type { Page } from './page.js';

const ORIGIN = 'kizuna-cms';

interface SourcePayload {
    origin: string;
    path: string;
}

/**
 * A string carrying its field path as hidden characters, the way Vercel's
 * stega does for every visual editing tool. Strings that look like dates or
 * URLs are left alone, so links keep working; the fields panel edits those.
 */
export const withSourcePath = (value: string, path: string): string =>
    vercelStegaCombine(value, {
        origin: ORIGIN,
        path,
    } satisfies SourcePayload);

/**
 * The field path hidden in a string, or `undefined`.
 */
export const decodePath = (text: string): string | undefined => {
    const payload = vercelStegaDecode<Partial<SourcePayload>>(text);
    return payload?.origin === ORIGIN && typeof payload.path === 'string' ? payload.path : undefined;
};

/**
 * A value without any hidden paths.
 */
export const stripPaths = <T>(value: T): T => vercelStegaClean(value);

/**
 * The marker an image URL carries in draft mode.
 */
export const IMAGE_MARKER = '#kizuna-cms=';

/**
 * Resolved content with every string carrying its field path and every image
 * URL carrying it as a fragment. Draft mode only; outside it the reader adds
 * nothing.
 */
export const encodeSourcePaths = (page: Page, content: Record<string, unknown>): Record<string, unknown> => {
    const walk = (schema: z.core.$ZodType, value: unknown, path: string): unknown => {
        if (value === undefined || value === null) return value;
        if (isImageSchema(schema) && typeof value === 'object') {
            const image = value as { url?: string; alt?: string };
            return {
                ...image,
                ...(typeof image.url === 'string' ? { url: `${image.url}${IMAGE_MARKER}${encodeURIComponent(path)}` } : {}),
                ...(typeof image.alt === 'string' ? { alt: withSourcePath(image.alt, path) } : {}),
            };
        }
        const def = readDef(unwrapOptionalWrappers(schema).inner);
        if (typeof value === 'string' && def.type === 'string') return withSourcePath(value, path);
        if (def.type === 'array' && def.element !== undefined && Array.isArray(value)) {
            return value.map((item, index) => walk(def.element!, item, `${path}.${index}`));
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
    for (const field of page.fields) encoded[field.name] = walk(field.schema, content[field.name], field.name);
    return encoded;
};
