import { z } from 'zod';
import {
    assertFields,
    dataFields,
    objectOf,
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
 * What `list` returns: one page of the records and how many match in all, or
 * every record that matches, alone or under `data` as Stripe's lists hold
 * them, for the CMS to page.
 */
export type ViewRecords =
    | {
          items: readonly object[];
          total: number;
      }
    | readonly object[]
    | {
          data: readonly object[];
      };

/**
 * How a condition on a view's list compares. On a field holding a list, `is`
 * means the list holds the value.
 */
export type ViewOperator = 'is' | 'isNot';

type FieldSchemaOf<Fields extends FieldList, Name> = Name extends 'id'
    ? z.ZodString
    : Extract<
          DataFieldOf<Fields>,
          {
              name: Name;
          }
      >['schema'];

/**
 * The value a condition compares with: what the field holds, or one entry of
 * a list.
 */
type ConditionValueOf<Schema> =
    NonNullable<z.output<Schema & z.ZodType>> extends readonly (infer Entry)[] ? Entry : NonNullable<z.output<Schema & z.ZodType>>;

/**
 * One condition on a view's list: a field of its `filters`, how it compares,
 * and a value of the field's own type.
 */
export type ViewCondition<Fields extends FieldList = FieldList, Filter extends string = string> = {
    [Name in Filter]: {
        field: Name;
        operator: ViewOperator;
        value: ConditionValueOf<FieldSchemaOf<Fields, Name>>;
    };
}[Filter];

/**
 * What `list` receives: the search, sets of conditions of which a record
 * matches any one whole set, the sort, and the page.
 */
export interface ViewListInput<Fields extends FieldList = FieldList, Filter extends string = string, Sort extends string = string> {
    /**
     * What the editor typed in the search box, or `''`.
     */
    query: string;
    /**
     * Sets of conditions on the fields of `filters`. A record matches when
     * every condition of one set holds, and `[]` filters none.
     */
    filters: ReadonlyArray<ReadonlyArray<ViewCondition<Fields, Filter>>>;
    /**
     * A field of `sorts`, or `undefined` to keep the order `list` chooses.
     */
    orderBy: Sort | undefined;
    direction: 'asc' | 'desc';
    /**
     * How many records the page holds, or `undefined` for every match.
     */
    limit: number | undefined;
    /**
     * How many matching records come before the page.
     */
    offset: number;
    editor: Editor;
}

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
export interface ViewDefinition<
    Name extends string,
    Fields extends FieldList,
    Item extends object,
    Filter extends ViewColumn<Fields> = never,
    Sort extends ViewColumn<Fields> = never,
> {
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
     * The records matching the search box and, once the view names `filters`
     * or `sorts`, the editor's filters, sort and page. A method, so a view
     * typed from its own filters fits where any view goes.
     */
    list(input: ViewListInput<Fields, Filter, Sort>): ViewRecords | Promise<ViewRecords>;
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
    /**
     * The fields the list filters by, which `list` receives conditions on.
     */
    filters?: readonly Filter[];
    /**
     * The fields the list sorts by, which `list` receives as `orderBy`.
     */
    sorts?: readonly Sort[];
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
    Filter extends ViewColumn<Fields> = ViewColumn<Fields>,
    Sort extends ViewColumn<Fields> = ViewColumn<Fields>,
> extends ViewDefinition<Name, Fields, Item, Filter, Sort> {
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
export const defineView = <
    const Name extends string,
    const Fields extends FieldList,
    Item extends object = Record<string, unknown>,
    const Filter extends ViewColumn<Fields> = never,
    const Sort extends ViewColumn<Fields> = never,
>(
    definition: ViewDefinition<Name, Fields, Item, Filter, Sort> & FieldsCheck<Fields>
): View<Name, Fields, Item, Filter, Sort> => {
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
        ['filters', definition.filters ?? []],
        ['sorts', definition.sorts ?? []],
    ];
    for (const [option, listed] of named) {
        for (const name of listed) {
            if (!names.has(name)) throw new Error(`${owner} names '${name}' in \`${option}\`, which is not one of its fields or 'id'.`);
        }
    }
    return {
        ...definition,
        [VIEW]: true,
        schema: objectOf(definition.fields),
    } as View<Name, Fields, Item, Filter, Sort>;
};

export const isView = (value: unknown): value is View => typeof value === 'object' && value !== null && VIEW in value;
