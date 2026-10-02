import type { z } from 'zod';
import type { RequiredPermissions } from 'kizunajs';
import { isZodSchema, readMetaDescription, unwrapOptionalWrappers } from 'kizunajs/generator';

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
}

/**
 * The fields of a block or a page, in the order they are shown.
 */
export type FieldList = readonly Field[];

/**
 * The object shape a field list builds: each field's name to its schema.
 */
export type ShapeOf<Fields extends FieldList> = {
    [Each in Fields[number] as Each['name']]: Each['schema'];
};

type DuplicateFieldNames<Fields extends readonly { name: string }[]> = Fields extends readonly [
    infer Head extends { name: string },
    ...infer Rest extends readonly { name: string }[],
]
    ? (Head['name'] extends Rest[number]['name'] ? Head['name'] : never) | DuplicateFieldNames<Rest>
    : never;

type FieldOption = keyof Field;

type UnknownFieldOptions<Fields extends readonly object[]> = {
    [Index in keyof Fields]: Exclude<keyof Fields[Index], FieldOption> & string;
}[number];

/**
 * Rejects a field list that names a field twice, or gives a field an option it
 * does not take. Intersect it with the definition
 * (`definition: Definition & FieldsCheck<Fields>`): a sound list gives
 * `unknown`, leaving the definition untouched, and anything else resolves
 * `fields` to a message.
 */
export type FieldsCheck<Fields extends readonly { name: string }[]> = [DuplicateFieldNames<Fields>] extends [never]
    ? [UnknownFieldOptions<Fields>] extends [never]
        ? unknown
        : {
              fields: `kizuna: "${UnknownFieldOptions<Fields>}" is not a field option. A field takes name, schema, description, auth and readOnly`;
          }
    : {
          fields: `kizuna: the field "${DuplicateFieldNames<Fields>}" is listed twice`;
      };

const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Checks a field list the way `block` and `page` do, and throws naming the owner
 * and the field. Field names are identifiers, since they form dotted paths.
 */
export const assertFields = (fields: FieldList, owner: string): void => {
    if (!Array.isArray(fields) || fields.length === 0) {
        throw new Error(`${owner} lists no fields. Every block and page declares the fields editors may change.`);
    }
    const seen = new Set<string>();
    for (const field of fields) {
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
                throw new Error(`${owner} gives the field '${field.name}' options, which only an enum takes.`);
            }
            for (const value of Object.keys(field.options)) {
                if (!values.includes(value)) {
                    throw new Error(`${owner} labels the option '${value}' of '${field.name}', which its enum does not have.`);
                }
            }
        }
    }
};

/**
 * The values of an enum, under any `.optional()` or `.default()`, or
 * `undefined` for any other schema.
 */
const enumValuesOf = (schema: z.ZodType): string[] | undefined => {
    const inner = unwrapOptionalWrappers(schema).inner as unknown as { options?: unknown; _zod?: { def?: { type?: string } } };
    return inner._zod?.def?.type === 'enum' && Array.isArray(inner.options) ? inner.options.map(String) : undefined;
};

/**
 * The shape a field list builds, for `z.object`.
 */
export const shapeOf = <Fields extends FieldList>(fields: Fields): ShapeOf<Fields> => {
    const shape: Record<string, z.ZodType> = {};
    for (const field of fields) shape[field.name] = field.schema;
    return shape as ShapeOf<Fields>;
};

/**
 * The guidance a field shows: its own `description`, or the schema's
 * `.describe()` text, read through `.optional()` and `.default()`.
 */
export const fieldDescription = (field: Field): string | undefined => {
    if (field.description !== undefined) return field.description;
    return readMetaDescription(field.schema) ?? readMetaDescription(unwrapOptionalWrappers(field.schema).inner);
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
    for (const field of fields) {
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
