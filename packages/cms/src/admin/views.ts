import { humanize, type DescribedField, type DescribedLayout } from '../view/schema.js';
import { toolSegment, type AdminCall, type AvailableAction } from './actions.js';

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
    search: string[];
    readOnly: boolean;
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
 * The call that searches a view's records. An empty search sends no `q`.
 */
export const viewListCall = (view: string, query: string): AdminCall => {
    const search = query.trim();
    return {
        name: viewTool(view, 'list'),
        input: {
            query:
                search === ''
                    ? {}
                    : {
                          q: search,
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
 * A column's heading.
 */
export const columnLabel = (column: string): string => (column === 'id' ? 'ID' : humanize(column));

/**
 * What the search box says it looks in.
 */
export const searchPlaceholder = (view: ViewSummary): string =>
    view.search.length === 0 ? 'Search' : `Search ${view.search.map((field) => columnLabel(field).toLowerCase()).join(', ')}`;

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
