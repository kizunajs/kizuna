import { z } from 'zod';
import { assertFields, shapeOf, type FieldList, type FieldsCheck, type ShapeOf } from './field.js';

/**
 * One step that brings a stored document up to a newer field list. It receives
 * the document as stored and returns what the page now expects.
 */
export type PageMigration = (document: Record<string, unknown>) => Record<string, unknown>;

/**
 * What {@link page} takes.
 */
export interface PageDefinition<Name extends string, Fields extends FieldList> {
    /**
     * How the page is read, `cms.pages.<name>`, and addressed by the tools.
     * camelCase with a `Page` suffix: `springPage`.
     */
    name: Name;
    /**
     * The fields editors may change, in the order they are shown.
     */
    fields: Fields;
    /**
     * What the inline editor and the overview call each field, keyed by field
     * name. A field without one shows its name.
     */
    labels?: {
        readonly [Each in Fields[number] as Each['name']]?: string;
    };
    /**
     * Steps that bring stored content up to the current fields, keyed by
     * version. Each document records the last step it ran, and newer steps run
     * once on read. A new field needs a `.default()` on its schema or a step
     * here, or `kizuna diff` fails.
     *
     * @example
     * migrate: {
     *     1: (document) => ({
     *         ...document,
     *         subheading: '',
     *     }),
     * },
     */
    migrate?: Readonly<Record<number, PageMigration>>;
}

// Registry-global: discovery reads it off a module another copy of this package may have made.
export const PAGE: unique symbol = Symbol.for('kizuna.cms.page') as symbol as typeof PAGE;

/**
 * What {@link page} returns: the definition, and the object schema every write
 * is checked against.
 */
export interface Page<Name extends string = string, Fields extends FieldList = FieldList> extends PageDefinition<Name, Fields> {
    readonly [PAGE]: true;
    /**
     * The whole page as one Zod object, one property per field.
     */
    readonly schema: z.ZodObject<ShapeOf<Fields>, z.core.$strip>;
}

const PAGE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Define a page's editable content, as the default export of the `content.ts`
 * beside its route. Discovery finds every one under `app/`, and the page's path
 * comes from its folder.
 *
 * @example
 * export default page({
 *     name: 'springPage',
 *     fields: [
 *         {
 *             name: 'hero',
 *             schema: HeroBlockSchema,
 *         },
 *         {
 *             name: 'seo',
 *             schema: SeoSchema,
 *             auth: {
 *                 roles: 'admin',
 *             },
 *         },
 *     ],
 * });
 */
export const page = <const Name extends string, const Fields extends FieldList>(
    definition: PageDefinition<Name, Fields> & FieldsCheck<Fields>
): Page<Name, Fields> => {
    if (typeof definition.name !== 'string' || !PAGE_NAME.test(definition.name)) {
        throw new Error(`page() has the name '${String(definition.name)}'. A page name is an identifier, like 'springPage'.`);
    }
    const owner = `page('${definition.name}')`;
    assertFields(definition.fields, owner);
    const names = new Set(definition.fields.map((field) => field.name));
    for (const label of Object.keys(definition.labels ?? {})) {
        if (!names.has(label)) {
            throw new Error(`${owner} labels '${label}', which is not one of its fields.`);
        }
    }
    for (const version of Object.keys(definition.migrate ?? {})) {
        if (!/^[1-9][0-9]*$/.test(version)) {
            throw new Error(`${owner} has a migrate step '${version}'. Steps are keyed by version number, starting at 1.`);
        }
    }
    return {
        ...definition,
        [PAGE]: true,
        schema: z.object(shapeOf(definition.fields)),
    } as Page<Name, Fields>;
};

/**
 * Whether a module export is a page `page` made.
 */
export const isPage = (value: unknown): value is Page => typeof value === 'object' && value !== null && PAGE in value;
