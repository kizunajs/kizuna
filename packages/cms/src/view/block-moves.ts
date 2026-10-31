import { rowLabelsOf } from './array-rows.js';
import { blockOptionsOf, humanize, itemBlockName, resolveRef, typeOf, type JsonSchema } from './schema.js';

/**
 * Where a list of blocks sits inside the outermost one: item indexes and
 * field names, `[]` for the outermost list itself.
 */
export type BlockPath = ReadonlyArray<string | number>;

/**
 * A list of blocks a block may move into: where it sits, what an editor
 * reads it as, and the blocks it takes.
 */
export interface BlockList {
    path: BlockPath;
    title: string;
    /**
     * The field's label inside the block that holds the list, like Left.
     */
    detail?: string;
    accepts: readonly string[];
}

/**
 * Every list of blocks in a field's value, the field's own first, then the
 * lists inside each block, at any depth.
 */
export const blockListsIn = (value: unknown, schema: JsonSchema, root: JsonSchema, title: string, path: BlockPath = []): BlockList[] => {
    const options = blockOptionsOf(resolveRef(schema, root).items ?? {}, root);
    if (options === undefined) return [];
    const lists: BlockList[] = [
        {
            path,
            title,
            accepts: options.map((option) => option.name),
        },
    ];
    (Array.isArray(value) ? value : []).forEach((item, index) => {
        const option = options.find((candidate) => candidate.name === itemBlockName(item));
        if (option === undefined) return;
        const block = resolveRef(option.schema, root);
        const blockTitle = rowLabelsOf(block, root, item).title ?? humanize(option.name);
        for (const [name, property] of Object.entries(block.properties ?? {})) {
            const resolved = resolveRef(property, root);
            if (typeOf(resolved) !== 'array' || blockOptionsOf(resolved.items ?? {}, root) === undefined) continue;
            const inner = blockListsIn((item as Record<string, unknown>)[name], resolved, root, blockTitle, [...path, index, name]);
            lists.push(
                ...inner.map((list, at) =>
                    at === 0
                        ? {
                              ...list,
                              detail: humanize(name),
                          }
                        : list
                )
            );
        }
    });
    return lists;
};

/**
 * The value at a path inside a field's value.
 */
export const valueAtPath = (value: unknown, path: BlockPath): unknown =>
    path.reduce<unknown>(
        (current, key) => (typeof current === 'object' && current !== null ? (current as Record<string, unknown>)[key] : undefined),
        value
    );

/**
 * The lists a block at `index` of the list at `from` may move into: every
 * other list that takes its kind, outside the block itself.
 */
export const moveTargetsOf = (lists: readonly BlockList[], from: BlockPath, index: number, block: string): BlockList[] => {
    const own = [...from, index];
    const same = (left: BlockPath, right: BlockPath): boolean => left.length === right.length && left.every((key, at) => key === right[at]);
    return lists.filter(
        (list) =>
            list.accepts.includes(block) &&
            !same(list.path, from) &&
            !(list.path.length >= own.length && same(list.path.slice(0, own.length), own))
    );
};

/**
 * The field's value once the block at `index` of the list at `from` moves to
 * the end of the list at `to`.
 */
export const movedBlock = (value: readonly unknown[], from: BlockPath, index: number, to: BlockPath): unknown[] => {
    const next = structuredClone([...value]) as unknown[];
    const listAt = (path: BlockPath): unknown[] => {
        if (path.length === 0) return next;
        const holder = valueAtPath(next, path.slice(0, -1)) as Record<string, unknown>;
        const key = path[path.length - 1]!;
        if (!Array.isArray(holder[key])) holder[key] = [];
        return holder[key] as unknown[];
    };
    // Both lists are found before either changes, so taking the block out never shifts the way to the other.
    const target = listAt(to);
    const source = listAt(from);
    const [block] = source.splice(index, 1);
    target.push(block);
    return next;
};
