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

const negated = (operator: Operator): boolean => operator === 'isNot' || operator === 'outside';

/**
 * The query the list route answers one field condition with. The route
 * keeps the items holding the value, so `is not` asks the same and keeps
 * the others.
 */
export const queryOf = (condition: Condition): Record<string, string | boolean> => ({
    field: condition.field,
    value: condition.value ?? '',
    ...(condition.operator === 'within' || condition.operator === 'outside'
        ? {
              descendants: true,
          }
        : {}),
});

/**
 * What tells one query from another, so two conditions asking the same ask once.
 */
export const queryKeyOf = (query: Record<string, string | boolean>): string => JSON.stringify(query);

/**
 * The queries the list asks: every item first, then one for each field the
 * active conditions name.
 */
export const itemQueriesOf = (filters: Filters): Array<Record<string, string | boolean>> => {
    const queries = new Map<string, Record<string, string | boolean>>([[queryKeyOf({}), {}]]);
    for (const condition of activeConditions(filters)) {
        if (condition.field === STATUS_FIELD) continue;
        const query = queryOf(condition);
        queries.set(queryKeyOf(query), query);
    }
    return [...queries.values()];
};

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
 * The items that meet every condition of at least one group. `held`
 * answers, for a field condition, the refs its query kept.
 */
export const filterItems = <Item extends { ref: string; status: string }>(
    items: readonly Item[],
    filters: Filters,
    held: (query: Record<string, string | boolean>) => ReadonlySet<string> | undefined
): Item[] => {
    const groups = groupsOf(filters);
    if (groups.length === 0) return [...items];
    const meets = (item: Item, condition: Condition): boolean => {
        const matched =
            condition.field === STATUS_FIELD ? item.status === condition.value : (held(queryOf(condition))?.has(item.ref) ?? false);
        return negated(condition.operator) ? !matched : matched;
    };
    return items.filter((item) => groups.some((group) => group.every((condition) => meets(item, condition))));
};

/**
 * The filters with one condition changed, or removed with `undefined`.
 */
export const withCondition = (filters: Filters, index: number, condition: Condition | undefined): Condition[] =>
    condition === undefined
        ? filters.filter((_, position) => position !== index)
        : filters.map((current, position) => (position === index ? condition : current));
