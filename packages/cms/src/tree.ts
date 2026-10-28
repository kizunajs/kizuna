import { readMetaBrand, unwrapOptionalWrappers } from 'kizunajs/generator';
import { dataFields } from './field.js';
import type { Collection } from './definitions.js';
import type { CmsService, Listing } from './cms.js';

/**
 * Each item's parent in a collection with a `tree`, keyed by id, and
 * `undefined` for an item at the top.
 */
export type Parents = ReadonlyMap<string, string | undefined>;

/**
 * What the editing list keeps: the items whose field holds a value, and with
 * `descendants`, those holding an item under it too.
 */
export interface ItemFilter {
    field: string;
    value: string;
    descendants?: boolean;
}

/**
 * Checks a collection's `tree` when the config assembles: it names one of the
 * collection's fields, and that field holds the collection's own id and may
 * be left out, since an item at the top has no parent.
 */
export const assertTree = (definition: Collection): void => {
    const field = definition.tree;
    if (field === undefined) return;
    const owner = `Collection '${definition.name}'`;
    const found = dataFields(definition.fields).find((candidate) => candidate.name === field);
    if (found === undefined) throw new Error(`${owner} has the tree '${field}', which is not one of its fields.`);
    const brand = readMetaBrand(definition.id)!;
    const unwrapped = unwrapOptionalWrappers(found.schema);
    const held = readMetaBrand(found.schema) ?? readMetaBrand(unwrapped.inner);
    if (held !== brand) {
        throw new Error(
            `${owner} has the tree '${field}', so that field holds the id of the item above. Make its schema ${brand}.optional().`
        );
    }
    if (!unwrapped.optional && !unwrapped.nullable) {
        throw new Error(
            `${owner} has the tree '${field}', which is required. Make it ${brand}.optional(), since an item at the top has none.`
        );
    }
};

/**
 * The parent an item's content names, or `undefined` at the top.
 */
export const parentIn = (content: Record<string, unknown> | null | undefined, field: string): string | undefined => {
    const value = content?.[field];
    return typeof value === 'string' && value !== '' ? value : undefined;
};

/**
 * Each item's parent, read from its latest content, the draft or else the
 * published copy, or from the published copy alone.
 */
export const loadParents = async (
    service: CmsService,
    listing: Listing,
    copy: 'latest' | 'published'
): Promise<Map<string, string | undefined>> => {
    const field = listing.definition.tree;
    const parents = new Map<string, string | undefined>();
    if (field === undefined) return parents;
    for (const stored of await service.store.list('item')) {
        if (!stored.key.startsWith(listing.keyPrefix)) continue;
        const id = stored.key.slice(listing.keyPrefix.length);
        const row = service.migrated(service.target(listing.refOf(id)), stored)!;
        parents.set(id, parentIn(copy === 'published' ? row.published : (row.draft ?? row.published), field));
    }
    return parents;
};

/**
 * Whether putting an item under a parent closes a loop: the parent is the
 * item itself, or sits somewhere under it.
 */
export const closesLoop = (parents: Parents, id: string, parent: string | undefined): boolean => {
    const seen = new Set<string>();
    let current = parent;
    while (current !== undefined && !seen.has(current)) {
        if (current === id) return true;
        seen.add(current);
        current = parents.get(current);
    }
    return false;
};

/**
 * The refusal for a parent that closes a loop, or `undefined` when the item
 * may sit there.
 */
export const loopRefusal = (listing: Listing, parents: Parents, id: string, parent: string | undefined): string | undefined => {
    if (!closesLoop(parents, id, parent)) return undefined;
    return parent === id
        ? `Item '${id}' of ${listing.name} cannot sit under itself.`
        : `Item '${id}' of ${listing.name} cannot sit under '${parent}', which sits under it.`;
};

/**
 * Each item with its parent and the labels from the top of the tree down to
 * it, like "Lighting / Workshop". A parent that no longer exists puts the
 * item at the top.
 */
export const placeInTree = <Item extends { id: string; label: string }>(
    items: readonly Item[],
    parents: Parents
): Array<Item & { parent: string | null; treeLabel: string }> => {
    const labels = new Map(items.map((item) => [item.id, item.label]));
    const parentOf = (id: string): string | undefined => {
        const parent = parents.get(id);
        return parent !== undefined && labels.has(parent) ? parent : undefined;
    };
    return items.map((item) => {
        const trail: string[] = [];
        const seen = new Set<string>();
        let current: string | undefined = item.id;
        while (current !== undefined && !seen.has(current)) {
            seen.add(current);
            trail.unshift(labels.get(current)!);
            current = parentOf(current);
        }
        return {
            ...item,
            parent: parentOf(item.id) ?? null,
            treeLabel: trail.join(' / '),
        };
    });
};

/**
 * An item and every item under it, at any depth.
 */
export const descendantsOf = (parents: Parents, id: string): Set<string> => {
    const children = new Map<string, string[]>();
    for (const [child, parent] of parents) {
        if (parent !== undefined) children.set(parent, [...(children.get(parent) ?? []), child]);
    }
    const found = new Set<string>([id]);
    const waiting = [id];
    while (waiting.length > 0) {
        for (const child of children.get(waiting.pop()!) ?? []) {
            if (found.has(child)) continue;
            found.add(child);
            waiting.push(child);
        }
    }
    return found;
};

/**
 * Whether a field's value is one of the values, or a list holding one.
 */
export const holdsAny = (value: unknown, values: ReadonlySet<string>): boolean =>
    Array.isArray(value)
        ? value.some((entry) => typeof entry === 'string' && values.has(entry))
        : typeof value === 'string' && values.has(value);
