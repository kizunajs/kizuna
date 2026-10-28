import { z } from 'zod';
import {
    assertFields,
    dataFields,
    shapeOf,
    type DataFieldOf,
    type FieldAuth,
    type FieldList,
    type FieldsCheck,
    type ShapeOf,
} from './field.js';
import { assertActions, type Action, type ActionContext, type Editor } from './action.js';

/**
 * A field name, or `id`, which every record has.
 */
export type ViewColumn<Fields extends FieldList> = DataFieldOf<Fields>['name'] | 'id';

/**
 * What `list` returns: the records, or an object holding them under `data`,
 * as Stripe's lists do.
 */
export type ViewRecords = readonly object[] | { data: readonly object[] };

/**
 * The fields a `save` receives: the ones the editor may change.
 */
export type ViewData<Fields extends FieldList> = Partial<z.output<z.ZodObject<ShapeOf<Fields>, z.core.$strip>>>;

/**
 * A view's buttons. `save` is the main one and receives `data`.
 */
export interface ViewActions<Item, Fields extends FieldList> {
    /**
     * Saves the fields the editor changed. Without it, the view is read only.
     */
    save?: Action<
        Item,
        ActionContext<Item> & {
            data: ViewData<Fields>;
        }
    >;
    [key: string]: Action<Item> | undefined;
}

/**
 * What {@link defineView} takes.
 */
export interface ViewDefinition<Name extends string, Fields extends FieldList, Item extends object> {
    /**
     * The view's key, camelCase.
     */
    name: Name;
    /**
     * What editors see it called. Without it, the name, written out.
     */
    label?: string;
    /**
     * The heading the admin's sidebar lists it under. Without it, Content.
     */
    group?: string;
    /**
     * Who sees the view at all, in a field's words.
     */
    auth?: FieldAuth;
    /**
     * What editors see of each record, in the order they are shown.
     */
    fields: Fields;
    /**
     * The records matching what the editor typed in the search box.
     */
    list: (input: { query: string; editor: Editor }) => ViewRecords | Promise<ViewRecords>;
    /**
     * One record by its id, or `undefined` when there is none.
     */
    get: (input: { id: string; editor: Editor }) => Item | null | undefined | Promise<Item | null | undefined>;
    /**
     * Buttons on a record, keyed by name.
     */
    actions?: ViewActions<Item, Fields>;
    /**
     * The field that names each record in the list. Without it, the first
     * text field.
     */
    title?: ViewColumn<Fields>;
    /**
     * The fields the list shows. Without them, the title.
     */
    columns?: readonly ViewColumn<Fields>[];
    /**
     * The fields the search box looks in, so the editor can say so.
     */
    search?: readonly ViewColumn<Fields>[];
}

// Registry-global, like the other definitions, so another copy of this package recognises it.
export const VIEW: unique symbol = Symbol.for('kizuna.cms.view') as symbol as typeof VIEW;

/**
 * Data the CMS shows and changes but does not store.
 */
export interface View<
    Name extends string = string,
    Fields extends FieldList = FieldList,
    Item extends object = object,
> extends ViewDefinition<Name, Fields, Item> {
    readonly [VIEW]: true;
    readonly schema: z.ZodObject<ShapeOf<Fields>, z.core.$strip>;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Define data the CMS shows and changes but does not store, like your app's
 * users, read and saved by your own functions.
 *
 * @example
 * export const AppUsers = defineView({
 *     name: 'appUsers',
 *     fields: [
 *         {
 *             name: 'email',
 *             schema: z.email(),
 *         },
 *     ],
 *     list: async ({ query }) => {
 *         return searchAppUsers(query);
 *     },
 *     get: async ({ id }) => {
 *         return getAppUser(id);
 *     },
 *     actions: {
 *         save: async ({ id, data }) => {
 *             return updateAppUser(id, data);
 *         },
 *     },
 * });
 */
export const defineView = <const Name extends string, const Fields extends FieldList, Item extends object = Record<string, unknown>>(
    definition: ViewDefinition<Name, Fields, Item> & FieldsCheck<Fields>
): View<Name, Fields, Item> => {
    if (typeof definition.name !== 'string' || !NAME.test(definition.name)) {
        throw new Error(`defineView() has the name '${String(definition.name)}'. A name is an identifier, like 'appUsers'.`);
    }
    const owner = `defineView('${definition.name}')`;
    assertFields(definition.fields, owner);
    for (const reader of ['list', 'get'] as const) {
        if (typeof definition[reader] !== 'function') {
            throw new Error(`${owner} needs a \`${reader}\` function, which reads the records from where they live.`);
        }
    }
    assertActions(definition.actions, owner);
    const names = new Set(['id', ...dataFields(definition.fields).map((field) => field.name)]);
    const named: Array<[string, readonly string[]]> = [
        ['title', definition.title === undefined ? [] : [definition.title]],
        ['columns', definition.columns ?? []],
        ['search', definition.search ?? []],
    ];
    for (const [option, listed] of named) {
        for (const name of listed) {
            if (!names.has(name)) throw new Error(`${owner} names '${name}' in \`${option}\`, which is not one of its fields or 'id'.`);
        }
    }
    return {
        ...definition,
        [VIEW]: true,
        schema: z.object(shapeOf(definition.fields)),
    } as View<Name, Fields, Item>;
};

export const isView = (value: unknown): value is View => typeof value === 'object' && value !== null && VIEW in value;
