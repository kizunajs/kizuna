import type { z } from 'zod';
import { readDef, unwrapOptionalWrappers } from 'kizunajs/generator';
import { isImageSchema, type ImageRef, type ResolvedImage } from '../image.js';
import type { Page } from '../page.js';
import type { MediaRecord } from './media.js';

/**
 * The query the image route takes, from a field's crop and focal point.
 */
export const imageQuery = (ref: Pick<ImageRef, 'crop' | 'focalPoint'>, media: MediaRecord | undefined): string => {
    const query: string[] = [];
    if (ref.crop !== undefined) query.push(`crop=${[ref.crop.x, ref.crop.y, ref.crop.width, ref.crop.height].join(',')}`);
    const focalPoint = ref.focalPoint ?? media?.focalPoint;
    if (focalPoint !== undefined) query.push(`focal=${focalPoint.x},${focalPoint.y}`);
    return query.length === 0 ? '' : `?${query.join('&')}`;
};

/**
 * An image as the page receives it: the URL of the image route with the crop
 * applied, and the size the crop leaves.
 */
export const resolveImage = (
    ref: ImageRef,
    media: MediaRecord | undefined,
    urlOf: (id: string, query: string) => string
): ResolvedImage => {
    let width = media?.width ?? 0;
    let height = media?.height ?? 0;
    if (ref.crop !== undefined) {
        width = Math.max(1, Math.round(width * ref.crop.width));
        height = Math.max(1, Math.round(height * ref.crop.height));
    }
    return {
        id: ref.id,
        url: urlOf(ref.id, imageQuery(ref, media)),
        alt: ref.alt !== '' ? ref.alt : (media?.alt ?? ''),
        width,
        height,
    };
};

/**
 * Every media id a document refers to.
 */
export const mediaIdsOf = (page: Page, content: Record<string, unknown>): string[] => {
    const ids = new Set<string>();
    const walk = (schema: z.core.$ZodType, value: unknown): void => {
        if (value === undefined || value === null) return;
        if (isImageSchema(schema)) {
            const id = (value as ImageRef).id;
            if (typeof id === 'string') ids.add(id);
            return;
        }
        const def = readDef(unwrapOptionalWrappers(schema).inner);
        if (def.type === 'array' && def.element !== undefined && Array.isArray(value)) {
            for (const item of value) walk(def.element, item);
        } else if (def.type === 'object' && def.shape !== undefined && typeof value === 'object') {
            for (const [key, child] of Object.entries(def.shape)) walk(child, (value as Record<string, unknown>)[key]);
        } else if (def.options !== undefined) {
            for (const option of def.options) walk(option, value);
        }
    };
    for (const field of page.fields) walk(field.schema, content[field.name]);
    return [...ids];
};

/**
 * The content with every image reference replaced by its resolved image.
 */
export const resolveContent = (
    page: Page,
    content: Record<string, unknown>,
    media: ReadonlyMap<string, MediaRecord>,
    urlOf: (id: string, query: string) => string
): Record<string, unknown> => {
    const walk = (schema: z.core.$ZodType, value: unknown): unknown => {
        if (value === undefined || value === null) return value;
        if (isImageSchema(schema)) {
            const ref = value as ImageRef;
            return resolveImage(ref, media.get(ref.id), urlOf);
        }
        const def = readDef(unwrapOptionalWrappers(schema).inner);
        if (def.type === 'array' && def.element !== undefined && Array.isArray(value)) {
            return value.map((item) => walk(def.element!, item));
        }
        if (def.type === 'object' && def.shape !== undefined && typeof value === 'object') {
            const resolved: Record<string, unknown> = {};
            for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
                const childSchema = def.shape[key];
                resolved[key] = childSchema === undefined ? child : walk(childSchema, child);
            }
            return resolved;
        }
        return value;
    };
    const resolved: Record<string, unknown> = {};
    for (const field of page.fields) resolved[field.name] = walk(field.schema, content[field.name]);
    return resolved;
};
