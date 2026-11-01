import { collectionPreviewPath, showsOnOf, type CmsService } from './cms.js';
import { fillPath } from './dynamic.js';
import { DEFAULT_SITE } from './options.js';
import { servesCollection } from './page.js';
import { formatRef, parseRef, type DocumentRef } from './refs.js';
import { contentLinksOf, LINK_BRAND, LINK_REF, withResolvedLinks } from './links.js';
import { documentLabel } from './reviews.js';
import type { ContentDefinition } from './definitions.js';

/**
 * Which copy a link is read from: the published one, or in draft mode the
 * draft, falling back to the published one.
 */
export type LinkCopy = 'published' | 'draft';

/**
 * A content link whose page or item a reader cannot show: deleted or never
 * written, unpublished, or in the trash.
 */
export interface BrokenLink {
    /**
     * Where the link sits, like `body.2.markDefs.0` or `cta`.
     */
    path: string;
    /**
     * The ref it points at, like `page:uk:plantCarePage`.
     */
    target: string;
    reason: 'missing' | 'unpublished' | 'trashed';
}

/**
 * Where a link's page or item stands: live, saved but not published, in the
 * trash, or gone.
 */
export type LinkTargetStatus = 'published' | 'unpublished' | 'trashed' | 'missing';

/**
 * A page or an item a content link may point at, as the link control shows
 * it.
 */
export interface LinkTarget {
    ref: string;
    label: string;
    /**
     * The site it belongs to, or `default` for shared content.
     */
    site: string;
    /**
     * What editors call its site, Shared for shared content, or `null`
     * without sites.
     */
    siteLabel: string | null;
    /**
     * Its site's icon as a full URL, or `null` for shared content.
     */
    siteIcon: string | null;
    /**
     * Its address on its site, in the site's first language.
     */
    path: string | null;
    status: LinkTargetStatus;
    image?: string;
}

/**
 * One document holding content links to another, read from the refs index.
 */
export interface ContentLinkEdge {
    /**
     * The document holding the link, by ref.
     */
    from: string;
    /**
     * The site the holder belongs to, or `default` for shared content.
     */
    fromSite: string;
    /**
     * The page or item linked to, by ref.
     */
    to: string;
    fieldPaths: string[];
    /**
     * Whether the published copy holds the link, besides the draft.
     */
    published: boolean;
}

/**
 * The page or item a content link names, while the config still declares
 * it. A page that shows a collection is addressed through its items.
 */
export const linkedRef = (cms: CmsService, value: string): DocumentRef | undefined => {
    if (!LINK_REF.test(value)) return undefined;
    const ref = parseRef(value);
    if (ref === undefined || ref.locale !== undefined) return undefined;
    if (ref.type === 'page') {
        const entry = cms.sites[ref.site ?? DEFAULT_SITE]?.[ref.name];
        return entry === undefined || servesCollection(entry.page) ? undefined : ref;
    }
    if (ref.type !== 'item') return undefined;
    try {
        return cms.listingOf(ref) === undefined ? undefined : ref;
    } catch {
        return undefined;
    }
};

/**
 * A path on a site in a language: the site's first language at the root and
 * each other under its code, like `/en/plant-care`. Relative on the site
 * being read, and on another site absolute, on that site's `url`.
 */
const addressOn = (cms: CmsService, site: string, locale: string | undefined, path: string, readingSite: string): string => {
    const first = cms.siteLocales(site)[0];
    const prefixed = locale === undefined || locale === first ? path : `/${locale}${path === '/' ? '' : path}`;
    if (site === readingSite || site === DEFAULT_SITE) return prefixed;
    return `${String(cms.siteInfo(site)['url']).replace(/\/+$/, '')}${prefixed}`;
};

/**
 * The address of a document on a site: in the reader's language when the
 * site serves it and the document is written in it, otherwise in the site's
 * first language. `undefined` when it shows in neither.
 */
const addressedOn = async (
    cms: CmsService,
    ref: DocumentRef,
    site: string,
    reading: { site: string; locale: string | undefined },
    copy: LinkCopy,
    pathOf: (content: Record<string, unknown>) => string | undefined
): Promise<string | undefined> => {
    const served = cms.siteLocales(site);
    const candidates =
        served.length === 0
            ? [undefined]
            : [...new Set([reading.locale, served[0]])].filter(
                  (locale): locale is string => locale !== undefined && served.includes(locale)
              );
    for (const locale of candidates) {
        const content = await cms.storedIn(ref, locale, copy);
        if (content === undefined) continue;
        const path = pathOf(content);
        if (path !== undefined) return addressOn(cms, site, locale, path, reading.site);
    }
    return undefined;
};

/**
 * Where a content link goes for the site and language being read, or
 * `undefined` when its page or item is unpublished, deleted, or shown on no
 * page. A page goes to its own site. An item goes to the page that shows it,
 * on the site being read when that site shows it.
 */
export const linkHref = async (
    cms: CmsService,
    value: string,
    reading: { site: string; locale: string | undefined },
    copy: LinkCopy
): Promise<string | undefined> => {
    const ref = linkedRef(cms, value);
    if (ref === undefined) return undefined;
    if (ref.type === 'page') {
        const target = cms.target(ref);
        return addressedOn(cms, ref, target.site, reading, copy, () => target.path);
    }
    const listing = cms.listingOf(ref)!;
    const source = await cms.storedIn(ref, undefined, copy);
    if (source === undefined) return undefined;
    const shownOn = cms.choosesSitesFor(ref) ? showsOnOf(source) : undefined;
    const routes = [...listing.routes]
        .filter((route) => shownOn === undefined || shownOn.includes(route.site))
        .sort((left, right) => Number(right.site === reading.site) - Number(left.site === reading.site));
    for (const route of routes) {
        const href = await addressedOn(cms, ref, route.site, reading, copy, (content) => fillPath(route.pattern, content));
        if (href !== undefined) return href;
    }
    if (listing.definition.preview === undefined) return undefined;
    const site = listing.site === DEFAULT_SITE ? reading.site : listing.site;
    const target = cms.target(ref);
    return addressedOn(cms, ref, site, reading, copy, (content) => {
        try {
            return collectionPreviewPath(target, content);
        } catch {
            return undefined;
        }
    });
};

/**
 * Content with each content link turned into its address for the site and
 * language being read, and each one a reader cannot show taken out.
 */
export const resolveLinks = async (
    cms: CmsService,
    definition: ContentDefinition,
    content: Record<string, unknown>,
    reading: { site: string; locale: string | undefined },
    copy: LinkCopy
): Promise<Record<string, unknown>> => {
    const links = contentLinksOf(definition, content);
    if (links.length === 0) return content;
    const hrefs = new Map<string, string | undefined>();
    for (const { ref } of links) {
        if (!hrefs.has(ref)) hrefs.set(ref, await linkHref(cms, ref, reading, copy));
    }
    return withResolvedLinks(definition, content, (ref) => hrefs.get(ref));
};

/**
 * Where a content link's page or item stands.
 */
export const linkTargetStatus = async (cms: CmsService, value: string): Promise<LinkTargetStatus> => {
    const ref = linkedRef(cms, value);
    if (ref === undefined) return 'missing';
    const row = (await cms.document(ref)).row;
    if (row === undefined || (row.draft === null && row.published === null)) {
        return ref.type === 'item' && (await cms.trashed(ref)) !== undefined ? 'trashed' : 'missing';
    }
    return row.publishedVersion === null || row.published === null ? 'unpublished' : 'published';
};

/**
 * The content links in a document's draft, or its published copy without
 * one, whose page or item a reader cannot show.
 */
export const brokenLinksOf = async (cms: CmsService, ref: DocumentRef): Promise<BrokenLink[]> => {
    const { target, row } = await cms.document(ref);
    const content = row?.draft ?? row?.published;
    if (content === null || content === undefined) return [];
    const broken: BrokenLink[] = [];
    const statuses = new Map<string, LinkTargetStatus>();
    for (const link of contentLinksOf(target.definition, content)) {
        if (!statuses.has(link.ref)) statuses.set(link.ref, await linkTargetStatus(cms, link.ref));
        const status = statuses.get(link.ref)!;
        if (status === 'published') continue;
        broken.push({
            path: link.path,
            target: link.ref,
            reason: status,
        });
    }
    return broken;
};

/**
 * What the link control shows of a site: its label and icon, Shared for
 * shared content when there are sites, and nothing without them.
 */
const markOf = (cms: CmsService, site: string): { siteLabel: string | null; siteIcon: string | null } => {
    if (site === DEFAULT_SITE) {
        return {
            siteLabel: cms.siteNames().length === 0 ? null : 'Shared',
            siteIcon: null,
        };
    }
    const info = cms.siteInfo(site);
    let siteIcon: string | null = null;
    try {
        siteIcon = new URL(String(info['icon']), String(info['url'])).toString();
    } catch {
        siteIcon = null;
    }
    return {
        siteLabel: String(info['label']),
        siteIcon,
    };
};

/**
 * A page's name written out the way editors see it without a label:
 * `plantCarePage` is Plant care.
 */
const pageNameOf = (name: string): string =>
    name
        .replace(/Page$/, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .replace(/^./, (first) => first.toUpperCase());

const statusOfPage = (status: string): LinkTargetStatus =>
    status === 'published' || status === 'changed' ? 'published' : status === 'draft' ? 'unpublished' : 'missing';

/**
 * Every page, and every item a page shows or a collection previews, that a
 * content link may point at, on every site `sees` allows, matching `query`
 * by label or path.
 */
const searchTargets = async (cms: CmsService, query: string, sees: (site: string) => boolean): Promise<LinkTarget[]> => {
    const term = query.trim().toLowerCase();
    const matches = (target: { label: string; path: string | null }): boolean =>
        term === '' || target.label.toLowerCase().includes(term) || (target.path ?? '').toLowerCase().includes(term);
    const found: LinkTarget[] = [];
    for (const [site, pages] of Object.entries(cms.sites)) {
        if (!sees(site)) continue;
        for (const [name, entry] of Object.entries(pages)) {
            if (servesCollection(entry.page)) continue;
            const label = entry.page.label ?? pageNameOf(name);
            if (
                !matches({
                    label,
                    path: entry.path,
                })
            )
                continue;
            const ref: DocumentRef = {
                type: 'page',
                name,
                ...(site === DEFAULT_SITE
                    ? {}
                    : {
                          site,
                      }),
            };
            found.push({
                ref: formatRef(ref),
                label,
                site,
                ...markOf(cms, site),
                path: entry.path,
                status: await linkTargetStatus(cms, formatRef(ref)),
            });
        }
    }
    for (const listing of cms.listings()) {
        if (!sees(listing.site) || (listing.routes.length === 0 && listing.definition.preview === undefined)) continue;
        const images = new Map(
            (
                await cms.searchItems(listing.brand, {
                    headers: {},
                })
            ).map((item) => [item.id, item.image])
        );
        for (const item of await cms.editorItems(listing.name, listing.site)) {
            if (item.status === 'empty' || !matches(item)) continue;
            const image = images.get(item.id);
            found.push({
                ref: item.ref,
                label: item.label,
                site: listing.site,
                ...markOf(cms, listing.site),
                path: item.path,
                status: statusOfPage(item.status),
                ...(image === undefined
                    ? {}
                    : {
                          image,
                      }),
            });
        }
    }
    return found.slice(0, 50);
};

/**
 * What the link control shows of one content link's page or item, gone ones
 * included.
 */
const describeTarget = async (cms: CmsService, value: string): Promise<LinkTarget> => {
    const ref = linkedRef(cms, value);
    const parsed = parseRef(value);
    const site = parsed?.site ?? DEFAULT_SITE;
    if (ref === undefined) {
        return {
            ref: value,
            label: value,
            site,
            ...(site === DEFAULT_SITE || cms.siteNames().includes(site)
                ? markOf(cms, site)
                : {
                      siteLabel: site,
                      siteIcon: null,
                  }),
            path: null,
            status: 'missing',
        };
    }
    const status = await linkTargetStatus(cms, value);
    const state = await cms.draftState(ref);
    const content = state.row?.draft ?? state.row?.published ?? {};
    if (ref.type === 'page') {
        return {
            ref: value,
            label: documentLabel(state),
            site: state.target.site,
            ...markOf(cms, state.target.site),
            path: state.target.path ?? null,
            status,
        };
    }
    const listing = cms.listingOf(ref)!;
    const [named] = await cms.searchItems(listing.brand, {
        ids: ref.type === 'item' ? [ref.id] : [],
        headers: {},
    });
    const route = listing.routes[0];
    return {
        ref: value,
        label: status === 'missing' || status === 'trashed' ? value : documentLabel(state),
        site: listing.site,
        ...markOf(cms, listing.site),
        path: route === undefined ? null : (fillPath(route.pattern, content) ?? null),
        status,
        ...(named?.image === undefined
            ? {}
            : {
                  image: named.image,
              }),
    };
};

/**
 * The pages and items a content link may point at, found by a search term,
 * or the ones `refs` names, as the link control shows them.
 */
export const linkTargets = async (
    cms: CmsService,
    input: { query?: string; refs?: readonly string[]; sees: (site: string) => boolean }
): Promise<LinkTarget[]> => {
    if (input.refs !== undefined) {
        const described: LinkTarget[] = [];
        for (const ref of input.refs) described.push(await describeTarget(cms, ref));
        return described;
    }
    return searchTargets(cms, input.query ?? '', input.sees);
};

/**
 * The site a URL belongs to, by the site's `url`, and the path on it. Of two
 * sites on one host, the one with the longer path wins.
 */
const siteAddressOf = (cms: CmsService, url: URL, sees: (site: string) => boolean): { site: string; path: string } | undefined => {
    let found: { site: string; path: string; base: string } | undefined;
    for (const site of cms.siteNames()) {
        if (!sees(site)) continue;
        let base: URL;
        try {
            base = new URL(String(cms.siteInfo(site)['url']));
        } catch {
            continue;
        }
        if (base.origin !== url.origin) continue;
        const prefix = base.pathname.replace(/\/+$/, '');
        const path = url.pathname === prefix ? '/' : url.pathname.startsWith(`${prefix}/`) ? url.pathname.slice(prefix.length) : undefined;
        if (path === undefined || (found !== undefined && found.base.length >= prefix.length)) continue;
        found = {
            site,
            path,
            base: prefix,
        };
    }
    return found === undefined
        ? undefined
        : {
              site: found.site,
              path: found.path,
          };
};

/**
 * The page or item served at a URL on one of the sites `sees` allows, in any
 * language the site serves, as the link control shows it. Paths match
 * exactly, so `/plant-care/` is not `/plant-care`.
 */
export const linkTargetAt = async (cms: CmsService, value: string, sees: (site: string) => boolean): Promise<LinkTarget | undefined> => {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return undefined;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    const address = siteAddressOf(cms, url, sees);
    if (address === undefined || (address.path !== '/' && address.path.endsWith('/'))) return undefined;
    const served = await cms.pageAt(address.path, address.site);
    if (served === undefined) return undefined;
    const { locale: _, ...source } = served;
    const ref = formatRef(source);
    return linkedRef(cms, ref) === undefined ? undefined : describeTarget(cms, ref);
};

/**
 * Every document holding a content link, with the page or item it links to,
 * read from the refs index. With `to`, only the links to that one.
 */
export const contentLinks = async (cms: CmsService, to?: string): Promise<ContentLinkEdge[]> => {
    const listings = cms.listings();
    const edges = new Map<string, ContentLinkEdge>();
    for (const holder of await cms.store.holders(LINK_BRAND, to === undefined ? undefined : [to])) {
        const target = cms.declaredTarget(holder.document, listings);
        if (target === undefined) continue;
        const from = formatRef(target.ref);
        const key = `${from} ${holder.refId}`;
        const known = edges.get(key);
        if (known !== undefined) {
            if (!known.fieldPaths.includes(holder.fieldPath)) known.fieldPaths.push(holder.fieldPath);
            known.published ||= holder.published;
            continue;
        }
        edges.set(key, {
            from,
            fromSite: target.site,
            to: holder.refId,
            fieldPaths: [holder.fieldPath],
            published: holder.published,
        });
    }
    return [...edges.values()];
};

/**
 * One document holding a content link to another, as the Info popover lists
 * it.
 */
export interface LinkedFrom {
    ref: string;
    label: string;
    site: string;
    siteLabel: string | null;
    siteIcon: string | null;
    path: string | null;
    fieldPaths: string[];
}

/**
 * Every document, on any site `sees` allows, holding a content link to the
 * page or item given.
 */
export const linkedFrom = async (cms: CmsService, ref: DocumentRef, sees: (site: string) => boolean): Promise<LinkedFrom[]> => {
    const found: LinkedFrom[] = [];
    for (const edge of await contentLinks(cms, formatRef(ref))) {
        if (!sees(edge.fromSite)) continue;
        const holder = parseRef(edge.from)!;
        const state = await cms.draftState(holder);
        found.push({
            ref: edge.from,
            label: documentLabel(state),
            site: edge.fromSite,
            ...markOf(cms, edge.fromSite),
            path: cms.addressOf(state.target, state.row?.draft ?? state.row?.published) ?? null,
            fieldPaths: edge.fieldPaths,
        });
    }
    return found;
};

/**
 * The cache tags of every document holding a content link to the one given:
 * a page's own, an item's and its collection's, a global's on each site.
 */
export const linkHolderTags = async (
    cms: CmsService,
    ref: DocumentRef,
    tagsOf: (holder: DocumentRef) => readonly string[]
): Promise<string[]> => {
    const value = formatRef(ref);
    if (!LINK_REF.test(value)) return [];
    const tags: string[] = [];
    for (const edge of await contentLinks(cms, value)) tags.push(...tagsOf(parseRef(edge.from)!));
    return tags;
};

/**
 * The sites whose documents hold a content link to the one given, which a
 * change to its address refreshes.
 */
export const linkingSites = async (cms: CmsService, ref: DocumentRef): Promise<string[]> => {
    const value = formatRef(ref);
    if (!LINK_REF.test(value)) return [];
    const sites = new Set<string>();
    for (const edge of await contentLinks(cms, value)) {
        if (edge.fromSite === DEFAULT_SITE) for (const site of cms.siteNames()) sites.add(site);
        else sites.add(edge.fromSite);
    }
    return [...sites];
};
