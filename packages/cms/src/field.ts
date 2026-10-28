import type { z } from 'zod';
import type { RequiredPermissions } from 'kizunajs';
import { isZodSchema, readMetaDescription, readModelSchema, unwrapOptionalWrappers } from 'kizunajs/generator';

/**
 * Who may write a field, narrowing the plugin's own `auth`. The vocabulary is a
 * route's: the roles the caller holds, or the permissions it has to hold.
 * `defineConfig` checks both against the identity the plugin names.
 *
 * @example
 * auth: {
 *     roles: 'admin',
 * },
 */
export interface FieldAuth {
    /**
     * The roles that may write the field. The caller holds at least one.
     */
    roles?: string | readonly string[];
    /**
     * The permissions the caller has to hold to write the field.
     */
    requires?: RequiredPermissions;
}

/**
 * One editable field of a block or a page: its name, the Zod schema every
 * write is checked against, and how editors meet it.
 */
export interface Field<Name extends string = string, Schema extends z.ZodType = z.ZodType> {
    /**
     * The key the value is stored and read under: `page.hero`, `block.heading`.
     */
    name: Name;
    /**
     * What editors see the field called. Without it, its name.
     */
    label?: string;
    /**
     * What the value has to pass. The limits a designer sets here, `.max()`,
     * `.min()`, an enum, hold in the API, the tools and the inline editor alike.
     */
    schema: Schema;
    /**
     * Guidance for editors and the agent, shown under the input. Overrides the
     * schema's `.describe()` text for this use of it.
     */
    description?: string;
    /**
     * Who may write the field. Without it, anyone the plugin's `auth` admits.
     */
    auth?: FieldAuth;
    /**
     * Editors and the agent see the field, and nothing writes it.
     */
    readOnly?: boolean;
    /**
     * For an enum, the label editors see for each value, so the stored value
     * stays what code compares against.
     *
     * @example
     * options: {
     *     design: 'Design',
     *     engineering: 'Engineering',
     * },
     */
    options?: Readonly<Record<string, string>>;
    /**
     * `'sidebar'` shows the field beside the main column.
     */
    position?: 'sidebar';
    /**
     * How much of a row the field takes, like `'50%'`.
     */
    width?: string;
}

/**
 * Shows its fields under a tab. Tabs listed one after another share a tab bar.
 */
export interface Tab {
    type: 'tab';
    /**
     * What the tab reads.
     */
    label: string;
    fields: FieldList;
}

/**
 * Shows its fields side by side.
 */
export interface Row {
    type: 'row';
    fields: FieldList;
}

/**
 * Shows its fields in a section that folds.
 */
export interface Collapsible {
    type: 'collapsible';
    /**
     * What the section's heading reads.
     */
    label: string;
    /**
     * `'sidebar'` shows the section beside the main column.
     */
    position?: 'sidebar';
    fields: FieldList;
}

/**
 * An item that arranges fields on the editor's screen. It holds fields of its
 * own, and never shapes the content: its fields read as if listed in its place.
 */
export type LayoutItem = Tab | Row | Collapsible;

/**
 * The fields of a block or a page, in the order they are shown, with the
 * layout items that arrange them.
 */
export type FieldList = readonly (Field | LayoutItem)[];

/**
 * Whether an item of a field list arranges fields rather than holding content.
 */
export const isLayoutItem = (item: Field | LayoutItem): item is LayoutItem => 'type' in item;

/**
 * The fields a list holds, with those inside its layout items read in their
 * place, as the content stores them.
 */
export const dataFields = (fields: FieldList): Field[] => fields.flatMap((item) => (isLayoutItem(item) ? dataFields(item.fields) : [item]));

type LayoutType = LayoutItem['type'];

/**
 * A field list as one tuple of its items, layout items included, with the
 * items inside each layout item following it.
 */
type FlatItems<Items extends readonly unknown[]> = Items extends readonly [infer Head, ...infer Rest]
    ? Head extends {
          type: LayoutType;
          fields: infer Inner extends readonly unknown[];
      }
        ? [Head, ...FlatItems<Inner>, ...FlatItems<Rest>]
        : [Head, ...FlatItems<Rest>]
    : [];

// The plain `FieldList` holds itself, so the depth stops the walk where no declared list reaches.
type DataFieldUnion<Item, Depth extends unknown[] = []> = Item extends {
    type: LayoutType;
    fields: readonly (infer Inner)[];
}
    ? Depth['length'] extends 8
        ? never
        : DataFieldUnion<Inner, [...Depth, unknown]>
    : Item extends Field
      ? Item
      : never;

/**
 * Every field a list holds, those inside its layout items included.
 */
export type DataFieldOf<Fields extends FieldList> = DataFieldUnion<Fields[number]>;

/**
 * The object shape a field list builds: each field's name to its schema.
 * Layout items add nothing of their own.
 */
export type ShapeOf<Fields extends FieldList> = {
    [Each in DataFieldOf<Fields> as Each['name']]: Each['schema'];
};

type DataFieldTuple<Items extends readonly unknown[]> = Items extends readonly [infer Head, ...infer Rest]
    ? Head extends {
          name: string;
      }
        ? [Head, ...DataFieldTuple<Rest>]
        : DataFieldTuple<Rest>
    : [];

type DuplicateFieldNames<Fields extends readonly { name: string }[]> = Fields extends readonly [
    infer Head extends { name: string },
    ...infer Rest extends readonly { name: string }[],
]
    ? (Head['name'] extends Rest[number]['name'] ? Head['name'] : never) | DuplicateFieldNames<Rest>
    : never;

type FieldOption = keyof Field;

type ItemOption<Item> = Item extends {
    type: 'tab';
}
    ? keyof Tab
    : Item extends {
            type: 'row';
        }
      ? keyof Row
      : Item extends {
              type: 'collapsible';
          }
        ? keyof Collapsible
        : FieldOption;

type UnknownFieldOptions<Items extends readonly object[]> = {
    [Index in keyof Items]: Exclude<keyof Items[Index], ItemOption<Items[Index]>> & string;
}[number];

/**
 * Rejects a field list that names a field twice, inside its layout items or
 * out, or gives an item an option it does not take. Intersect it with the
 * definition (`definition: Definition & FieldsCheck<Fields>`): a sound list
 * gives `unknown`, leaving the definition untouched, and anything else
 * resolves `fields` to a message.
 */
export type FieldsCheck<Fields extends FieldList> = [DuplicateFieldNames<DataFieldTuple<FlatItems<Fields>>>] extends [never]
    ? [UnknownFieldOptions<FlatItems<Fields>>] extends [never]
        ? unknown
        : {
              fields: `kizuna: "${UnknownFieldOptions<FlatItems<Fields>>}" is not an option there. A field takes name, label, schema, description, auth, readOnly, options, position and width, and a layout item takes type, label, fields and, on a collapsible, position`;
          }
    : {
          fields: `kizuna: the field "${DuplicateFieldNames<DataFieldTuple<FlatItems<Fields>>>}" is listed twice`;
      };

const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const LAYOUT_TYPES: readonly string[] = ['tab', 'row', 'collapsible'];

/**
 * Checks the layout items of a list and the lists inside them. Only an item of
 * the outermost list sits in the sidebar, since the sidebar is beside the
 * whole form.
 */
const assertLayout = (fields: FieldList, owner: string, nested: boolean): void => {
    for (const item of fields) {
        if (!isLayoutItem(item)) {
            if (nested && item.position !== undefined) {
                throw new Error(
                    `${owner} puts the field '${String(item.name)}' in the sidebar from inside a layout item. Only an outermost item sits there.`
                );
            }
            continue;
        }
        if (!LAYOUT_TYPES.includes(item.type)) {
            throw new Error(`${owner} has a layout item of type '${String(item.type)}'. A layout item is a tab, a row or a collapsible.`);
        }
        if (item.type !== 'row' && (typeof item.label !== 'string' || item.label === '')) {
            throw new Error(`${owner} has a ${item.type} with no label. A ${item.type} needs one for editors to read.`);
        }
        if (!Array.isArray(item.fields) || item.fields.length === 0) {
            throw new Error(`${owner} has a ${item.type} that holds no fields.`);
        }
        if (item.type === 'collapsible' && item.position !== undefined) {
            if (item.position !== 'sidebar') {
                throw new Error(
                    `${owner} gives the collapsible '${item.label}' the position '${String(item.position)}'. The one position is 'sidebar'.`
                );
            }
            if (nested) {
                throw new Error(
                    `${owner} puts the collapsible '${item.label}' in the sidebar from inside a layout item. Only an outermost item sits there.`
                );
            }
        }
        assertLayout(item.fields, owner, true);
    }
};

/**
 * Checks a field list the way `block` and `page` do, and throws naming the owner
 * and the field. Field names are identifiers, since they form dotted paths.
 */
export const assertFields = (fields: FieldList, owner: string): void => {
    if (!Array.isArray(fields) || fields.length === 0) {
        throw new Error(`${owner} lists no fields. Every block and page declares the fields editors may change.`);
    }
    assertLayout(fields, owner, false);
    const seen = new Set<string>();
    for (const field of dataFields(fields)) {
        if (typeof field.name !== 'string' || !FIELD_NAME.test(field.name)) {
            throw new Error(
                `${owner} has a field named '${String(field.name)}'. A field name is an identifier, like 'heading' or 'cta_text'.`
            );
        }
        if (seen.has(field.name)) {
            throw new Error(`${owner} lists the field '${field.name}' twice.`);
        }
        seen.add(field.name);
        if (!isZodSchema(field.schema)) {
            throw new Error(`${owner} gives the field '${field.name}' something other than a Zod schema.`);
        }
        if (field.options !== undefined) {
            const values = enumValuesOf(field.schema);
            if (values === undefined) {
                throw new Error(`${owner} gives the field '${field.name}' options, which only an enum or a list of one takes.`);
            }
            for (const value of Object.keys(field.options)) {
                if (!values.includes(value)) {
                    throw new Error(`${owner} labels the option '${value}' of '${field.name}', which its enum does not have.`);
                }
            }
        }
        if (field.position !== undefined && field.position !== 'sidebar') {
            throw new Error(
                `${owner} gives the field '${field.name}' the position '${String(field.position)}'. The one position is 'sidebar'.`
            );
        }
        if (field.width !== undefined && (typeof field.width !== 'string' || field.width === '')) {
            throw new Error(`${owner} gives the field '${field.name}' a width that is no CSS length, like '50%'.`);
        }
    }
};

/**
 * The values of an enum, or of the enum a list holds, under any `.optional()`
 * or `.default()`, or `undefined` for any other schema.
 */
const enumValuesOf = (schema: z.ZodType): string[] | undefined => {
    const inner = unwrapOptionalWrappers(schema).inner as unknown as {
        options?: unknown;
        _zod?: {
            def?: {
                type?: string;
                element?: z.ZodType;
            };
        };
    };
    const def = inner._zod?.def;
    if (def?.type === 'array' && def.element !== undefined) return enumValuesOf(def.element);
    return def?.type === 'enum' && Array.isArray(inner.options) ? inner.options.map(String) : undefined;
};

/**
 * The shape a field list builds, for `z.object`.
 */
export const shapeOf = <Fields extends FieldList>(fields: Fields): ShapeOf<Fields> => {
    const shape: Record<string, z.ZodType> = {};
    for (const field of dataFields(fields)) shape[field.name] = field.schema;
    return shape as ShapeOf<Fields>;
};

const agentFacingSchemas = new WeakSet<z.core.$ZodType>();

/**
 * Marks a built-in schema whose description is written for agents, like
 * `RichTextSchema`'s, so a field using it shows only its own description.
 */
export const describedForAgents = <Schema extends z.core.$ZodType>(schema: Schema): Schema => {
    agentFacingSchemas.add(schema);
    return schema;
};

/**
 * A schema's `.describe()` text, unless the schema is a `Kizuna.model` or a
 * built-in schema, whose description says what the schema is rather than what
 * the field holds.
 */
const ownDescription = (schema: z.core.$ZodType): string | undefined =>
    readModelSchema(schema) === schema || agentFacingSchemas.has(schema) ? undefined : readMetaDescription(schema);

/**
 * The guidance a field shows: its own `description`, or the schema's
 * `.describe()` text, read through `.optional()` and `.default()`. A model's
 * own description, like `ImageSchema`'s, never shows under a field, and nor
 * does a built-in schema's, like `RichTextSchema`'s.
 */
export const fieldDescription = (field: Field): string | undefined => {
    if (field.description !== undefined) return field.description;
    return ownDescription(field.schema) ?? ownDescription(unwrapOptionalWrappers(field.schema).inner);
};

/**
 * One role a field accepts that the identity does not declare.
 */
export interface UndeclaredFieldRole {
    field: string;
    role: string;
}

const toList = (roles: string | readonly string[]): readonly string[] => (typeof roles === 'string' ? [roles] : roles);

/**
 * The roles the fields accept that the identity does not declare, each with the
 * field that names it. `defineConfig` and `kizuna generate` fail on any.
 */
export const undeclaredFieldRoles = (fields: FieldList, declared: readonly string[]): UndeclaredFieldRole[] => {
    const undeclared: UndeclaredFieldRole[] = [];
    for (const field of dataFields(fields)) {
        for (const role of toList(field.auth?.roles ?? [])) {
            if (!declared.includes(role)) {
                undeclared.push({
                    field: field.name,
                    role,
                });
            }
        }
    }
    return undeclared;
};
