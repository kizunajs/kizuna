/**
 * The field a condition names to filter by the item's status, which no
 * field of a collection can be called.
 */
export const STATUS_FIELD = '@status';

/**
 * How a condition compares: the value itself, or with `within` and
 * `outside`, the value and every item under it in its collection's tree.
 */
export type Operator = 'is' | 'isNot' | 'within' | 'outside';

/**
 * One row of the filters: a field, how it compares, and the value picked.
 * `join` says how it meets the row above, and the first row's is ignored.
 */
export interface Condition {
    join: 'and' | 'or';
    field: string;
    operator: Operator;
    value: string | undefined;
}

export type Filters = readonly Condition[];

export const NO_FILTERS: Filters = [];

/**
 * The statuses an item can have, as the status filter offers them.
 */
export const STATUS_CHOICES: ReadonlyArray<{ value: string; label: string }> = [
    {
        value: 'published',
        label: 'Published',
    },
    {
        value: 'draft',
        label: 'Draft',
    },
    {
        value: 'changed',
        label: 'Changed',
    },
];

/**
 * The conditions that hold a value, which are the ones that filter.
 */
export const activeConditions = (filters: Filters): Condition[] => filters.filter((condition) => condition.value !== undefined);

export const isFiltering = (filters: Filters): boolean => activeConditions(filters).length > 0;

/**
 * The active conditions in groups: the rows joined by `and` share a group,
 * and each `or` starts the next one.
 */
export const groupsOf = (filters: Filters): Condition[][] => {
    const groups: Condition[][] = [];
    for (const condition of activeConditions(filters)) {
        const last = groups.at(-1);
        if (last === undefined || condition.join === 'or') groups.push([condition]);
        else last.push(condition);
    }
    return groups;
};

/**
 * The `filter` the list route reads: each condition `field:operator:value`,
 * the status as `status`, and `or` before each group after the first.
 */
export const filterEntriesOf = (filters: Filters): string[] =>
    groupsOf(filters).flatMap((group, index) => [
        ...(index === 0 ? [] : ['or']),
        ...group.map(
            (condition) => `${condition.field === STATUS_FIELD ? 'status' : condition.field}:${condition.operator}:${condition.value ?? ''}`
        ),
    ]);

/**
 * The filters with one condition changed, or removed with `undefined`.
 */
export const withCondition = (filters: Filters, index: number, condition: Condition | undefined): Condition[] =>
    condition === undefined
        ? filters.filter((_, position) => position !== index)
        : filters.map((current, position) => (position === index ? condition : current));
