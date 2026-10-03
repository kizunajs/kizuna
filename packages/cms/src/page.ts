import { z } from 'zod';
import { assertFields, shapeOf, type FieldList, type FieldsCheck, type ShapeOf } from './field.js';
import type { Collection } from './definitions.js';

/**
 * One step that brings a stored document up to a newer field list. It receives
 * the document as stored and returns what the page now expects.
 */
export type PageMigration = (document: Record<string, unknown>) => Record<string, unknown>;

/**
 * What {@link definePage} takes.
 */
export interface PageDefinition<Name extends string, Fields extends FieldList> {
    /**
     * How the page is read, `cms.pages.<name>`, and addressed by the tools.
     * camelCase with a `Page` suffix: `frontPage`.
     */
    name: Name;
    /**
     * What editors see it called, such as `'Front Page'`. Defaults to its
     * name, written out.
     */
    label?: string;
    /**
     * The fields editors may change, in the order they are shown.
     */
    fields: Fields;
    /**
     * Steps that bring stored content up to the current fields, keyed by
     * version. Each document records the last step it ran. Reads run newer
     * steps in memory, and the next save stores the result. A new field needs
     * a `.default()` on its schema or a step here, or stored content fails its
     * schema, which `kizuna cms check` reports.
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
    /**
     * Where the page is listed in `/cms` and for the agent, such as
     * `'Landing pages'`.
     */
    group?: string;
    /**
     * Publishing waits for someone other than the person who changed it to
     * approve the draft.
     */
    requireReview?: boolean;
}

/**
 * What {@link definePage} takes for a page at a dynamic route, such as
 * `app/blog/[slug]`, that shows one item of a collection per address.
 */
export interface CollectionPageDefinition<Name extends string, Served extends Collection> {
    /**
     * How the page is read, `cms.pages.<name>`: `articlePage`.
     */
    name: Name;
    /**
     * What editors see it called, such as `'Front Page'`. Defaults to its
     * name, written out.
     */
    label?: string;
    /**
     * The collection the page shows one item of per address. Each route param
     * names the item field it reads, so `[slug]` reads `slug`.
     *
     * @example
     * collection: Articles,
     */
    collection: Served;
    /**
     * Where the page is listed in `/cms` and for the agent.
     */
    group?: string;
}

// Registry-global: discovery reads it off a module another copy of this package may have made.
export const PAGE: unique symbol = Symbol.for('kizuna.cms.page') as symbol as typeof PAGE;

/**
 * What {@link definePage} returns: the definition, and the object schema every
 * write is checked against.
 */
export interface Page<
    Name extends string = string,
    Fields extends FieldList = FieldList,
    Served extends Collection | undefined = Collection | undefined,
> extends PageDefinition<Name, Fields> {
    readonly [PAGE]: true;
    /**
     * The collection a page at a dynamic route shows, or `undefined`.
     */
    readonly collection: Served;
    /**
     * The whole page as one Zod object, one property per field.
     */
    readonly schema: z.ZodObject<ShapeOf<Fields>, z.core.$strip>;
}

const PAGE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Define a page at a dynamic route, such as `app/blog/[slug]`, that shows one
 * item of a collection per address. Its content is the item's.
 *
 * @example
 * export default definePage({
 *     name: 'articlePage',
 *     collection: Articles,
 * });
 */
export function definePage<const Name extends string, const Served extends Collection>(
    definition: CollectionPageDefinition<Name, Served>
): Page<Name, [], Served>;
/**
 * Define a page's editable content, as the default export of the `content.ts`
 * beside its route. Discovery finds every one under `app/`, and the page's
 * path comes from its folder.
 *
 * @example
 * export default definePage({
 *     name: 'frontPage',
 *     label: 'Front Page',
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
export function definePage<const Name extends string, const Fields extends FieldList>(
    definition: PageDefinition<Name, Fields> & FieldsCheck<Fields>
): Page<Name, Fields, undefined>;
export function definePage(
    definition: Partial<PageDefinition<string, FieldList>> & {
        name: string;
        label?: string;
        collection?: Collection;
    }
): Page {
    if (typeof definition.name !== 'string' || !PAGE_NAME.test(definition.name)) {
        throw new Error(`definePage() has the name '${String(definition.name)}'. A page name is an identifier, like 'frontPage'.`);
    }
    const owner = `definePage('${definition.name}')`;
    const fields: FieldList = definition.fields ?? [];
    if (definition.collection !== undefined && fields.length > 0) {
        throw new Error(
            `${owner} shows the ${definition.collection.name} collection, so its content is the item's. Put copy every item's page shares in a global.`
        );
    }
    if (definition.collection === undefined) assertFields(fields, owner);
    for (const version of Object.keys(definition.migrate ?? {})) {
        if (!/^[1-9][0-9]*$/.test(version)) {
            throw new Error(`${owner} has a migrate step '${version}'. Steps are keyed by version number, starting at 1.`);
        }
    }
    return {
        ...definition,
        fields,
        collection: definition.collection,
        [PAGE]: true,
        schema: z.object(shapeOf(fields)),
    } as Page;
}

/**
 * Whether a page shows the items of a collection, one per address.
 */
export const servesCollection = (value: Page): value is Page<string, FieldList, Collection> => value.collection !== undefined;

/**
 * Whether a module export is a page `definePage` made.
 */
export const isPage = (value: unknown): value is Page => typeof value === 'object' && value !== null && PAGE in value;
