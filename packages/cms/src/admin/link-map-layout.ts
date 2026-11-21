import type { PageMapNode } from '../page-map.js';
import { CARD_HEIGHT, CARD_WIDTH, mapLayoutOf } from './map-layout.js';
import type { SeoBand } from './seo-screens.js';

/**
 * A card on the link map: a page or item of the CMS, another site's domain,
 * or a link's target that is gone.
 */
export type LinkNode =
    | {
          id: string;
          kind: 'page';
          ref: string;
          /**
           * The site it belongs to, or `null` for the shared content.
           */
          site: string | null;
          title: string;
          path: string | null;
          linksIn: number;
          brokenOut: number;
      }
    | {
          id: string;
          kind: 'external';
          domain: string;
          path?: string;
          favicon?: string;
      }
    | {
          id: string;
          kind: 'broken';
          title: string;
          reason: 'trash' | 'missing';
      };

export interface LinkEdge {
    from: string;
    to: string;
    broken: boolean;
    external: boolean;
    anchor?: string;
}

/**
 * What `editing_link_map` answers.
 */
export interface LinkMapAnswer {
    nodes: LinkNode[];
    edges: LinkEdge[];
}

/**
 * Which column a card sits in: other sites linking in, the site's own pages,
 * the shared content, or the links out.
 */
export type LinkColumn = 'in' | 'site' | 'shared' | 'out';

/**
 * A card's node, or a part of a path no page sits at, which holds the pages
 * under it.
 */
export type LinkCardNode =
    | LinkNode
    | {
          id: string;
          kind: 'segment';
          title: string;
      };

export interface LinkCard {
    id: string;
    node: LinkCardNode;
    column: LinkColumn;
    x: number;
    y: number;
    /**
     * The grey line under the title: a path, the words a link reads, or why
     * a target is gone.
     */
    detail: string;
}

export interface LinkHead {
    id: string;
    column: LinkColumn;
    x: number;
    y: number;
}

export interface LinkLine {
    id: string;
    from: string;
    to: string;
    sourceHandle: 'left' | 'right';
    targetHandle: 'left' | 'right';
    broken: boolean;
    external: boolean;
    anchor?: string;
}

export interface LinkMapLayout {
    heads: LinkHead[];
    cards: LinkCard[];
    lines: LinkLine[];
    /**
     * Where the site's own column starts, so its head is as wide.
     */
    siteWidth: number;
}

const ROW = CARD_HEIGHT + 12;
const GAP = 110;
/**
 * The room a column's head takes above its first card.
 */
const HEAD = 56;
/**
 * Room right of the site's column for the curves between its own pages.
 */
const LOOP_ROOM = 60;
/**
 * The node the site's pages share in the sitemap layout.
 */
const TREE = 'tree';

const reasonOf = (reason: 'trash' | 'missing'): string => (reason === 'trash' ? 'In the trash' : 'No page here');

const quoted = (text: string): string => `“${text}”`;

/**
 * Stacks cards in one column, each as close to the height of what it links
 * with as the cards above it allow.
 */
const stack = (wanted: ReadonlyArray<{ id: string; y: number; order: string }>): Map<string, number> => {
    const placed = new Map<string, number>();
    let next = Number.NEGATIVE_INFINITY;
    for (const entry of [...wanted].sort((left, right) => left.y - right.y || left.order.localeCompare(right.order))) {
        const y = Math.max(entry.y, next);
        placed.set(entry.id, y);
        next = y + ROW;
    }
    return placed;
};

/**
 * Lays the link map out in columns: the other sites that link in, the
 * site's pages as a sitemap with the shared content under it, and the links
 * out, other sites and broken targets alike. A site of `undefined` is a CMS
 * of one site, whose pages are all its own.
 */
export const linkMapLayoutOf = (answer: LinkMapAnswer, site: string | undefined): LinkMapLayout => {
    const nodes = new Map(answer.nodes.map((node) => [node.id, node]));
    const pages = answer.nodes.filter((node) => node.kind === 'page');
    const own = pages.filter((page) => site === undefined || page.site === site);
    const shared = pages.filter((page) => site !== undefined && page.site !== site);
    const inbound = new Set(answer.edges.filter((edge) => nodes.get(edge.from)?.kind === 'external').map((edge) => edge.from));
    const outbound = answer.nodes.filter((node) => node.kind !== 'page' && !inbound.has(node.id));

    const inX = 0;
    const siteX = inbound.size === 0 ? 0 : CARD_WIDTH + GAP;
    const tree = mapLayoutOf(
        {
            nodes: own.map((page): PageMapNode => ({
                id: page.id,
                ref: page.ref,
                kind: page.path === null ? 'document' : 'page',
                site: TREE,
                title: page.title,
                path: page.path,
                status: 'published',
            })),
            links: [],
        },
        {
            columns: [TREE],
        }
    );
    const siteWidth = tree.columns[0]?.width ?? CARD_WIDTH;
    const outX = siteX + siteWidth + LOOP_ROOM + GAP;

    const cards: LinkCard[] = [];
    const heads: LinkHead[] = [
        {
            id: 'head:site',
            column: 'site',
            x: siteX,
            y: 0,
        },
    ];
    for (const card of tree.cards) {
        const node = nodes.get(card.id);
        cards.push({
            id: card.id,
            node:
                node ??
                ({
                    id: card.id,
                    kind: 'segment',
                    title: card.node.title,
                } satisfies LinkCardNode),
            column: 'site',
            x: siteX + card.x,
            y: card.y - 16,
            detail: node?.kind === 'page' ? (node.path ?? '') : '',
        });
    }
    if (shared.length > 0) {
        const sharedY = Math.max(HEAD - 16, ...cards.map((card) => card.y + ROW)) + 24;
        heads.push({
            id: 'head:shared',
            column: 'shared',
            x: siteX,
            y: sharedY,
        });
        const sorted = [...shared].sort((left, right) => (left.path ?? left.title).localeCompare(right.path ?? right.title));
        for (const [index, page] of sorted.entries()) {
            cards.push({
                id: page.id,
                node: page,
                column: 'shared',
                x: siteX,
                y: sharedY + HEAD + index * ROW,
                detail: page.path ?? '',
            });
        }
    }

    const pageY = new Map(cards.map((card) => [card.id, card.y]));
    const nearest = (id: string, ends: readonly string[]): number =>
        Math.min(...ends.map((end) => pageY.get(end)).filter((y): y is number => y !== undefined), Number.POSITIVE_INFINITY);
    const fallback = Math.max(HEAD, ...cards.map((card) => card.y + ROW));
    const placeColumn = (column: 'in' | 'out', placed: readonly LinkNode[], x: number): void => {
        if (placed.length === 0) return;
        const wanted = placed.map((node) => {
            const ends = answer.edges
                .filter((edge) => (column === 'in' ? edge.from === node.id : edge.to === node.id))
                .map((edge) => (column === 'in' ? edge.to : edge.from));
            const y = nearest(node.id, ends);
            return {
                id: node.id,
                y: Number.isFinite(y) ? y : fallback,
                order: node.kind === 'external' ? node.domain : node.kind === 'broken' ? node.title : node.id,
            };
        });
        const ys = stack(wanted);
        const top = Math.min(...ys.values());
        heads.push({
            id: `head:${column}`,
            column,
            x,
            y: Math.max(0, top - HEAD),
        });
        for (const node of placed) {
            const links = answer.edges.filter((edge) => (column === 'in' ? edge.from : edge.to) === node.id);
            cards.push({
                id: node.id,
                node,
                column,
                x,
                y: ys.get(node.id)!,
                detail: detailOf(node, column, links),
            });
        }
    };
    placeColumn(
        'in',
        answer.nodes.filter((node) => inbound.has(node.id)),
        inX
    );
    placeColumn('out', outbound, outX);

    const columnOf = new Map(cards.map((card) => [card.id, card.column]));
    const lines = new Map<string, LinkLine>();
    for (const edge of answer.edges) {
        const fromColumn = columnOf.get(edge.from);
        const toColumn = columnOf.get(edge.to);
        if (fromColumn === undefined || toColumn === undefined || edge.from === edge.to) continue;
        const id = `link:${edge.from}>${edge.to}`;
        if (lines.has(id)) continue;
        // Links between the site's own pages curve out to the right, the way the sitemap reads.
        const between = fromColumn !== 'in' && toColumn !== 'out';
        lines.set(id, {
            id,
            from: edge.from,
            to: edge.to,
            sourceHandle: 'right',
            targetHandle: between ? 'right' : 'left',
            broken: edge.broken,
            external: edge.external,
            ...(edge.anchor === undefined
                ? {}
                : {
                      anchor: edge.anchor,
                  }),
        });
    }
    return {
        heads,
        cards,
        lines: [...lines.values()],
        siteWidth,
    };
};

const detailOf = (node: LinkNode, column: 'in' | 'out', links: readonly LinkEdge[]): string => {
    if (node.kind === 'broken') return reasonOf(node.reason);
    if (node.kind === 'page') return node.path ?? '';
    if (column === 'out') return node.path ?? '';
    const [only] = links;
    if (links.length === 1 && only?.anchor !== undefined) return quoted(only.anchor);
    return links.length === 1 ? '1 link' : `${links.length} links`;
};

/**
 * The pill on a page's card: its broken links first, else how many links
 * reach it, red at none and yellow at one.
 */
export const linksPillOf = (node: { linksIn: number; brokenOut: number }): { text: string; band: SeoBand | 'none' } => {
    if (node.brokenOut > 0) {
        return {
            text: `${node.brokenOut} broken`,
            band: 'poor',
        };
    }
    return {
        text: `${node.linksIn} in`,
        band: node.linksIn === 0 ? 'poor' : node.linksIn === 1 ? 'fair' : 'none',
    };
};

/**
 * The filters above the map, by what each picks out.
 */
export type LinkFilter = 'orphans' | 'broken' | 'one-in';

/**
 * Each filter's count and the cards it picks out: the pages nothing links
 * to, the broken links with the pages holding them and their targets, and
 * the pages one link reaches.
 */
export const linkFiltersOf = (answer: LinkMapAnswer): Record<LinkFilter, { count: number; cards: Set<string> }> => {
    const pages = answer.nodes.filter((node) => node.kind === 'page');
    const broken = answer.edges.filter((edge) => edge.broken);
    return {
        orphans: {
            count: pages.filter((page) => page.linksIn === 0).length,
            cards: new Set(pages.filter((page) => page.linksIn === 0).map((page) => page.id)),
        },
        broken: {
            count: broken.length,
            cards: new Set(broken.flatMap((edge) => [edge.from, edge.to])),
        },
        'one-in': {
            count: pages.filter((page) => page.linksIn === 1).length,
            cards: new Set(pages.filter((page) => page.linksIn === 1).map((page) => page.id)),
        },
    };
};

/**
 * The lines drawn: every broken link, and the links of the page chosen.
 */
export const shownLinesOf = (layout: LinkMapLayout, selected: string | undefined): LinkLine[] =>
    layout.lines.filter((line) => line.broken || (selected !== undefined && (line.from === selected || line.to === selected)));

/**
 * The page cards whose title or path holds the search, top to bottom.
 */
export const linkCardsMatching = (layout: LinkMapLayout, search: string): LinkCard[] => {
    const term = search.trim().toLowerCase();
    if (term === '') return [];
    return layout.cards.filter(
        (card) =>
            card.node.kind === 'page' &&
            (card.node.title.toLowerCase().includes(term) || (card.node.path ?? '').toLowerCase().includes(term))
    );
};

/**
 * The letter a domain's tile shows when it has no icon.
 */
export const domainLetterOf = (domain: string): string => (domain.replace(/^www\./, '')[0] ?? '?').toUpperCase();
