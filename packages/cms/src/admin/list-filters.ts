/**
 * The value picked for one field, and with `descendants`, the items under it
 * in its collection's tree too.
 */
export interface FieldFilter {
    value: string;
    descendants: boolean;
}

/**
 * What the list keeps: a status, and a value for each field filtered by.
 */
export interface Filters {
    status: string | undefined;
    fields: Readonly<Record<string, FieldFilter>>;
}

export const NO_FILTERS: Filters = {
    status: undefined,
    fields: {},
};

/**
 * The statuses an item can have, as the status filter offers them.
 */
export const STATUS_CHOICES: ReadonlyArray<{ value: string; label: string }> = [
    {
        value: 'draft',
        label: 'Draft',
    },
    {
        value: 'published',
        label: 'Published',
    },
    {
        value: 'changed',
        label: 'Unpublished changes',
    },
];

export const isFiltering = (filters: Filters): boolean => filters.status !== undefined || Object.keys(filters.fields).length > 0;

/**
 * The filters with one field's value set, or cleared with `undefined`.
 */
export const withField = (filters: Filters, field: string, filter: FieldFilter | undefined): Filters => {
    const { [field]: _, ...rest } = filters.fields;
    return {
        ...filters,
        fields:
            filter === undefined
                ? rest
                : {
                      ...rest,
                      [field]: filter,
                  },
    };
};

/**
 * The queries the list route answers the field filters with. It takes one
 * field at a time, so each filter is its own query, and an item shows when
 * every answer holds it. No filter is one query for every item.
 */
export const itemQueriesOf = (fields: Filters['fields']): Array<Record<string, string | boolean>> => {
    const entries = Object.entries(fields);
    if (entries.length === 0) return [{}];
    return entries.map(([field, filter]) => ({
        field,
        value: filter.value,
        ...(filter.descendants
            ? {
                  descendants: true,
              }
            : {}),
    }));
};

/**
 * The items of the first answer that every other answer holds too, matched
 * by ref.
 */
export const inEvery = <Item extends { ref: string }>(answers: ReadonlyArray<readonly Item[]>): Item[] => {
    const [first, ...others] = answers;
    if (first === undefined) return [];
    const held = others.map((answer) => new Set(answer.map((item) => item.ref)));
    return first.filter((item) => held.every((refs) => refs.has(item.ref)));
};

/**
 * Whether a row has the status picked, when one is.
 */
export const hasStatus = (row: { status: string }, status: string | undefined): boolean => status === undefined || row.status === status;
