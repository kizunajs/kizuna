import { z } from 'zod';
import { unwrapOptionalWrappers } from 'kizunajs/generator';
import { assertFields, shapeOf, type FieldList, type FieldsCheck, type ShapeOf } from './field.js';

/**
 * What {@link defineBlock} takes.
 */
export interface BlockDefinition<Name extends string, Fields extends FieldList> {
    /**
     * The block's name in the CMS, camelCase like every other name:
     * `hero`, `productGrid`.
     */
    name: Name;
    /**
     * The fields editors may change, in the order they are shown.
     */
    fields: Fields;
}

/**
 * What {@link defineBlock} returns: a Zod object schema with one property per field.
 */
export type BlockSchema<Fields extends FieldList> = z.ZodObject<ShapeOf<Fields>, z.core.$strip>;

/**
 * A block as the CMS reads it back off its schema.
 */
export interface Block {
    name: string;
    fields: FieldList;
}

const blocks = new WeakMap<z.core.$ZodType, Block>();

const NAME = /^[a-z][A-Za-z0-9]*$/;

/**
 * Define a reusable block: a group of fields a page uses as one of its own. The
 * result is a Zod object schema, so a page field takes it where it takes any
 * schema, and the block's field rules and descriptions apply inside it.
 *
 * @example
 * export const HeroBlockSchema = defineBlock({
 *     name: 'hero',
 *     fields: [
 *         {
 *             name: 'heading',
 *             schema: z.string().max(60).describe('Under 8 words.'),
 *         },
 *         {
 *             name: 'image',
 *             schema: ImageSchema,
 *         },
 *     ],
 * });
 */
export const defineBlock = <const Name extends string, const Fields extends FieldList>(
    definition: BlockDefinition<Name, Fields> & FieldsCheck<Fields>
): BlockSchema<Fields> => {
    if (typeof definition.name !== 'string' || !NAME.test(definition.name)) {
        throw new Error(`defineBlock() has the name '${String(definition.name)}'. A name is camelCase, like 'hero' or 'productGrid'.`);
    }
    const owner = `defineBlock('${definition.name}')`;
    assertFields(definition.fields, owner);
    const schema = z.object(shapeOf(definition.fields));
    blocks.set(schema, {
        name: definition.name,
        fields: definition.fields,
    });
    return schema as BlockSchema<Fields>;
};

/**
 * The block behind a schema, read through `.optional()` and `.default()`, or
 * `undefined` for a schema `block` did not make.
 */
export const readBlock = (schema: z.core.$ZodType): Block | undefined =>
    blocks.get(schema) ?? blocks.get(unwrapOptionalWrappers(schema).inner);
