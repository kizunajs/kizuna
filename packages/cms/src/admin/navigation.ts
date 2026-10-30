import { useSyncExternalStore } from 'react';
import { formatRef, parseRef } from '../refs.js';
import { humanize } from '../view/schema.js';
import type { AdminSite } from './config.js';
import type { ViewSummary } from './views.js';

/**
 * What the admin shows, read from the address's path, like
 * `/admin/collections/employees`, so every screen has an address of its own.
 * With several sites, `site` is the one the screen is shown in, from the
 * address's first segment, like `/admin/uk/collections/events`.
 */
export type Screen = (
    | {
          kind: 'dashboard';
      }
    | {
          kind: 'pages';
      }
    | {
          kind: 'media';
          /**
           * The image whose details are open beside the library.
           */
          id?: string;
      }
    | {
          kind: 'collection';
          name: string;
      }
    | {
          kind: 'document';
          ref: string;
      }
    | {
          kind: 'view';
          name: string;
      }
    | {
          kind: 'record';
          view: string;
          id: string;
      }
    | {
          /**
           * An address under the admin's that names no screen.
           */
          kind: 'missing';
      }
) & {
    site?: string;
};

let adminPath = '/admin';

/**
 * Where every screen's address starts, from the config the server wrote into
 * the page. Set once, before the admin renders.
 */
export const setAdminPath = (path: string): void => {
    adminPath = path.replace(/\/+$/, '');
};

let sites: readonly AdminSite[] = [];

/**
 * The sites the admin's addresses may start with, from the config the server
 * wrote into the page. Set once, before the admin renders.
 */
export const setSites = (declared: readonly AdminSite[]): void => {
    sites = declared;
};

const siteNamed = (key: string | undefined): AdminSite | undefined => sites.find((site) => site.key === key);

const ownsCollection = (site: AdminSite | undefined, name: string): boolean =>
    site?.collections.some((collection) => collection.name === name) ?? false;

const ownsGlobal = (site: AdminSite | undefined, name: string): boolean => site?.globals.some((global) => global.name === name) ?? false;

const under = (...segments: string[]): string => `${adminPath}/${segments.map(encodeURIComponent).join('/')}`;

const root = (): string => (adminPath === '' ? '/' : adminPath);

let viewSite: string | undefined;

/**
 * The site the admin is shown in, or `undefined` for All sites, which a
 * screen naming no site of its own opens in. The admin sets it as it renders.
 */
export const showSite = (site: string | undefined): void => {
    viewSite = site;
};

/**
 * The site of the address open now.
 */
const addressSite = (): string | undefined => (typeof window === 'undefined' ? undefined : screenOf(window.location.pathname).site);

/**
 * A screen's address in one site, or in the shared content for `undefined`.
 * A site's own document keeps its site, and a page always has one.
 */
export const hrefIn = (site: string | undefined, screen: Screen): string => {
    const ref = screen.kind === 'document' ? parseRef(screen.ref) : undefined;
    const prefix = (ref?.type === 'page' ? ref.site : (ref?.site ?? site)) ?? '';
    const at = (...segments: string[]): string => under(...(prefix === '' ? segments : [prefix, ...segments]));
    if (screen.kind === 'pages') return at('pages');
    if (screen.kind === 'media') return screen.id === undefined ? at('media') : at('media', screen.id);
    if (screen.kind === 'collection') return at('collections', screen.name);
    if (screen.kind === 'view') return at('views', screen.name);
    if (screen.kind === 'record') return at('views', screen.view, screen.id);
    if (screen.kind === 'document' && ref !== undefined) {
        if (ref.type === 'item') return at('collections', ref.collection, ref.id);
        if (ref.type === 'global') return at('globals', ref.name);
        return at('pages', ref.name);
    }
    return prefix === '' ? root() : under(prefix);
};

/**
 * A screen's address, in the site it names or else the site the admin is
 * shown in, so a link from the UK's screens to a shared office opens it on
 * the UK's tab.
 */
export const hrefOf = (screen: Screen): string => hrefIn(screen.site ?? viewSite, screen);

const decodedSegmentsOf = (path: string): string[] | undefined => {
    try {
        return path.split('/').map(decodeURIComponent);
    } catch {
        return undefined;
    }
};

const MISSING: Screen = {
    kind: 'missing',
};

/**
 * The screen the segments after the admin's path, and after a site's key,
 * name. In a site, a global or collection of the site's own is that site's
 * document, and any other is the site's view of a shared one.
 */
const screenAt = (segments: readonly string[], site: AdminSite | undefined): Screen => {
    if (segments.length === 0) {
        return {
            kind: 'dashboard',
        };
    }
    const [section, name, id, ...rest] = segments;
    if (rest.length > 0) return MISSING;
    if (section === 'pages' && name === undefined) {
        return {
            kind: 'pages',
        };
    }
    if (section === 'pages' && name !== undefined && id === undefined) {
        return {
            kind: 'document',
            ref: formatRef({
                type: 'page',
                name,
                ...(site === undefined
                    ? {}
                    : {
                          site: site.key,
                      }),
            }),
        };
    }
    if (section === 'globals' && name !== undefined && id === undefined) {
        return {
            kind: 'document',
            ref: formatRef({
                type: 'global',
                name,
                ...(ownsGlobal(site, name)
                    ? {
                          site: site!.key,
                      }
                    : {}),
            }),
        };
    }
    if (section === 'collections' && name !== undefined) {
        return id === undefined
            ? {
                  kind: 'collection',
                  name,
              }
            : {
                  kind: 'document',
                  ref: formatRef({
                      type: 'item',
                      collection: name,
                      id,
                      ...(ownsCollection(site, name)
                          ? {
                                site: site!.key,
                            }
                          : {}),
                  }),
              };
    }
    if (section === 'views' && name !== undefined) {
        return id === undefined
            ? {
                  kind: 'view',
                  name,
              }
            : {
                  kind: 'record',
                  view: name,
                  id,
              };
    }
    if (section === 'media' && id === undefined) {
        return name === undefined
            ? {
                  kind: 'media',
              }
            : {
                  kind: 'media',
                  id: name,
              };
    }
    return MISSING;
};

/**
 * The screen a path names, like `/admin/collections/employees/k3j9x2` for
 * that employee, or `/admin/uk/collections/events` for the UK's events.
 */
export const screenOf = (pathname: string): Screen => {
    if (pathname === adminPath || pathname === `${adminPath}/`) {
        return {
            kind: 'dashboard',
        };
    }
    if (!pathname.startsWith(`${adminPath}/`)) return MISSING;
    const segments = decodedSegmentsOf(pathname.slice(adminPath.length + 1));
    if (segments === undefined || segments.some((segment) => segment === '')) return MISSING;
    const site = siteNamed(segments[0]);
    if (site === undefined) return screenAt(segments, undefined);
    const screen = screenAt(segments.slice(1), site);
    return screen.kind === 'missing'
        ? screen
        : {
              ...screen,
              site: site.key,
          };
};

/**
 * The screen of the same kind in another site, or in All sites for
 * `undefined`, which the switcher opens: the same page when that site has
 * one by its name, the same shared document, or the dashboard when the site
 * has nothing like it.
 */
export const screenInSite = (screen: Screen, key: string | undefined): Screen => {
    const site = siteNamed(key);
    const placed = (shown: Screen): Screen =>
        site === undefined
            ? shown
            : {
                  ...shown,
                  site: site.key,
              };
    const dashboard = placed({
        kind: 'dashboard',
    });
    if (screen.kind === 'media' || screen.kind === 'view' || screen.kind === 'record') {
        const { site: _, ...shown } = screen;
        return placed(shown);
    }
    if (screen.kind === 'pages') {
        return placed({
            kind: 'pages',
        });
    }
    const listOf = (name: string): Screen =>
        placed({
            kind: 'collection',
            name,
        });
    if (screen.kind === 'collection') {
        const shared = !sites.some((candidate) => ownsCollection(candidate, screen.name));
        return shared || ownsCollection(site, screen.name) ? listOf(screen.name) : dashboard;
    }
    if (screen.kind !== 'document') return dashboard;
    const ref = parseRef(screen.ref);
    if (ref === undefined) return dashboard;
    // All sites shows every site's documents where they are.
    if (site === undefined) {
        return {
            kind: 'document',
            ref: screen.ref,
        };
    }
    if (ref.type === 'page') {
        return site.pages.includes(ref.name)
            ? placed({
                  kind: 'document',
                  ref: formatRef({
                      type: 'page',
                      site: site.key,
                      name: ref.name,
                  }),
              })
            : placed({
                  kind: 'pages',
              });
    }
    if (ref.site === undefined) {
        return placed({
            kind: 'document',
            ref: screen.ref,
        });
    }
    if (ref.type === 'global') {
        return ownsGlobal(site, ref.name)
            ? placed({
                  kind: 'document',
                  ref: formatRef({
                      type: 'global',
                      site: site.key,
                      name: ref.name,
                  }),
              })
            : dashboard;
    }
    // Another site's items have ids of their own, so its list opens instead.
    return ownsCollection(site, ref.collection) ? listOf(ref.collection) : dashboard;
};

/**
 * Where an address of the admin's old hash form, like
 * `#/collections/employees`, now lives, or `undefined` for any other hash.
 */
export const addressOfHash = (hash: string): string | undefined => {
    if (!hash.startsWith('#/')) return undefined;
    const [section = '', name = '', id = ''] = decodedSegmentsOf(hash.slice(2)) ?? [];
    if (section === 'edit' && name !== '') {
        return hrefOf({
            kind: 'document',
            ref: name,
        });
    }
    const screen = screenOf(under(...[section, name, id].filter((segment) => segment !== '')));
    return hrefOf(
        screen.kind === 'missing'
            ? {
                  kind: 'dashboard',
              }
            : screen
    );
};

/**
 * Fired on the window when the admin changes the address itself, which
 * `popstate` does not report.
 */
const ADDRESS_CHANGED = 'kizuna-cms:address';

const currentAddress = (): string => `${window.location.pathname}${window.location.search}`;

/**
 * Open `href`, a path and query under the admin's, as a new entry in the
 * browser's history.
 */
export const navigate = (href: string): void => {
    if (href === currentAddress()) return;
    window.history.pushState(null, '', href);
    window.dispatchEvent(new Event(ADDRESS_CHANGED));
};

/**
 * Open `href` in place of the address shown, for an address that leads on
 * to another, like All sites for an editor of one site.
 */
export const replaceAddress = (href: string): void => {
    if (href === currentAddress()) return;
    window.history.replaceState(null, '', href);
    window.dispatchEvent(new Event(ADDRESS_CHANGED));
};

/**
 * Change the query in place, for state that belongs to the screen open,
 * like a list's page. A name given `undefined` leaves the query.
 */
export const replaceQuery = (changes: Readonly<Record<string, string | readonly string[] | undefined>>): void => {
    const url = new URL(window.location.href);
    for (const [name, value] of Object.entries(changes)) {
        url.searchParams.delete(name);
        for (const each of value === undefined ? [] : typeof value === 'string' ? [value] : value) url.searchParams.append(name, each);
    }
    const next = `${url.pathname}${url.search}`;
    if (next === currentAddress()) return;
    window.history.replaceState(window.history.state, '', next);
    window.dispatchEvent(new Event(ADDRESS_CHANGED));
};

const subscribe = (onChange: () => void): (() => void) => {
    window.addEventListener('popstate', onChange);
    window.addEventListener(ADDRESS_CHANGED, onChange);
    return () => {
        window.removeEventListener('popstate', onChange);
        window.removeEventListener(ADDRESS_CHANGED, onChange);
    };
};

/**
 * The address's path and query, following it as it changes.
 */
export const useAddress = (): URL => {
    const address = useSyncExternalStore(subscribe, currentAddress);
    return new URL(address, 'http://admin.invalid');
};

/**
 * Where a click on a link goes, when the admin can open it in place: a
 * plain click on a link to one of its own screens. A click with a modifier,
 * like ⌘ for a new tab, stays the browser's.
 */
export const inAppTargetOf = (event: MouseEvent): string | undefined => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return undefined;
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute('download')) return undefined;
    if (anchor.target !== '' && anchor.target !== '_self') return undefined;
    const url = new URL(anchor.href);
    if (url.origin !== window.location.origin || url.hash !== '' || screenOf(url.pathname).kind === 'missing') return undefined;
    return `${url.pathname}${url.search}`;
};

export interface GlobalSummary {
    name: string;
    label: string | null;
    group: string | null;
    status: string;
    updatedAt: string | null;
}

export interface CollectionSummary {
    name: string;
    label: string;
    count: number;
}

export interface NavigationEntry {
    label: string;
    screen: Screen;
    count?: number;
}

export interface NavigationSection {
    label: string;
    /**
     * The site whose own content the heading holds, which can fold.
     */
    site?: string;
    entries: NavigationEntry[];
}

/**
 * The heading pages sit under, with every global, collection and view that
 * names no `group`.
 */
export const CONTENT_GROUP = 'Content';

/**
 * The heading the shared content sits under, with several sites.
 */
export const SHARED_GROUP = 'Shared';

/**
 * The view of every site at once, which an admin over every site opens.
 */
export const ALL_SITES = 'All sites';

/**
 * The sidebar's headings: Content first, with the pages and the media, then each `group`
 * in the order the globals, collections and views first name it.
 *
 * With several sites, the sidebar has the site shown under its label, with
 * its pages, its own collections and globals and its media, and then Shared,
 * with every shared collection, global and view. All sites lists every site
 * the editor may open that way, then Shared with the shared media.
 */
export const navigationOf = (options: {
    globals: readonly GlobalSummary[];
    collections: readonly CollectionSummary[];
    views?: readonly ViewSummary[];
    groups: Readonly<Record<string, string>>;
    sites?: readonly AdminSite[];
    /**
     * The site the sidebar is shown in.
     */
    site?: string;
}): NavigationSection[] => {
    const declared = options.sites ?? [];
    if (declared.length > 0) return siteNavigationOf(options, declared);
    const sections = new Map<string, NavigationEntry[]>([
        [
            CONTENT_GROUP,
            [
                {
                    label: 'Pages',
                    screen: {
                        kind: 'pages',
                    },
                },
                {
                    label: 'Media',
                    screen: {
                        kind: 'media',
                    },
                },
            ],
        ],
    ]);
    const add = (group: string | null | undefined, entry: NavigationEntry): void => {
        const label = group ?? CONTENT_GROUP;
        sections.set(label, [...(sections.get(label) ?? []), entry]);
    };
    for (const { group, ...entry } of sharedEntriesOf(options, undefined)) add(group, entry);
    return [...sections].map(([label, entries]) => ({
        label,
        entries,
    }));
};

/**
 * Every shared global, collection and view as a sidebar entry, with the
 * `group` it names, shown in `site` when one is open.
 */
const sharedEntriesOf = (
    options: {
        globals: readonly GlobalSummary[];
        collections: readonly CollectionSummary[];
        views?: readonly ViewSummary[];
        groups: Readonly<Record<string, string>>;
        sites?: readonly AdminSite[];
    },
    site: string | undefined
): Array<NavigationEntry & { group?: string | null }> => {
    const shownIn =
        site === undefined
            ? {}
            : {
                  site,
              };
    const ownedBySite = (kind: 'globals' | 'collections', name: string): boolean =>
        (options.sites ?? []).some((candidate) => candidate[kind].some((entry) => entry.name === name));
    return [
        ...options.globals
            .filter((global) => !ownedBySite('globals', global.name))
            .map((global) => ({
                label: global.label ?? humanize(global.name),
                group: global.group,
                screen: {
                    kind: 'document' as const,
                    ref: `global:${global.name}`,
                    ...shownIn,
                },
            })),
        ...options.collections
            .filter((collection) => !ownedBySite('collections', collection.name))
            .map((collection) => ({
                label: collection.label,
                group: options.groups[collection.name],
                screen: {
                    kind: 'collection' as const,
                    name: collection.name,
                    ...shownIn,
                },
                count: collection.count,
            })),
        ...(options.views ?? []).map((view) => ({
            label: view.label,
            group: options.groups[view.name],
            screen: {
                kind: 'view' as const,
                name: view.name,
                ...shownIn,
            },
        })),
    ];
};

const siteNavigationOf = (options: Parameters<typeof navigationOf>[0], declared: readonly AdminSite[]): NavigationSection[] => {
    const site = declared.find((candidate) => candidate.key === options.site);
    const kindOrder = (entry: NavigationEntry): number => ['collection', 'document', 'view'].indexOf(entry.screen.kind);
    const sharedEntries = sharedEntriesOf(options, site?.key)
        .map(({ group: _, ...entry }) => entry)
        .sort((left, right) => kindOrder(left) - kindOrder(right));
    const shared: NavigationSection = {
        label: SHARED_GROUP,
        entries:
            site === undefined
                ? [
                      ...sharedEntries,
                      {
                          label: 'Media',
                          screen: {
                              kind: 'media',
                          },
                      },
                  ]
                : sharedEntries,
    };
    const siteSection = (shown: AdminSite): NavigationSection => ({
        label: shown.label,
        site: shown.key,
        entries: [
            {
                label: 'Pages',
                screen: {
                    kind: 'pages',
                    site: shown.key,
                },
            },
            ...shown.collections.map((collection) => {
                const listed = options.collections.find((candidate) => candidate.name === collection.name);
                return {
                    label: listed?.label ?? collection.label ?? humanize(collection.name),
                    screen: {
                        kind: 'collection' as const,
                        name: collection.name,
                        site: shown.key,
                    },
                    ...(listed === undefined
                        ? {}
                        : {
                              count: listed.count,
                          }),
                };
            }),
            ...shown.globals.map((global) => ({
                label: options.globals.find((candidate) => candidate.name === global.name)?.label ?? global.label ?? humanize(global.name),
                screen: {
                    kind: 'document' as const,
                    ref: formatRef({
                        type: 'global',
                        site: shown.key,
                        name: global.name,
                    }),
                    site: shown.key,
                },
            })),
            {
                label: 'Media',
                screen: {
                    kind: 'media',
                    site: shown.key,
                },
            },
        ],
    });
    return [...(site === undefined ? declared : [site]).map(siteSection), shared];
};

/**
 * Where every screen's trail starts: the dashboard, or with several sites
 * the site whose content it is, Shared, or All sites for the dashboard and
 * the pages of every site.
 */
export const trailStart = (): { label: string; href?: string } => {
    if (sites.length === 0) {
        return {
            label: 'Dashboard',
            href: root(),
        };
    }
    const site = siteNamed(addressSite());
    if (site !== undefined) {
        return {
            label: site.label,
            href: under(site.key),
        };
    }
    const shown = typeof window === 'undefined' ? undefined : screenOf(window.location.pathname);
    return shown?.kind === 'pages' || shown?.kind === 'dashboard'
        ? {
              label: ALL_SITES,
              href: root(),
          }
        : {
              label: SHARED_GROUP,
          };
};

/**
 * How many sites the switcher lists before it offers a search and groups
 * them by country.
 */
export const MANY_SITES = 6;

/**
 * The sites the switcher lists for a search, grouped by the country each
 * serves when there are many, in the order the sites first name them. A
 * site with no country leads, under no heading.
 */
export const siteGroupsOf = (shown: readonly AdminSite[], search: string): Array<{ country: string | undefined; sites: AdminSite[] }> => {
    const term = search.trim().toLowerCase();
    const found = shown.filter((site) => term === '' || site.label.toLowerCase().includes(term) || site.key.includes(term));
    if (shown.length <= MANY_SITES) {
        return [
            {
                country: undefined,
                sites: found,
            },
        ];
    }
    const groups = new Map<string | undefined, AdminSite[]>([[undefined, []]]);
    for (const site of found) {
        const country = site.country ?? undefined;
        groups.set(country, [...(groups.get(country) ?? []), site]);
    }
    return [...groups]
        .filter(([, sites]) => sites.length > 0)
        .map(([country, sites]) => ({
            country,
            sites,
        }));
};

/**
 * Whether the CMS serves several sites.
 */
export const hasSites = (): boolean => sites.length > 0;

/**
 * The declared site named `key`, for a screen's header.
 */
export const siteOf = (key: string | undefined): AdminSite | undefined => siteNamed(key);

/**
 * Whether a sidebar entry is the screen shown, or the list it opened from.
 */
export const isCurrent = (entry: Screen, shown: Screen): boolean => {
    if (entry.kind === 'document') return shown.kind === 'document' && shown.ref === entry.ref;
    if (entry.kind === 'collection') {
        const ref = shown.kind === 'document' ? parseRef(shown.ref) : undefined;
        return (shown.kind === 'collection' && shown.name === entry.name) || (ref?.type === 'item' && ref.collection === entry.name);
    }
    if (entry.kind === 'view') {
        return (shown.kind === 'view' && shown.name === entry.name) || (shown.kind === 'record' && shown.view === entry.name);
    }
    if (entry.kind === 'media') return shown.kind === 'media' && shown.site === entry.site;
    if (entry.kind === 'pages') {
        const ref = shown.kind === 'document' ? parseRef(shown.ref) : undefined;
        return (shown.kind === 'pages' && shown.site === entry.site) || (ref?.type === 'page' && ref.site === entry.site);
    }
    return shown.kind === 'dashboard';
};

/**
 * The browser tab's title: the screen's, then the site's label or `name`, as
 * in "Front page · Hagen UK".
 */
export const tabTitleOf = (screenTitle: string | undefined, siteName: string | undefined): string => {
    const site = siteName ?? 'Kizuna CMS';
    return screenTitle === undefined || screenTitle === '' ? site : `${screenTitle} · ${site}`;
};
