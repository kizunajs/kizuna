import type { z } from 'zod';
import { readDef, unwrapOptionalWrappers } from 'kizunajs/generator';
import { optionOf } from '../union.js';
import { cropShapeOf, isImageSchema, type CropShape, type ImageRef, type ResolvedCrop, type ResolvedImage } from '../image.js';
import { defaultCrop, fitsRatio, ratioOf, type Crop } from '../view/crop.js';
import type { ContentDefinition } from '../definitions.js';
import { dataFields } from '../field.js';
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
 * The crop a shape shows: the one the field stores when it has the shape, or
 * else the largest of the shape around the focal point. A crop saved in
 * another shape, before the field's shape changed, reads as unset.
 */
export const shapedCrop = (
    stored: Crop | undefined,
    aspectRatio: string,
    focalPoint: ImageRef['focalPoint'],
    media: MediaRecord | undefined
): Crop | undefined => {
    const ratio = ratioOf(aspectRatio);
    if (ratio === undefined || media === undefined || media.width === 0 || media.height === 0) return stored;
    if (stored !== undefined && fitsRatio(stored, ratio, media.width, media.height)) return stored;
    return defaultCrop(ratio, focalPoint ?? media.focalPoint, media.width, media.height);
};

const croppedSize = (crop: Crop | undefined, media: MediaRecord | undefined): { width: number; height: number } => {
    const width = media?.width ?? 0;
    const height = media?.height ?? 0;
    return crop === undefined
        ? {
              width,
              height,
          }
        : {
              width: Math.max(1, Math.round(width * crop.width)),
              height: Math.max(1, Math.round(height * crop.height)),
          };
};

/**
 * An image as the page receives it: the URL of the image route with the crop
 * applied, and the size the crop leaves. A `croppedImage` field's shape
 * decides the crop, and named crops each get a URL of their own.
 */
export const resolveImage = (
    ref: ImageRef & {
        crops?: Record<string, Crop | undefined>;
    },
    media: MediaRecord | undefined,
    urlOf: (id: string, query: string) => string,
    shape?: CropShape
): ResolvedImage & {
    crops?: Record<string, ResolvedCrop>;
} => {
    const focalPoint = ref.focalPoint;
    // Named crops leave the image itself whole.
    let crop: Crop | undefined = ref.crop;
    if (shape !== undefined) crop = 'aspectRatio' in shape ? shapedCrop(ref.crop, shape.aspectRatio, focalPoint, media) : undefined;
    const resolved: ResolvedImage & {
        crops?: Record<string, ResolvedCrop>;
    } = {
        id: ref.id,
        url: urlOf(
            ref.id,
            imageQuery(
                {
                    crop,
                    focalPoint,
                },
                media
            )
        ),
        alt: ref.alt !== '' ? ref.alt : (media?.alt ?? ''),
        ...croppedSize(crop, media),
    };
    if (shape === undefined || !('crops' in shape)) return resolved;
    const crops: Record<string, ResolvedCrop> = {};
    for (const [name, aspectRatio] of Object.entries(shape.crops)) {
        const named = shapedCrop(ref.crops?.[name], aspectRatio, focalPoint, media);
        crops[name] = {
            url: urlOf(
                ref.id,
                imageQuery(
                    {
                        crop: named,
                        focalPoint,
                    },
                    media
                )
            ),
            ...croppedSize(named, media),
        };
    }
    return {
        ...resolved,
        crops,
    };
};

/**
 * Every image a document holds: its media id and the dotted path of the
 * field holding it, like `hero.image` or `body.2.image`.
 */
export const mediaUsesOf = (page: ContentDefinition, content: Record<string, unknown>): Array<{ id: string; fieldPath: string }> => {
    const uses = new Map<string, { id: string; fieldPath: string }>();
    const walk = (schema: z.core.$ZodType, value: unknown, path: string): void => {
        if (value === undefined || value === null) return;
        if (isImageSchema(schema)) {
            const id = (value as ImageRef).id;
            if (typeof id === 'string') {
                uses.set(`${id} ${path}`, {
                    id,
                    fieldPath: path,
                });
            }
            return;
        }
        const def = readDef(unwrapOptionalWrappers(schema).inner);
        if (def.type === 'array' && def.element !== undefined && Array.isArray(value)) {
            value.forEach((item, index) => walk(def.element!, item, `${path}.${index}`));
        } else if (def.type === 'object' && def.shape !== undefined && typeof value === 'object') {
            for (const [key, child] of Object.entries(def.shape)) walk(child, (value as Record<string, unknown>)[key], `${path}.${key}`);
        } else if (def.options !== undefined) {
            for (const option of def.options) walk(option, value, path);
        }
    };
    for (const field of dataFields(page.fields)) walk(field.schema, content[field.name], field.name);
    return [...uses.values()];
};

/**
 * Every media id a document refers to.
 */
export const mediaIdsOf = (page: ContentDefinition, content: Record<string, unknown>): string[] => [
    ...new Set(mediaUsesOf(page, content).map((use) => use.id)),
];

/**
 * The content with every image reference replaced by its resolved image.
 */
export const resolveContent = (
    page: ContentDefinition,
    content: Record<string, unknown>,
    media: ReadonlyMap<string, MediaRecord>,
    urlOf: (id: string, query: string) => string
): Record<string, unknown> => {
    const walk = (schema: z.core.$ZodType, value: unknown): unknown => {
        if (value === undefined || value === null) return value;
        if (isImageSchema(schema)) {
            const ref = value as ImageRef;
            return resolveImage(ref, media.get(ref.id), urlOf, cropShapeOf(schema));
        }
        const def = readDef(unwrapOptionalWrappers(schema).inner);
        if (def.type === 'array' && def.element !== undefined && Array.isArray(value)) {
            return value.map((item) => walk(def.element!, item));
        }
        if (def.options !== undefined) {
            const option = optionOf(def, value);
            return option === undefined ? value : walk(option, value);
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
    for (const field of dataFields(page.fields)) resolved[field.name] = walk(field.schema, content[field.name]);
    return resolved;
};

/**
 * The content with every image field's value passed through `change`, which
 * returns the value to keep, or `undefined` to leave the field empty.
 */
export const mapImages = (
    page: ContentDefinition,
    content: Record<string, unknown>,
    change: (image: ImageRef) => ImageRef | undefined
): Record<string, unknown> => {
    const walk = (schema: z.core.$ZodType, value: unknown): unknown => {
        if (value === undefined || value === null) return value;
        if (isImageSchema(schema)) {
            // A translation's image field holds its alt text alone, which names no image.
            return typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string' ? change(value as ImageRef) : value;
        }
        const def = readDef(unwrapOptionalWrappers(schema).inner);
        if (def.type === 'array' && def.element !== undefined && Array.isArray(value)) {
            return value.map((item) => walk(def.element!, item));
        }
        if (def.options !== undefined) {
            const option = optionOf(def, value);
            return option === undefined ? value : walk(option, value);
        }
        if (def.type === 'object' && def.shape !== undefined && typeof value === 'object') {
            const kept: Record<string, unknown> = {};
            for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
                const childSchema = def.shape[key];
                const next = childSchema === undefined ? child : walk(childSchema, child);
                if (next !== undefined) kept[key] = next;
            }
            return kept;
        }
        return value;
    };
    const fields = dataFields(page.fields);
    const kept: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(content)) {
        const field = fields.find((candidate) => candidate.name === name);
        const next = field === undefined ? value : walk(field.schema, value);
        if (next !== undefined) kept[name] = next;
    }
    return kept;
};

/**
 * The content with every image whose media id is in `gone` left empty, for a
 * version restored after its image was deleted.
 */
export const withoutImages = (
    page: ContentDefinition,
    content: Record<string, unknown>,
    gone: ReadonlySet<string>
): Record<string, unknown> => mapImages(page, content, (image) => (gone.has(image.id) ? undefined : image));

/**
 * The content with media ids renamed, for content copied to an environment
 * that stored an image under another id.
 */
export const renameImages = (
    page: ContentDefinition,
    content: Record<string, unknown>,
    renamed: ReadonlyMap<string, string>
): Record<string, unknown> =>
    mapImages(page, content, (image) => ({
        ...image,
        id: renamed.get(image.id) ?? image.id,
    }));
