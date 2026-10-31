import type { TreeRow } from './list-rows.js';

/**
 * A route that shows a collection, one item per address, as the pages list
 * names it.
 */
export interface CollectionRoute {
    name: string;
    title: string;
    path: string;
    href: string;
    /**
     * How many items it shows, in words, like "3 offices".
     */
    count: string;
}

/**
 * The path a page sits under, `null` at the top, where the front page sits
 * too.
 */
export const parentPathOf = (path: string): string | null => {
    const cut = path.replace(/\/+$/, '').lastIndexOf('/');
    return cut <= 0 ? null : path.slice(0, cut);
};

/**
 * Sorts paths with the front page first, then by path.
 */
const byPath = (left: string, right: string): number => {
    if (left === right) return 0;
    if (left === '/') return -1;
    if (right === '/') return 1;
    return left < right ? -1 : 1;
};

/**
 * A site's pages as a tree by their paths: each page under the path above
 * it, a route that shows a collection as a row with its count, and a part of
 * a path with no page of its own as a row in grey.
 */
export const pageTreeOf = (pages: readonly TreeRow[], routes: readonly CollectionRoute[], site = ''): TreeRow[] => {
    const rows = new Map<string, TreeRow>();
    for (const page of pages) {
        if (page.detail !== undefined && !rows.has(page.detail)) rows.set(page.detail, page);
    }
    for (const route of routes) {
        if (rows.has(route.path)) continue;
        rows.set(route.path, {
            ref: `route:${site}:${route.name}`,
            href: route.href,
            title: route.title,
            detail: route.path,
            count: route.count,
            selectable: false,
        });
    }
    for (const path of [...rows.keys()]) {
        for (let above = parentPathOf(path); above !== null && !rows.has(above); above = parentPathOf(above)) {
            rows.set(above, {
                ref: `segment:${site}:${above}`,
                href: '',
                title: above,
                segment: true,
                selectable: false,
            });
        }
    }
    return [...rows.entries()]
        .sort(([left], [right]) => byPath(left, right))
        .map(([path, row]) => ({
            ...row,
            tree: {
                id: path,
                parent: parentPathOf(path),
                label: row.title,
            },
        }));
};

/**
 * The refs of the rows under any of the given ones, at any depth.
 */
export const descendantsIn = (rows: readonly TreeRow[], refs: readonly string[]): Set<string> => {
    const children = new Map<string, TreeRow[]>();
    for (const row of rows) {
        const parent = row.tree?.parent;
        if (parent !== null && parent !== undefined) children.set(parent, [...(children.get(parent) ?? []), row]);
    }
    const found = new Set<string>();
    const waiting = rows.filter((row) => refs.includes(row.ref)).map((row) => row.tree?.id);
    while (waiting.length > 0) {
        const id = waiting.pop();
        if (id === undefined) continue;
        for (const child of children.get(id) ?? []) {
            if (found.has(child.ref)) continue;
            found.add(child.ref);
            waiting.push(child.tree?.id);
        }
    }
    return found;
};
