import type { PageStatus } from './cms.js';
import { DEFAULT_SITE } from './options.js';
import { parseRef } from './refs.js';

/**
 * Where a card on the map stands: a page's status, or `missing` for a link's
 * target that is in the trash or gone.
 */
export type PageMapStatus = PageStatus | 'missing';

/**
 * One card on the map: a page, an item a page shows at its address, the
 * route that shows those items, or another document that holds or receives
 * a link, like the footer.
 */
export interface PageMapNode {
    /**
     * Unique on the map. A page's or document's ref, `route:<site>:<name>`
     * for a route that shows a collection, and `<site>|<ref>` for an item,
     * since a shared collection's item can show on several sites.
     */
    id: string;
    /**
     * The document, or `null` for a route that shows a collection.
     */
    ref: string | null;
    kind: 'page' | 'item' | 'collection' | 'document';
    /**
     * The site it belongs to, or `null` for the shared content.
     */
    site: string | null;
    title: string;
    path: string | null;
    status: PageMapStatus;
    /**
     * For an item, the id of the route that shows it.
     */
    collection?: string;
    /**
     * For a route that shows a collection, how many items it shows.
     */
    count?: number;
}

/**
 * A content link from one document to another, by their refs.
 */
export interface PageMapLink {
    from: string;
    to: string;
    /**
     * Where in the holder the link sits, like `body.2.markDefs.0`.
     */
    fieldPaths: string[];
    /**
     * Whether the holder's published content holds the link, not only its
     * draft.
     */
    published: boolean;
    /**
     * Whether the target is not live: never published, in the trash, or
     * gone.
     */
    broken: boolean;
}

export interface PageMap {
    nodes: PageMapNode[];
    links: PageMapLink[];
}

/**
 * What the map is built from: every page and item as editors list them, the
 * routes that show collections, every content link, and what each linked
 * document is called and where it stands.
 */
export interface PageMapInput {
    pages: ReadonlyArray<{ name: string; site: string; ref: string; label: string | null; path: string; status: PageStatus }>;
    collectionPages: ReadonlyArray<{ site: string; name: string; label: string | null; path: string }>;
    links: ReadonlyArray<{ from: string; to: string; fieldPaths: readonly string[]; published: boolean }>;
    /**
     * What a document is called, where it is and whether it is live, by its
     * ref, for the items and for documents that are not pages.
     */
    targets: ReadonlyMap<string, { label: string; path: string | null; status: 'published' | 'unpublished' | 'missing' }>;
    /**
     * Whether the caller may open a site, `undefined` for the shared content.
     */
    sees: (site: string | undefined) => boolean;
}

const titleOfPage = (name: string, label: string | null): string =>
    label ??
    name
        .replace(/Page$/, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .replace(/^./, (first) => first.toUpperCase());

const siteOfRef = (ref: string): string | null => {
    const site = parseRef(ref)?.site;
    return site === undefined || site === DEFAULT_SITE ? null : site;
};

const statusOfTarget = (status: 'published' | 'unpublished' | 'missing' | undefined): PageMapStatus =>
    status === 'published' ? 'published' : status === 'unpublished' ? 'draft' : 'missing';

const LIVE: ReadonlySet<PageMapStatus> = new Set(['published', 'changed']);

/**
 * The group's pages and the links between them, as the caller may see them:
 * the pages of the sites they open and the shared content, and a link only
 * when both of its ends are among those.
 */
export const pageMapOf = (input: PageMapInput): PageMap => {
    const nodes: PageMapNode[] = [];
    const byRef = new Map<string, PageMapNode>();
    const add = (node: PageMapNode): void => {
        nodes.push(node);
        if (node.ref !== null && !byRef.has(node.ref)) byRef.set(node.ref, node);
    };
    const routes = input.collectionPages.filter((route) => input.sees(route.site));
    const counts = new Map<string, number>();
    for (const page of input.pages) {
        if (!input.sees(page.site)) continue;
        if (parseRef(page.ref)?.type !== 'item') {
            add({
                id: page.ref,
                ref: page.ref,
                kind: 'page',
                site: page.site,
                title: titleOfPage(page.name, page.label),
                path: page.path,
                status: page.status,
            });
            continue;
        }
        const collection = `route:${page.site}:${page.name}`;
        counts.set(collection, (counts.get(collection) ?? 0) + 1);
        add({
            id: `${page.site}|${page.ref}`,
            ref: page.ref,
            kind: 'item',
            site: page.site,
            title: input.targets.get(page.ref)?.label ?? page.path,
            path: page.path,
            status: page.status,
            collection,
        });
    }
    for (const route of routes) {
        const id = `route:${route.site}:${route.name}`;
        add({
            id,
            ref: null,
            kind: 'collection',
            site: route.site,
            title: titleOfPage(route.name, route.label),
            path: route.path,
            status: 'published',
            count: counts.get(id) ?? 0,
        });
    }
    const visible = (ref: string): boolean => {
        const parsed = parseRef(ref);
        return parsed !== undefined && input.sees(parsed.site);
    };
    const links = input.links.filter((link) => visible(link.from) && visible(link.to));
    for (const ref of links.flatMap((link) => [link.from, link.to])) {
        if (byRef.has(ref)) continue;
        const target = input.targets.get(ref);
        add({
            id: ref,
            ref,
            kind: 'document',
            site: siteOfRef(ref),
            title: target?.label ?? ref,
            path: target?.path ?? null,
            status: statusOfTarget(target?.status),
        });
    }
    return {
        nodes,
        links: links.map((link) => ({
            from: link.from,
            to: link.to,
            fieldPaths: [...link.fieldPaths],
            published: link.published,
            broken: !LIVE.has(byRef.get(link.to)?.status ?? 'missing'),
        })),
    };
};
