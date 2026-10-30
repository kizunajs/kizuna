import { z } from 'zod';
import { readMetaBrand } from 'kizunajs/generator';
import { assertFields, dataFields, shapeOf, type DataFieldOf, type FieldList, type FieldsCheck, type ShapeOf } from './field.js';
import type { PageMigration } from './page.js';
import { assertActions, type Action } from './action.js';
import type { Resolved } from './output.js';

/**
 * What every kind of content shares: its name, its fields, and the schema they
 * build.
 */
export interface ContentDefinition {
    readonly name: string;
    readonly label?: string;
    readonly fields: FieldList;
    readonly migrate?: Readonly<Record<number, PageMigration>>;
    readonly group?: string;
    readonly requireReview?: boolean;
    readonly schema: z.ZodType;
}

interface SharedOptions<Name extends string, Fields extends FieldList> {
    /**
     * How the content is read and addressed by the tools, camelCase.
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
     * version.
     */
    migrate?: Readonly<Record<number, PageMigration>>;
    /**
     * Where the content is listed in `/cms` and for the agent, such as
     * `'Company'`.
     */
    group?: string;
    /**
     * Publishing waits for someone other than the person who changed it to
     * approve the draft. For a collection, each item's.
     */
    requireReview?: boolean;
}

// Registry-global: discovery and the reader check them on modules another copy of this package may have made.
export const GLOBAL: unique symbol = Symbol.for('kizuna.cms.global') as symbol as typeof GLOBAL;
export const COLLECTION: unique symbol = Symbol.for('kizuna.cms.collection') as symbol as typeof COLLECTION;

/**
 * What {@link defineGlobal} takes.
 */
export type GlobalDefinition<Name extends string, Fields extends FieldList> = SharedOptions<Name, Fields>;

/**
 * Content with one instance and no route: navigation, a footer, site settings.
 */
export interface Global<Name extends string = string, Fields extends FieldList = FieldList> extends GlobalDefinition<Name, Fields> {
    readonly [GLOBAL]: true;
    readonly schema: z.ZodObject<ShapeOf<Fields>, z.core.$strip>;
}

/**
 * What {@link defineCollection} takes.
 */
export interface CollectionDefinition<Name extends string, Fields extends FieldList, Id extends z.ZodType> extends SharedOptions<
    Name,
    Fields
> {
    /**
     * The brand every item's id carries, made with `Kizuna.brand`, so pages
     * reference items the way they reference app data.
     *
     * @example
     * id: EmployeeId,
     */
    id: Id;
    /**
     * The fields `list()` may filter and sort by. Each becomes an index in the
     * migration `kizuna cms migrate` writes.
     */
    indexes?: ReadonlyArray<DataFieldOf<Fields>['name']>;
    /**
     * The fields the admin's list shows beside each item's title, until an
     * editor hides them. The fields of `indexes` are offered too, and only
     * those sort.
     *
     * @example
     * columns: ['department', 'role'],
     */
    columns?: ReadonlyArray<DataFieldOf<Fields>['name']>;
    /**
     * The field holding the id of the item above, which nests the items into
     * a tree. Its schema is the collection's own id, optional, and an item
     * without one is at the top.
     *
     * @example
     * tree: 'parent',
     */
    tree?: DataFieldOf<Fields>['name'];
    /**
     * Buttons on an item, keyed by name, each running your own handler on the
     * published item.
     *
     * @example
     * actions: {
     *     send: {
     *         confirm: 'Send to everyone on the weekly list?',
     *         handler: async ({ item, plugins }) => {
     *             await plugins.resend.sendBroadcast({
     *                 subject: item.subject,
     *             });
     *         },
     *     },
     * },
     */
    actions?: Readonly<Record<string, Action<CollectionItem<Fields, Id>>>>;
    /**
     * The page of your app the admin's Live Preview shows an item on. `url`
     * returns its path on the site, which opens in draft mode.
     *
     * @example
     * preview: {
     *     url: ({ item }) => `/preview/employees/${item.id}`,
     * },
     */
    preview?: CollectionPreview<DraftItem<Fields, Id>>;
}

/**
 * Where the admin's Live Preview shows an item.
 */
export interface CollectionPreview<Item> {
    /**
     * The item's preview page, as a path on the site, such as `'/team'`.
     * A method, so one typed from a collection's items still fits where any
     * collection's is taken.
     */
    url(input: { item: Item }): string;
}

/**
 * An item as its draft stands, which may still be missing fields: its id
 * and the values saved so far.
 */
export type DraftItem<Fields extends FieldList, Id extends z.ZodType> = {
    id: z.output<Id>;
} & Partial<z.output<z.ZodObject<ShapeOf<Fields>, z.core.$strip>>>;

/**
 * One published item of a collection, as an action receives it.
 */
export type CollectionItem<Fields extends FieldList, Id extends z.ZodType> = {
    id: z.output<Id>;
} & Resolved<z.output<z.ZodObject<ShapeOf<Fields>, z.core.$strip>>>;

/**
 * Content with many instances and no route: team members, testimonials, FAQs.
 */
export interface Collection<
    Name extends string = string,
    Fields extends FieldList = FieldList,
    Id extends z.ZodType = z.ZodType,
> extends CollectionDefinition<Name, Fields, Id> {
    readonly [COLLECTION]: true;
    readonly schema: z.ZodObject<ShapeOf<Fields>, z.core.$strip>;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const assertShared = (definition: SharedOptions<string, FieldList>, made: string): void => {
    if (typeof definition.name !== 'string' || !NAME.test(definition.name)) {
        throw new Error(`${made}() has the name '${String(definition.name)}'. A name is an identifier, like 'site' or 'employees'.`);
    }
    const owner = `${made}('${definition.name}')`;
    assertFields(definition.fields, owner);
    for (const version of Object.keys(definition.migrate ?? {})) {
        if (!/^[1-9][0-9]*$/.test(version)) {
            throw new Error(`${owner} has a migrate step '${version}'. Steps are keyed by version number, starting at 1.`);
        }
    }
};

/**
 * Define content with one instance and no route, such as the navigation or
 * the footer. A component reads it itself, so pages need no field for it.
 *
 * @example
 * export const Site = defineGlobal({
 *     name: 'site',
 *     fields: [
 *         {
 *             name: 'footerText',
 *             schema: z.string().max(160),
 *         },
 *     ],
 * });
 */
export const defineGlobal = <const Name extends string, const Fields extends FieldList>(
    definition: GlobalDefinition<Name, Fields> & FieldsCheck<Fields>
): Global<Name, Fields> => {
    assertShared(definition, 'defineGlobal');
    return {
        ...definition,
        [GLOBAL]: true,
        schema: z.object(shapeOf(definition.fields)),
    } as Global<Name, Fields>;
};

/**
 * Define content with many instances and no route, such as team members.
 * Editors create and delete items; pages list them or reference them by id.
 *
 * @example
 * export const Employees = defineCollection({
 *     name: 'employees',
 *     id: EmployeeId,
 *     fields: [
 *         {
 *             name: 'name',
 *             schema: z.string().min(1).max(80),
 *         },
 *     ],
 *     indexes: ['name'],
 * });
 */
export const defineCollection = <const Name extends string, const Fields extends FieldList, const Id extends z.ZodType>(
    definition: CollectionDefinition<Name, Fields, Id> & FieldsCheck<Fields>
): Collection<Name, Fields, Id> => {
    assertShared(definition, 'defineCollection');
    const owner = `defineCollection('${definition.name}')`;
    if (readMetaBrand(definition.id) === undefined) {
        throw new Error(`${owner} needs an \`id\` made with Kizuna.brand, such as Kizuna.brand('EmployeeId', z.string()).`);
    }
    const names = new Set(dataFields(definition.fields).map((field) => field.name));
    for (const index of definition.indexes ?? []) {
        if (!names.has(index)) throw new Error(`${owner} indexes '${index}', which is not one of its fields.`);
        if (index === 'status' || index === 'updatedAt') {
            throw new Error(`${owner} indexes '${index}', which the editing list uses for the item's own ${index}. Rename the field.`);
        }
    }
    for (const column of definition.columns ?? []) {
        if (!names.has(column)) throw new Error(`${owner} has the column '${column}', which is not one of its fields.`);
    }
    assertActions(definition.actions, owner);
    if (definition.preview !== undefined && typeof definition.preview.url !== 'function') {
        throw new Error(`${owner} has a \`preview\` without a \`url\` function, like ({ item }) => \`/team/\${item.id}\`.`);
    }
    return {
        ...definition,
        [COLLECTION]: true,
        schema: z.object(shapeOf(definition.fields)),
    } as Collection<Name, Fields, Id>;
};

export const isGlobal = (value: unknown): value is Global => typeof value === 'object' && value !== null && GLOBAL in value;

export const isCollection = (value: unknown): value is Collection => typeof value === 'object' && value !== null && COLLECTION in value;
