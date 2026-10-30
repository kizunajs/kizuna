import { z } from 'zod';
import { readDef, unwrapOptionalWrappers } from 'kizunajs/generator';
import { assertFields, dataFields, isLayoutItem, objectOf, type FieldList, type FieldsCheck, type ShapeOf } from './field.js';

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
     * What editors see the block called. Without it, its name.
     */
    label?: string;
    /**
     * What editors and the agent read when they choose a block for a
     * {@link blocks} list.
     */
    description?: string;
    /**
     * The fields editors may change, in the order they are shown.
     */
    fields: Fields;
}

/**
 * The key a {@link blocks} list stores each item's block name under.
 */
export const BLOCK_KEY = 'block';

/**
 * Where a block schema carries its name, so {@link blocks} can type each item
 * by it.
 */
export const BLOCK: unique symbol = Symbol.for('kizuna.cms.block') as symbol as typeof BLOCK;

/**
 * What {@link defineBlock} returns: a Zod object schema with one property per
 * field, carrying the block's name.
 */
export type BlockSchema<Name extends string = string, Fields extends FieldList = FieldList> = z.ZodObject<
    ShapeOf<Fields>,
    z.core.$strip
> & {
    readonly [BLOCK]: Name;
};

/**
 * A block as the CMS reads it back off its schema.
 */
export interface Block {
    name: string;
    label: string | undefined;
    description: string | undefined;
    fields: FieldList;
}

const definedBlocks = new WeakMap<z.core.$ZodType, Block>();

const blockLists = new WeakMap<z.core.$ZodType, readonly Block[]>();

const NAME = /^[a-z][A-Za-z0-9]*$/;

const TEXT_OPTIONS: ReadonlyArray<'label' | 'description'> = ['label', 'description'];

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
): BlockSchema<Name, Fields> => {
    if (typeof definition.name !== 'string' || !NAME.test(definition.name)) {
        throw new Error(`defineBlock() has the name '${String(definition.name)}'. A name is camelCase, like 'hero' or 'productGrid'.`);
    }
    const owner = `defineBlock('${definition.name}')`;
    assertFields(definition.fields, owner);
    for (const item of definition.fields) {
        if ('position' in item && item.position !== undefined) {
            const named = isLayoutItem(item) ? `the collapsible '${item.label}'` : `the field '${item.name}'`;
            throw new Error(`${owner} puts ${named} in the sidebar. A block shows inside the field that holds it, beside no sidebar.`);
        }
    }
    for (const option of TEXT_OPTIONS) {
        const value = definition[option];
        if (value !== undefined && (typeof value !== 'string' || value === '')) {
            throw new Error(`${owner} has a ${option} that is no text. Leave it out, or give it words editors read.`);
        }
    }
    const schema = objectOf(definition.fields);
    Object.defineProperty(schema, BLOCK, {
        value: definition.name,
    });
    definedBlocks.set(schema, {
        name: definition.name,
        label: definition.label,
        description: definition.description,
        fields: definition.fields,
    });
    return schema as BlockSchema<Name, Fields>;
};

/**
 * The block behind a schema, read through `.optional()` and `.default()`, or
 * `undefined` for a schema `block` did not make.
 */
export const readBlock = (schema: z.core.$ZodType): Block | undefined =>
    definedBlocks.get(schema) ?? definedBlocks.get(unwrapOptionalWrappers(schema).inner);

/**
 * A block list's item as Zod types it: the block's own fields, with its name
 * under {@link BLOCK_KEY}.
 */
export type TaggedBlockSchema<Each> = Each extends z.ZodObject<infer Shape extends z.core.$ZodShape, z.core.$strip> & {
    readonly [BLOCK]: infer Name extends string;
}
    ? z.ZodObject<
          {
              [Key in typeof BLOCK_KEY | keyof Shape]: Key extends typeof BLOCK_KEY ? z.ZodLiteral<Name> : Shape[Key];
          },
          z.core.$strip
      >
    : never;

/**
 * What {@link blocks} returns: an array whose items are any of the blocks,
 * told apart by {@link BLOCK_KEY}.
 */
export type BlocksSchema<List extends readonly BlockSchema[]> = z.ZodArray<
    z.ZodDiscriminatedUnion<
        {
            -readonly [Index in keyof List]: TaggedBlockSchema<List[Index]>;
        },
        typeof BLOCK_KEY
    >
>;

const WHOLE_ITEM_OPTIONS: ReadonlyArray<'auth' | 'readOnly'> = ['auth', 'readOnly'];

/**
 * Throws when a block, or a block one of its fields holds, gives a field
 * `auth` or `readOnly`, which an item that saves as a whole cannot keep.
 */
const assertWholeItem = (fields: FieldList, block: string): void => {
    for (const field of dataFields(fields)) {
        for (const option of WHOLE_ITEM_OPTIONS) {
            if (field[option] === undefined) continue;
            throw new Error(
                `blocks() holds the block '${block}', whose field '${field.name}' declares ${option}. An item in the list saves as a whole, so give ${option} to the field that holds the list.`
            );
        }
        const inner = readBlock(field.schema);
        if (inner !== undefined) assertWholeItem(inner.fields, block);
    }
};

/**
 * A list holding any of the blocks, in the order editors put them. Each item
 * stores its block's name under `block`, which narrows its type, so a page
 * hands every item to its component with a `switch`. The result is a Zod
 * array, so `.min()` and `.max()` bound how many items it holds.
 *
 * @example
 * {
 *     name: 'sections',
 *     schema: blocks([HeroBlockSchema, ContentBlockSchema]).max(12),
 * },
 */
export const blocks = <const List extends readonly [BlockSchema, ...BlockSchema[]]>(list: List): BlocksSchema<List> => {
    if (!Array.isArray(list) || list.length === 0) {
        throw new Error('blocks() lists no blocks. Name the blocks editors may add, like blocks([HeroBlockSchema, ContentBlockSchema]).');
    }
    const held: Block[] = [];
    const options = list.map((schema, index) => {
        const block = definedBlocks.get(schema);
        if (block === undefined) {
            throw new Error(`blocks() takes blocks made with defineBlock(), and item ${index + 1} is something else.`);
        }
        if (held.some((existing) => existing.name === block.name)) {
            throw new Error(`blocks() lists the block '${block.name}' twice.`);
        }
        if (BLOCK_KEY in schema.shape) {
            throw new Error(
                `blocks() holds the block '${block.name}', which has a field named '${BLOCK_KEY}'. A list stores each item's block name there, so rename the field.`
            );
        }
        assertWholeItem(block.fields, block.name);
        held.push(block);
        const option = objectOf(block.fields, {
            [BLOCK_KEY]: z.literal(block.name),
        });
        return block.description === undefined ? option : option.describe(block.description);
    });
    const union = z.discriminatedUnion(BLOCK_KEY, options as unknown as [z.ZodObject, ...z.ZodObject[]]);
    blockLists.set(union, held);
    return z.array(union) as unknown as BlocksSchema<List>;
};

/**
 * The blocks a list made by {@link blocks} holds, read through `.optional()`,
 * `.default()`, `.min()` and `.max()`, or `undefined` for any other schema.
 */
export const readBlocks = (schema: z.core.$ZodType): readonly Block[] | undefined => {
    const inner = readDef(unwrapOptionalWrappers(schema).inner);
    return inner.type === 'array' && inner.element !== undefined ? blockLists.get(inner.element) : undefined;
};
