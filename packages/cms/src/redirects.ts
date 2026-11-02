import { collectionPreviewPath, showsOnOf, type CmsService, type Target } from './cms.js';
import { fillPath } from './dynamic.js';
import { DEFAULT_SITE } from './options.js';
import { formatRef, sourceRefOf, type DocumentRef } from './refs.js';
import type { DocumentRow } from './storage/store.js';
import type { NewRedirect, PublishedAddress, RedirectChanges } from './storage/redirect-store.js';

/**
 * The copy of a stored row that counts as live: the published copy, or for
 * a document about to publish, its draft.
 */
export type LiveCopy = (target: Target, row: DocumentRow | undefined) => Record<string, unknown> | null | undefined;

/**
 * Each row's published copy.
 */
export const publishedCopy: LiveCopy = (_, row) => (row === undefined || row.publishedVersion === null ? undefined : row.published);

const storedKey = (target: Target): string => `${target.kind}\n${target.site}\n${target.locale}\n${target.key}`;

/**
 * Each row's copy once some documents publish: their drafts, and every other
 * row's published copy.
 */
export const publishingCopy = (cms: CmsService, refs: readonly DocumentRef[]): LiveCopy => {
    const publishing = new Set(refs.map((ref) => storedKey(cms.target(ref))));
    return (target, row) => (publishing.has(storedKey(target)) ? (row?.draft ?? row?.published) : publishedCopy(target, row));
};

/**
 * A path in a language on a site: the site's first language at the root, and
 * each other under its code, like `/en/shops/oslo`.
 */
const prefixed = (cms: CmsService, site: string, locale: string | undefined, path: string): string =>
    locale === undefined || locale === cms.siteLocales(site)[0] ? path : `/${locale}${path === '/' ? '' : path}`;

/**
 * Where a document is served on a site, in each language it has content in.
 */
const addressesOn = async (
    cms: CmsService,
    ref: DocumentRef,
    site: string,
    live: LiveCopy,
    pathOf: (content: Record<string, unknown>) => string | undefined
): Promise<PublishedAddress[]> => {
    const served = cms.siteLocales(site);
    const addresses: PublishedAddress[] = [];
    for (const locale of served.length === 0 ? [undefined] : served) {
        const content = await cms.storedWith(ref, locale, live);
        if (content === undefined) continue;
        const path = pathOf(content);
        if (path === undefined) continue;
        addresses.push({
            site,
            locale: locale ?? null,
            path: prefixed(cms, site, locale, path),
        });
    }
    return addresses;
};

/**
 * Every address a page or an item is served at, per site and language, from
 * the copy `live` takes of each row. An item is served by the route of each
 * site that shows it, or without routes at its collection's `preview.url`.
 * A global has none.
 */
export const addressesOf = async (cms: CmsService, ref: DocumentRef, live: LiveCopy): Promise<PublishedAddress[]> => {
    const source = sourceRefOf(ref);
    if (source.type === 'global') return [];
    if (source.type === 'page') {
        const target = cms.target(source);
        const path = target.path;
        return path === undefined ? [] : addressesOn(cms, source, target.site, live, () => path);
    }
    const listing = cms.listingOf(source);
    if (listing === undefined) return [];
    const { target, row } = await cms.document(source);
    const sourceContent = live(target, row);
    if (sourceContent === null || sourceContent === undefined) return [];
    const shownOn = cms.choosesSitesFor(source) ? showsOnOf(sourceContent) : undefined;
    const sites = cms.siteNames().length === 0 ? [DEFAULT_SITE] : listing.site === DEFAULT_SITE ? cms.siteNames() : [listing.site];
    const addresses: PublishedAddress[] = [];
    for (const site of sites) {
        if (shownOn !== undefined && !shownOn.includes(site)) continue;
        const route = listing.routes.find((candidate) => candidate.site === site);
        if (route === undefined && (listing.routes.length > 0 || listing.definition.preview === undefined)) continue;
        addresses.push(
            ...(await addressesOn(cms, source, site, live, (content) => {
                if (route !== undefined) return fillPath(route.pattern, content);
                try {
                    return collectionPreviewPath(target, content);
                } catch {
                    return undefined;
                }
            }))
        );
    }
    return addresses;
};

const placeOf = (address: PublishedAddress): string => `${address.site}\n${address.locale ?? ''}`;

/**
 * The redirects a publish makes and removes, from where a document was
 * served before and where it is served after. Each address that changed
 * redirects to the document, which resolves to wherever it is when read.
 * Every address it is served at after loses any redirect from it, which is
 * how renaming back removes the redirect.
 */
export const renameChanges = (
    ref: DocumentRef,
    before: readonly PublishedAddress[],
    after: readonly PublishedAddress[],
    author: string
): RedirectChanges => {
    const now = new Map(after.map((address) => [placeOf(address), address]));
    const add: NewRedirect[] = [];
    for (const earlier of before) {
        const current = now.get(placeOf(earlier));
        if (current === undefined || current.path === earlier.path) continue;
        add.push({
            site: earlier.site,
            locale: earlier.locale,
            from: earlier.path,
            to: {
                type: 'document',
                ref: formatRef(sourceRefOf(ref)),
            },
            status: 308,
            origin: 'rename',
            createdBy: author,
        });
    }
    const wereAt = new Set(before.map((address) => `${placeOf(address)}\n${address.path}`));
    const areAt = new Set(after.map((address) => `${placeOf(address)}\n${address.path}`));
    const touch = [...before, ...after]
        .filter((address) => !wereAt.has(`${placeOf(address)}\n${address.path}`) || !areAt.has(`${placeOf(address)}\n${address.path}`))
        .map((address) => address.site);
    return {
        add,
        live: after.map((address) => ({
            site: address.site,
            path: address.path,
        })),
        touch: [...new Set(touch)],
    };
};

/**
 * What publishing some documents together writes besides their content: the
 * addresses each version records, and the redirects. Drafts make none, so
 * this runs on publish alone.
 */
export const publishEffects = async (
    cms: CmsService,
    refs: readonly DocumentRef[],
    author: string
): Promise<{ pathsOf: (ref: DocumentRef) => PublishedAddress[] | null; redirects: RedirectChanges }> => {
    const live = publishingCopy(cms, refs);
    const paths = new Map<string, PublishedAddress[] | null>();
    const changes: RedirectChanges[] = [];
    for (const ref of refs) {
        const source = sourceRefOf(cms.canonical(ref));
        const key = formatRef(source);
        if (paths.has(key)) continue;
        if (source.type === 'global' || (source.type === 'item' && cms.listingOf(source) === undefined)) {
            paths.set(key, null);
            continue;
        }
        const after = await addressesOf(cms, source, live);
        paths.set(key, after);
        changes.push(renameChanges(source, await addressesOf(cms, source, publishedCopy), after, author));
    }
    return {
        pathsOf: (ref) => paths.get(formatRef(sourceRefOf(cms.canonical(ref)))) ?? null,
        redirects: {
            add: changes.flatMap((change) => change.add),
            live: changes.flatMap((change) => change.live),
            touch: [...new Set(changes.flatMap((change) => change.touch))],
        },
    };
};

/**
 * Moves on the version of each site holding a redirect to one of these
 * documents, after a change to what those redirects answer that leaves the
 * rows as they are, like an unpublished or trashed target.
 */
export const touchTargets = async (cms: CmsService, refs: readonly DocumentRef[]): Promise<void> => {
    await cms.redirects.touch(await cms.redirects.sitesTargeting(refs.map((ref) => formatRef(sourceRefOf(ref)))));
};
