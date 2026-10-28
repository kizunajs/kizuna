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
 * What one item of a list is called, in lower case: the name its schema
 * gives, "image" for `CMS.Image`, or else the singular of a plural label,
 * "link" for "Links", or an item of a singular one, "menu item" for "Menu",
 * or else "item".
 */
export const itemNounOf = (itemSchema: JsonSchema, root: JsonSchema, label: string | undefined): string => {
    const resolved = resolveRef(itemSchema, root);
    const named = typeof resolved.title === 'string' ? resolved.title : itemSchema.$ref?.split('/').at(-1);
    if (named !== undefined && named !== '') return humanize(named.split('.').at(-1)!).toLowerCase();
    if (label === undefined || label === '') return 'item';
    return singularOf(label) === label ? `${label.toLowerCase()} item` : singularOf(label).toLowerCase();
};

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
