import type { z } from 'zod';
import { markModelSchema, readDefType, readDiscriminatedUnion } from './zod-internals.js';

const isEnumOrUnion = (schema: z.ZodType): boolean => readDefType(schema) === 'enum' || readDiscriminatedUnion(schema) !== undefined;

export interface ModelOptions<T extends z.ZodType> {
    /**
     * The name of this schema in the generated OpenAPI spec and client code.
     *
     * Appears as the key in `components/schemas` and as the struct/class name
     * in generated Swift clients.
     */
    title: string;
    /**
     * Optional description shown in the OpenAPI spec.
     */
    description?: string;
    /**
     * The Zod schema that defines the shape and validation of this model.
     */
    schema: T;
    /**
     * An enum or discriminated union that will gain members. The Swift and
     * Kotlin clients decode a member they don't know as `unknown`.
     */
    extensible?: boolean;
}

/**
 * Name a Zod schema for OpenAPI and code generation.
 *
 * ```ts
 * const UserSchema = Kizuna.model({
 *     title: 'User',
 *     description: 'A user in the system',
 *     schema: z.object({
 *         id: z.string(),
 *         name: z.string(),
 *     }),
 * });
 * ```
 */
export const createModel = <T extends z.ZodType>(options: ModelOptions<T>): T => {
    if (options.extensible === true && !isEnumOrUnion(options.schema)) {
        throw new Error(`Model '${options.title}' is \`extensible\`, which only an enum or a discriminated union can be.`);
    }
    const model = options.schema.meta({
        id: options.title,
        description: options.description,
        ...(options.extensible === true
            ? {
                  extensible: true,
              }
            : {}),
    }) as T;
    markModelSchema(model);
    return model;
};
