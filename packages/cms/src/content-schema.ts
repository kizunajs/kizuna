import { z } from 'zod';
import { readDef, unwrapOptionalWrappers } from 'kizunajs/generator';
import { isImageSchema } from './image.js';

/**
 * An image as a reader returns it.
 */
export const ResolvedImageSchema = z.object({
    id: z.string(),
    url: z.string(),
    alt: z.string(),
    width: z.int(),
    height: z.int(),
});

/**
 * The schema of content as a reader returns it: every image reference becomes
 * a {@link ResolvedImageSchema}, and everything else is what it was.
 */
export const resolvedSchema = (schema: z.core.$ZodType): z.ZodType => {
    if (isImageSchema(unwrapOptionalWrappers(schema).inner) && readDef(schema).type !== 'optional' && readDef(schema).type !== 'nullable') {
        return ResolvedImageSchema;
    }
    const def = readDef(schema);
    switch (def.type) {
        case 'optional':
            return resolvedSchema(def.innerType!).optional();
        case 'nullable':
            return resolvedSchema(def.innerType!).nullable();
        case 'default':
        case 'prefault':
        case 'readonly':
            return resolvedSchema(def.innerType!);
        case 'object': {
            const shape: Record<string, z.ZodType> = {};
            for (const [key, child] of Object.entries(def.shape ?? {})) shape[key] = resolvedSchema(child);
            return z.object(shape);
        }
        case 'array':
            return z.array(resolvedSchema(def.element!));
        case 'union':
            return z.union(def.options!.map(resolvedSchema));
        default:
            return schema as z.ZodType;
    }
};
