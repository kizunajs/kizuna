/**
 * A list as stored, or an empty one when an older version of the content
 * stored something else there. A database seeded before the current shape
 * keeps its old values until an editor saves them again.
 */
export const listOf = <Item>(value: readonly Item[] | undefined): readonly Item[] => (Array.isArray(value) ? value : []);
