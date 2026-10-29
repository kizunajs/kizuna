import { humanize } from '../view/schema.js';
import type { ListOptions } from './config.js';
import { cellText } from './views.js';

/**
 * What a column shows: the row's title with its path under it, its status,
 * when it last changed, who changed it, or one of its values as text.
 */
export type ColumnKind = 'title' | 'status' | 'date' | 'person' | 'text';

export interface ListColumn {
    key: string;
    label: string;
    kind: ColumnKind;
    /**
     * Shown until the editor hides it.
     */
    shown: boolean;
    /**
     * The title holds the link, so it is always shown.
     */
    fixed?: boolean;
    /**
     * Whether the rows sort by it. A collection's list sorts by its indexes
     * alone, and never by who saved an item.
     */
    sortable?: boolean;
}

/**
 * One row of a list, whatever it lists.
 */
export interface ListRow {
    ref: string;
    href: string;
    title: string;
    /**
     * Shown under the title, like a page's path.
     */
    detail?: string | undefined;
    status?: string | undefined;
    updatedAt?: string | null | undefined;
    /**
     * The id of who saved it last.
     */
    updatedBy?: string | undefined;
    /**
     * The row's values by column, for a view.
     */
    values?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * The columns of a page or a collection's list.
 */
export const DOCUMENT_COLUMNS: readonly ListColumn[] = [
    {
        key: 'title',
        label: 'Title',
        kind: 'title',
        shown: true,
        fixed: true,
    },
    {
        key: 'status',
        label: 'Status',
        kind: 'status',
        shown: true,
    },
    {
        key: 'updatedBy',
        label: 'Updated by',
        kind: 'person',
        shown: false,
    },
    {
        key: 'updated',
        label: 'Updated',
        kind: 'date',
        shown: true,
    },
];

/**
 * What a field's column key starts with, so a field named `title` or
 * `status` keeps its own column.
 */
const FIELD_COLUMN = 'field:';

/**
 * The columns of a collection's list: the title, status and dates, then each
 * field it offers, every field of `indexes` and those `columns` names. Who
 * saved an item last does not sort, since the server cannot.
 */
export const collectionColumnsOf = (options: ListOptions | undefined): ListColumn[] => [
    ...DOCUMENT_COLUMNS.map((column) =>
        column.kind === 'person'
            ? {
                  ...column,
                  sortable: false,
              }
            : column
    ),
    ...(options?.columns ?? []).map(
        (column): ListColumn => ({
            key: `${FIELD_COLUMN}${column.field}`,
            label: column.label ?? humanize(column.field),
            kind: 'text',
            shown: column.shown,
            sortable: column.sortable,
        })
    ),
];

/**
 * The field a column shows, for a column of a collection's field.
 */
export const fieldOfColumn = (key: string): string | undefined =>
    key.startsWith(FIELD_COLUMN) ? key.slice(FIELD_COLUMN.length) : undefined;

/**
 * The cells of a collection's field columns: the label of a choice or an id
 * where the server gives one, else the value.
 */
export const fieldValuesOf = (
    values: Readonly<Record<string, unknown>> | undefined,
    labels: Readonly<Record<string, string>> | undefined
): Record<string, unknown> =>
    Object.fromEntries(Object.entries(values ?? {}).map(([field, value]) => [`${FIELD_COLUMN}${field}`, labels?.[field] ?? value]));

export type SortDirection = 'ascending' | 'descending';

export interface Sort {
    column: string;
    direction: SortDirection;
}

/**
 * Newest first, as a collection lists before the editor sorts it.
 */
export const NEWEST_FIRST: Sort = {
    column: 'updated',
    direction: 'descending',
};

/**
 * The `orderBy` and `direction` the list route sorts by for a sort, or
 * nothing to keep the order it lists in.
 */
export const orderOf = (sort: Sort | undefined): { orderBy?: string; direction?: 'asc' | 'desc' } => {
    if (sort === undefined) return {};
    const orderBy =
        sort.column === 'title'
            ? 'title'
            : sort.column === 'status'
              ? 'status'
              : sort.column === 'updated'
                ? 'updatedAt'
                : fieldOfColumn(sort.column);
    return orderBy === undefined
        ? {}
        : {
              orderBy,
              direction: sort.direction === 'ascending' ? 'asc' : 'desc',
          };
};

const STATUS_ORDER = ['published', 'changed', 'draft', 'empty'];

/**
 * What a row sorts by in one column. `names` turns a person's id into their
 * name.
 */
export const sortValueOf = (row: ListRow, column: ListColumn, names: (id: string) => string): string | number => {
    if (column.kind === 'title') return row.title.toLowerCase();
    if (column.kind === 'status') return STATUS_ORDER.indexOf(row.status ?? '');
    if (column.kind === 'date') return row.updatedAt ?? '';
    if (column.kind === 'person') return row.updatedBy === undefined ? '' : names(row.updatedBy).toLowerCase();
    return cellText(row.values?.[column.key]).toLowerCase();
};

/**
 * The rows in the order a sort names, ties kept in the order they came.
 */
export const sortRows = <Row extends ListRow>(
    rows: readonly Row[],
    sort: Sort | undefined,
    columns: readonly ListColumn[],
    names: (id: string) => string = (id) => id
): Row[] => {
    const column = sort === undefined ? undefined : columns.find((candidate) => candidate.key === sort.column);
    if (sort === undefined || column === undefined) return [...rows];
    const sign = sort.direction === 'ascending' ? 1 : -1;
    return rows
        .map((row, index) => ({
            row,
            index,
            value: sortValueOf(row, column, names),
        }))
        .sort((left, right) => {
            const compared =
                typeof left.value === 'number' && typeof right.value === 'number'
                    ? left.value - right.value
                    : String(left.value).localeCompare(String(right.value));
            return compared === 0 ? left.index - right.index : compared * sign;
        })
        .map((entry) => entry.row);
};

/**
 * The sort a click on a column's heading gives: the other way round on the
 * column already sorted by, else that column, dates newest first.
 */
export const nextSort = (current: Sort | undefined, column: ListColumn): Sort => {
    if (current?.column === column.key) {
        return {
            column: column.key,
            direction: current.direction === 'ascending' ? 'descending' : 'ascending',
        };
    }
    return {
        column: column.key,
        direction: column.kind === 'date' ? 'descending' : 'ascending',
    };
};

/**
 * The keys of the columns shown, from what the editor chose last or the
 * columns' own defaults. A fixed column always shows.
 */
export const shownColumnsOf = (columns: readonly ListColumn[], chosen: readonly string[] | undefined): ListColumn[] =>
    columns.filter((column) => column.fixed === true || (chosen === undefined ? column.shown : chosen.includes(column.key)));

const storageKeyOf = (list: string): string => `kizuna:list-columns:${list}`;

/**
 * The columns an editor chose for a list on this browser, if they chose.
 */
export const readChosenColumns = (list: string): string[] | undefined => {
    try {
        const stored = window.localStorage.getItem(storageKeyOf(list));
        const parsed: unknown = stored === null ? undefined : JSON.parse(stored);
        return Array.isArray(parsed) && parsed.every((key) => typeof key === 'string') ? parsed : undefined;
    } catch {
        return undefined;
    }
};

export const saveChosenColumns = (list: string, keys: readonly string[]): void => {
    try {
        window.localStorage.setItem(storageKeyOf(list), JSON.stringify(keys));
    } catch {
        // A browser that keeps nothing shows the defaults next time.
    }
};

/**
 * The rows one page shows, and where the page sits in the list.
 */
export const pageOf = <Row>(
    rows: readonly Row[],
    page: number,
    perPage: number
): { rows: Row[]; page: number; pageCount: number; first: number; last: number } => {
    const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
    const shown = Math.min(Math.max(page, 0), pageCount - 1);
    const start = shown * perPage;
    const end = Math.min(start + perPage, rows.length);
    return {
        rows: rows.slice(start, end),
        page: shown,
        pageCount,
        first: rows.length === 0 ? 0 : start + 1,
        last: end,
    };
};

/**
 * The page numbers a pager offers: the first, the last, and those around the
 * one shown, with `null` where some are skipped.
 */
export const pagesAround = (current: number, count: number): Array<number | null> => {
    const numbers: Array<number | null> = [];
    for (let page = 0; page < count; page += 1) {
        if (page === 0 || page === count - 1 || Math.abs(page - current) <= 1) numbers.push(page);
        else if (numbers.at(-1) !== null) numbers.push(null);
    }
    return numbers;
};

export const PER_PAGE_CHOICES: readonly number[] = [10, 25, 50, 100];

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

/**
 * When a row last changed, as a list cell says it: "28 Oct 2026, 09:42".
 */
export const dateTimeOf = (iso: string | null | undefined): string => {
    if (iso === null || iso === undefined) return '';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : DATE_TIME.format(date);
};

/**
 * A count with its thousands grouped, as the list's title shows it.
 */
export const countOf = (count: number): string => count.toLocaleString('en-GB');
