import { humanize, resolveRef, typeOf, type JsonSchema } from './schema.js';

/**
 * What one item of a list is called, from the list's label: "Links" adds a
 * "Link", "Categories" a "Category" and "Addresses" an "Address".
 */
export const singularOf = (label: string): string => {
    if (/[^aeiou]ies$/i.test(label)) return `${label.slice(0, -3)}y`;
    if (/(ss|sh|ch|x|z)es$/i.test(label)) return label.slice(0, -2);
    if (/[^s]s$/i.test(label)) return label.slice(0, -1);
    return label;
};

/**
 * An item's place in its list as its row shows it: "01", "02", and on past
 * a hundred.
 */
export const indexLabelOf = (index: number): string => String(index + 1).padStart(2, '0');

/**
 * The property that names an item in its row: the first one holding text.
 */
export const titlePropertyOf = (item: JsonSchema, root: JsonSchema): string | undefined =>
    Object.entries(item.properties ?? {}).find(([, property]) => {
        const resolved = resolveRef(property, root);
        return (
            typeOf(resolved) === 'string' && resolved.enum === undefined && resolved.brand === undefined && resolved.format === undefined
        );
    })?.[0];

/**
 * The property whose value tags an item's row: the first one with a fixed
 * set of values.
 */
export const tagPropertyOf = (item: JsonSchema, root: JsonSchema): string | undefined =>
    Object.entries(item.properties ?? {}).find(([, property]) => resolveRef(property, root).enum !== undefined)?.[0];

/**
 * An item's title and tag as its folded row shows them.
 */
export const rowLabelsOf = (item: JsonSchema, root: JsonSchema, value: unknown): { title: string | undefined; tag: string | undefined } => {
    const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
    const titleProperty = titlePropertyOf(item, root);
    const tagProperty = tagPropertyOf(item, root);
    const title = titleProperty === undefined ? undefined : record[titleProperty];
    const tag = tagProperty === undefined ? undefined : record[tagProperty];
    return {
        title: typeof title === 'string' && title.trim() !== '' ? title : undefined,
        tag: typeof tag === 'string' && tag !== '' ? humanize(tag) : undefined,
    };
};

/**
 * Where an item at `index` lands when the one at `from` moves to `to`.
 */
export const movedIndex = (index: number, from: number, to: number): number => {
    if (index === from) return to;
    if (from < to && index > from && index <= to) return index - 1;
    if (to < from && index >= to && index < from) return index + 1;
    return index;
};

/**
 * The open items after the list changes, each index mapped to where its item
 * went, and dropped when the item is gone.
 */
export const remapOpen = (open: ReadonlySet<number>, map: (index: number) => number | undefined): Set<number> =>
    new Set(
        [...open].flatMap((index) => {
            const next = map(index);
            return next === undefined ? [] : [next];
        })
    );
