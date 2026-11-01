import type { PageMap, PageMapNode } from '../page-map.js';
import { parentPathOf } from './page-tree.js';

/**
 * A card's size and the room around it, in the map's own units.
 */
export const CARD_WIDTH = 216;
export const CARD_HEIGHT = 46;
const ROW = CARD_HEIGHT + 12;
const INDENT = 28;
const COLUMN_GAP = 140;
/**
 * The room a column's head takes above its first card.
 */
const HEAD = 72;

/**
 * A card's document, or a part of a path no page sits at, which holds the
 * pages under it.
 */
export type MapCardNode =
    | PageMapNode
    | {
          id: string;
          ref: null;
          kind: 'segment';
          site: string | null;
          title: string;
          path: string;
          status: 'empty';
      };

/**
 * One site's column, or the shared content's when `site` is `null`.
 */
export interface MapColumn {
    site: string | null;
    x: number;
    y: number;
    width: number;
}

export interface MapCard {
    id: string;
    node: MapCardNode;
    x: number;
    y: number;
    depth: number;
    parent: string | null;
    /**
     * For a route that shows a collection, whether its items show under it.
     */
    expanded?: boolean;
}

/**
 * The line from a card to one under it in the tree.
 */
export interface MapTreeLine {
    id: string;
    from: string;
    to: string;
}

/**
 * Which side of a card a line leaves or meets.
 */
export type MapHandle = 'left' | 'right';

/**
 * A content link between two cards. A link into an item of a folded
 * collection meets the collection's card.
 */
export interface MapLinkLine {
    id: string;
    from: string;
    to: string;
    sourceHandle: MapHandle;
    targetHandle: MapHandle;
    broken: boolean;
    published: boolean;
    /**
     * Whether it runs from one column to another.
     */
    crossSite: boolean;
}

export interface MapLayout {
    columns: MapColumn[];
    cards: MapCard[];
    treeLines: MapTreeLine[];
    links: MapLinkLine[];
}

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
 * The cards of one column in the order the tree reads, top to bottom, each
 * with its depth and the card above it in the tree.
 */
const columnTreeOf = (
    nodes: readonly PageMapNode[],
    site: string | null,
    expanded: ReadonlySet<string>
): Array<{ node: MapCardNode; depth: number; parent: string | null }> => {
    const atPath = new Map<string, MapCardNode>();
    const items = new Map<string, PageMapNode[]>();
    const loose: PageMapNode[] = [];
    for (const node of nodes) {
        if (node.kind === 'item') {
            if (node.collection !== undefined) items.set(node.collection, [...(items.get(node.collection) ?? []), node]);
            continue;
        }
        if (node.kind === 'document' || node.path === null || atPath.has(node.path)) {
            loose.push(node);
            continue;
        }
        atPath.set(node.path, node);
    }
    for (const path of [...atPath.keys()]) {
        for (let above = parentPathOf(path); above !== null && !atPath.has(above); above = parentPathOf(above)) {
            atPath.set(above, {
                id: `segment:${site ?? ''}:${above}`,
                ref: null,
                kind: 'segment',
                site,
                title: above,
                path: above,
                status: 'empty',
            });
        }
    }
    // Every page sits under the front page, so a site reads as one tree.
    const front = atPath.get('/');
    const parentOf = (path: string): string | null => {
        if (path === '/') return null;
        return parentPathOf(path) ?? (front === undefined ? null : '/');
    };
    const children = new Map<string | null, string[]>();
    for (const path of atPath.keys()) {
        const parent = parentOf(path);
        children.set(parent, [...(children.get(parent) ?? []), path]);
    }
    const ordered: Array<{ node: MapCardNode; depth: number; parent: string | null }> = [];
    const visit = (path: string, depth: number, parent: string | null): void => {
        const node = atPath.get(path)!;
        ordered.push({
            node,
            depth,
            parent,
        });
        if (node.kind === 'collection' && expanded.has(node.id)) {
            const shown = [...(items.get(node.id) ?? [])].sort((left, right) => byPath(left.path ?? '', right.path ?? ''));
            for (const item of shown) {
                ordered.push({
                    node: item,
                    depth: depth + 1,
                    parent: node.id,
                });
            }
        }
        for (const child of [...(children.get(path) ?? [])].sort(byPath)) visit(child, depth + 1, node.id);
    };
    for (const root of [...(children.get(null) ?? [])].sort(byPath)) visit(root, 0, null);
    for (const node of [...loose].sort((left, right) => left.title.localeCompare(right.title))) {
        ordered.push({
            node,
            depth: 0,
            parent: null,
        });
    }
    return ordered;
};

/**
 * Lays the map out as a sitemap: one column per site in the order given,
 * `null` for the shared content, each page under the page whose path its own
 * extends, and each content link between the cards it joins. A route that
 * shows a collection is one card, with its items under it when its id is in
 * `expanded`.
 */
export const mapLayoutOf = (
    map: PageMap,
    options: {
        columns: ReadonlyArray<string | null>;
        expanded?: ReadonlySet<string>;
    }
): MapLayout => {
    const expanded = options.expanded ?? new Set<string>();
    const columns: MapColumn[] = [];
    const cards: MapCard[] = [];
    const treeLines: MapTreeLine[] = [];
    const columnOf = new Map<string, number>();
    let x = 0;
    for (const [index, site] of options.columns.entries()) {
        const tree = columnTreeOf(
            map.nodes.filter((node) => node.site === site),
            site,
            expanded
        );
        const depth = Math.max(0, ...tree.map((entry) => entry.depth));
        const width = CARD_WIDTH + depth * INDENT;
        columns.push({
            site,
            x,
            y: 0,
            width,
        });
        for (const [row, entry] of tree.entries()) {
            cards.push({
                id: entry.node.id,
                node: entry.node,
                x: x + entry.depth * INDENT,
                y: HEAD + row * ROW,
                depth: entry.depth,
                parent: entry.parent,
                ...(entry.node.kind === 'collection'
                    ? {
                          expanded: expanded.has(entry.node.id),
                      }
                    : {}),
            });
            columnOf.set(entry.node.id, index);
            if (entry.parent !== null) {
                treeLines.push({
                    id: `tree:${entry.parent}>${entry.node.id}`,
                    from: entry.parent,
                    to: entry.node.id,
                });
            }
        }
        x += width + COLUMN_GAP;
    }
    // A ref can sit on several cards, like a shared item on each site that shows it, and an item of a folded collection sits on the collection's.
    const cardsOf = new Map<string, string[]>();
    for (const node of map.nodes) {
        if (node.ref === null) continue;
        const card = columnOf.has(node.id)
            ? node.id
            : node.collection !== undefined && columnOf.has(node.collection)
              ? node.collection
              : undefined;
        if (card === undefined) continue;
        const known = cardsOf.get(node.ref) ?? [];
        if (!known.includes(card)) cardsOf.set(node.ref, [...known, card]);
    }
    const lines = new Map<string, MapLinkLine>();
    for (const link of map.links) {
        for (const from of cardsOf.get(link.from) ?? []) {
            for (const to of cardsOf.get(link.to) ?? []) {
                if (from === to) continue;
                const id = `link:${from}>${to}`;
                const known = lines.get(id);
                if (known !== undefined) {
                    known.broken = known.broken && link.broken;
                    known.published = known.published || link.published;
                    continue;
                }
                const fromColumn = columnOf.get(from)!;
                const toColumn = columnOf.get(to)!;
                lines.set(id, {
                    id,
                    from,
                    to,
                    sourceHandle: toColumn < fromColumn ? 'left' : 'right',
                    targetHandle: toColumn > fromColumn ? 'left' : 'right',
                    broken: link.broken,
                    published: link.published,
                    crossSite: fromColumn !== toColumn,
                });
            }
        }
    }
    return {
        columns,
        cards,
        treeLines,
        links: [...lines.values()],
    };
};

/**
 * The cards a card links to and those linking to it, with itself, and the
 * links between them, which hovering a card keeps in view.
 */
export const connectedTo = (layout: MapLayout, card: string): { cards: Set<string>; links: Set<string> } => {
    const cards = new Set([card]);
    const links = new Set<string>();
    for (const link of layout.links) {
        if (link.from !== card && link.to !== card) continue;
        links.add(link.id);
        cards.add(link.from);
        cards.add(link.to);
    }
    return {
        cards,
        links,
    };
};

/**
 * The cards whose title or path holds the search, in the order the map
 * reads, column by column.
 */
export const cardsMatching = (layout: MapLayout, search: string): MapCard[] => {
    const term = search.trim().toLowerCase();
    if (term === '') return [];
    return layout.cards.filter(
        (card) =>
            card.node.kind !== 'segment' &&
            (card.node.title.toLowerCase().includes(term) || (card.node.path ?? '').toLowerCase().includes(term))
    );
};
