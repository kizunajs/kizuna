import { humanize, type DescribedField, type DescribedLayout } from '../view/schema.js';
import { toolSegment, type AdminCall, type AvailableAction } from './actions.js';
import type { ListFilter } from './config.js';
import type { ColumnFormat, ListColumn, Sort } from './list-columns.js';

/**
 * A view as the editing routes list it.
 */
export interface ViewSummary {
    name: string;
    label: string;
    /**
     * The field that names each record in the list.
     */
    title: string;
    columns: string[];
    /**
     * For each column holding a choice, the label of each value.
     */
    options?: Record<string, Record<string, string>>;
    /**
     * For each column and searched field whose field declares a `label`,
     * that label.
     */
    labels?: Record<string, string>;
    /**
     * For each column holding a date, or a date and time, its format.
     */
    formats?: Record<string, ColumnFormat>;
    search: string[];
    /**
     * The fields its `list` filters by, with the values a condition may name.
     */
    filters?: ListFilter[];
    /**
     * The fields its `list` sorts by.
     */
    sorts?: string[];
    readOnly: boolean;
}

/**
 * Whether a view's `list` filters, sorts and pages, so the admin asks it for
 * each page rather than sorting and paging what it returns.
 */
export const servesPages = (view: ViewSummary): boolean => (view.filters ?? []).length > 0 || (view.sorts ?? []).length > 0;

/**
 * What the admin asks a view's `list` for beyond the search: the conditions
 * as the route reads them, the sort and one page.
 */
export interface ViewPageQuery {
    filter: readonly string[];
    sort: Sort | undefined;
    limit: number;
    offset: number;
}

/**
 * One record in a view's list.
 */
export interface ViewRow {
    id: string;
    title: string;
    values: Record<string, unknown>;
}

/**
 * One record as its view's `get` route answers it.
 */
export interface ViewRecord {
    view: string;
    id: string;
    title: string;
    /**
     * Whether the editor may save nothing in it, so it has no Save button.
     */
    readOnly: boolean;
    fields: DescribedField[];
    layout: DescribedLayout[];
    actions: AvailableAction[];
    item: Record<string, unknown>;
}

/**
 * The tool name of one of a view's routes: `list`, `get` or `save`.
 */
export const viewTool = (view: string, route: 'list' | 'get' | 'save'): string =>
    ['editing', 'views', view, route].map(toolSegment).join('_');

/**
 * The call that searches a view's records, and with `page`, filters, sorts
 * and pages them. An empty search sends no `q`.
 */
export const viewListCall = (view: string, query: string, page?: ViewPageQuery): AdminCall => {
    const search = query.trim();
    return {
        name: viewTool(view, 'list'),
        input: {
            query: {
                ...(search === ''
                    ? {}
                    : {
                          q: search,
                      }),
                ...(page === undefined
                    ? {}
                    : {
                          ...(page.filter.length === 0
                              ? {}
                              : {
                                    filter: [...page.filter],
                                }),
                          ...(page.sort === undefined
                              ? {}
                              : {
                                    orderBy: page.sort.column,
                                    direction: page.sort.direction === 'ascending' ? 'asc' : 'desc',
                                }),
                          limit: page.limit,
                          offset: page.offset,
                      }),
            },
        },
    };
};

/**
 * The call that runs one of a view's actions, other than `save`, on a record.
 */
export const viewActionCall = (view: string, id: string, action: string): AdminCall => ({
    name: ['editing', 'views', view, 'actions', action].map(toolSegment).join('_'),
    input: {
        params: {
            id,
        },
    },
});

/**
 * The columns a view's list shows, the title first, each once.
 */
export const columnsOf = (view: ViewSummary): string[] => [view.title, ...view.columns.filter((column) => column !== view.title)];

/**
 * The fields of `sorts` the list does not show, which the editor can add as
 * columns.
 */
export const hiddenSortsOf = (view: ViewSummary): string[] => {
    const shown = columnsOf(view);
    return (view.sorts ?? []).filter((field) => !shown.includes(field));
};

/**
 * A column's heading: its field's `label`, or its name written out.
 */
export const columnLabel = (view: ViewSummary, column: string): string =>
    view.labels?.[column] ?? (column === 'id' ? 'ID' : humanize(column));

/**
 * The format of a column holding a date, or a date and time, as the column
 * carries it.
 */
const formatOf = (view: ViewSummary, column: string): Pick<ListColumn, 'format'> => {
    const format = view.formats?.[column];
    return format === undefined
        ? {}
        : {
              format,
          };
};

/**
 * The columns of a view's list: the title and `columns`, then each field of
 * `sorts` it does not show, until the editor adds it. A view that pages on
 * the server sorts by the fields of `sorts` alone.
 */
export const viewColumnsOf = (view: ViewSummary): ListColumn[] => {
    const serves = servesPages(view);
    const sorts = view.sorts ?? [];
    return [
        ...columnsOf(view).map(
            (column, index): ListColumn => ({
                key: column,
                label: columnLabel(view, column),
                kind: index === 0 ? 'title' : 'text',
                ...formatOf(view, column),
                shown: true,
                fixed: index === 0,
                ...(serves
                    ? {
                          sortable: sorts.includes(column),
                      }
                    : {}),
            })
        ),
        ...hiddenSortsOf(view).map(
            (column): ListColumn => ({
                key: column,
                label: columnLabel(view, column),
                kind: 'text',
                ...formatOf(view, column),
                shown: false,
                sortable: true,
            })
        ),
    ];
};

/**
 * What the search box says it looks in.
 */
export const searchPlaceholder = (view: ViewSummary): string =>
    view.search.length === 0 ? 'Search' : `Search ${view.search.map((field) => columnLabel(view, field).toLowerCase()).join(', ')}`;

/**
 * A record's values with each choice read as the label of its option, so a
 * role of `admin` shows Admin.
 */
export const labelledValues = (view: ViewSummary, values: Readonly<Record<string, unknown>>): Record<string, unknown> =>
    Object.fromEntries(
        Object.entries(values).map(([column, value]) => {
            const options = view.options?.[column];
            if (options === undefined) return [column, value];
            const label = (entry: unknown) => (typeof entry === 'string' ? (options[entry] ?? entry) : entry);
            return [column, Array.isArray(value) ? value.map(label) : label(value)];
        })
    );

/**
 * A value as one cell of the list shows it.
 */
export const cellText = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.map(cellText).join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
};

/**
 * The record with the editor's unsaved changes applied, each keyed by its
 * field's path.
 */
export const withEdits = (item: Record<string, unknown>, edits: Readonly<Record<string, unknown>>): Record<string, unknown> => {
    const merged = structuredClone(item);
    for (const [path, value] of Object.entries(edits)) {
        const segments = path.split('.');
        let cursor: Record<string, unknown> = merged;
        for (const segment of segments.slice(0, -1)) {
            const next = cursor[segment];
            cursor[segment] = typeof next === 'object' && next !== null && !Array.isArray(next) ? next : {};
            cursor = cursor[segment] as Record<string, unknown>;
        }
        cursor[segments.at(-1)!] = value;
    }
    return merged;
};

/**
 * The call that saves a record: every field the editor changed, whole, so a
 * change inside a group sends the group.
 */
export const viewSaveCall = (
    view: string,
    id: string,
    item: Record<string, unknown>,
    edits: Readonly<Record<string, unknown>>
): AdminCall => {
    const merged = withEdits(item, edits);
    const names = new Set(Object.keys(edits).map((path) => path.split('.')[0]!));
    return {
        name: viewTool(view, 'save'),
        input: {
            params: {
                id,
            },
            body: {
                data: Object.fromEntries([...names].map((name) => [name, merged[name]])),
            },
        },
    };
};
