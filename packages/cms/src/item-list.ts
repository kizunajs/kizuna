/**
 * How a condition of the editing list compares: the value itself, or with
 * `within` and `outside`, the value and every item under it in its
 * collection's tree.
 */
export type ItemOperator = 'is' | 'isNot' | 'within' | 'outside';

export const ITEM_OPERATORS: readonly ItemOperator[] = ['is', 'isNot', 'within', 'outside'];

/**
 * The statuses a condition on `status` names.
 */
export const ITEM_STATUSES: readonly string[] = ['empty', 'draft', 'changed', 'published'];

/**
 * One condition of the editing list: a field of the collection's `indexes`,
 * or `status`, how it compares, and the value.
 */
export interface ItemCondition {
    field: string;
    operator: ItemOperator;
    value: string;
}

/**
 * What the editing list of a collection is asked for: a search, sets of
 * conditions of which any one set may hold, a sort, one page, and the fields
 * each item carries.
 */
export interface ItemListQuery {
    search?: string;
    groups?: ReadonlyArray<ReadonlyArray<ItemCondition>>;
    orderBy?: string;
    direction?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
    fields?: readonly string[];
    /**
     * The editor's own headers, for a relationship's `options` to name ids.
     */
    headers?: Record<string, string>;
}

/**
 * The entry of `filter` that starts another set of conditions.
 */
export const OR = 'or';

/**
 * The sets of conditions a `filter` list writes, each entry
 * `field:operator:value` or `or`. The value is everything after the second
 * colon, so it may hold colons itself. Answers the entry it cannot read
 * instead.
 */
export const parseFilter = (entries: readonly string[]): { groups: ItemCondition[][] } | { problem: string } => {
    const groups: ItemCondition[][] = [[]];
    for (const entry of entries) {
        if (entry.trim() === OR) {
            groups.push([]);
            continue;
        }
        const first = entry.indexOf(':');
        const second = first === -1 ? -1 : entry.indexOf(':', first + 1);
        if (second === -1) {
            return {
                problem: `The filter '${entry}' is not written field:operator:value, like topic:is:care.`,
            };
        }
        const operator = entry.slice(first + 1, second);
        if (!ITEM_OPERATORS.includes(operator as ItemOperator)) {
            return {
                problem: `The filter '${entry}' compares with '${operator}'. A filter compares with ${ITEM_OPERATORS.join(', ')}.`,
            };
        }
        groups.at(-1)!.push({
            field: entry.slice(0, first),
            operator: operator as ItemOperator,
            value: entry.slice(second + 1),
        });
    }
    return {
        groups: groups.filter((group) => group.length > 0),
    };
};

/**
 * The field names a `fields` list holds, each entry one name or several
 * joined by commas.
 */
export const parseFields = (entries: readonly string[]): string[] => [
    ...new Set(
        entries
            .flatMap((entry) => entry.split(','))
            .map((name) => name.trim())
            .filter((name) => name !== '')
    ),
];
