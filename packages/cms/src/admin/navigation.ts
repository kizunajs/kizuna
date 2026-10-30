import { useSyncExternalStore } from 'react';
import { formatRef, parseRef } from '../refs.js';
import { humanize } from '../view/schema.js';
import type { ViewSummary } from './views.js';

/**
 * What the admin shows, read from the address's path, like
 * `/admin/collections/employees`, so every screen has an address of its own.
 */
export type Screen =
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
      };

let adminPath = '/admin';

/**
 * Where every screen's address starts, from the config the server wrote into
 * the page. Set once, before the admin renders.
 */
export const setAdminPath = (path: string): void => {
    adminPath = path.replace(/\/+$/, '');
};

const under = (...segments: string[]): string => `${adminPath}/${segments.map(encodeURIComponent).join('/')}`;

const documentHrefOf = (value: string): string => {
    const ref = parseRef(value);
    if (ref === undefined) return adminPath === '' ? '/' : adminPath;
    if (ref.type === 'item') return under('collections', ref.collection, ref.id);
    if (ref.type === 'global') return under('globals', ref.name);
    return ref.site === undefined ? under('pages', ref.name) : under('pages', ref.site, ref.name);
};

export const hrefOf = (screen: Screen): string => {
    if (screen.kind === 'pages') return under('pages');
    if (screen.kind === 'media') return screen.id === undefined ? under('media') : under('media', screen.id);
    if (screen.kind === 'collection') return under('collections', screen.name);
    if (screen.kind === 'document') return documentHrefOf(screen.ref);
    if (screen.kind === 'view') return under('views', screen.name);
    if (screen.kind === 'record') return under('views', screen.view, screen.id);
    return adminPath === '' ? '/' : adminPath;
};

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
 * The screen a path names, like `/admin/collections/employees/k3j9x2` for
 * that employee.
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
    const [section, name, id, ...rest] = segments;
    if (rest.length > 0) return MISSING;
    if (section === 'pages' && name === undefined) {
        return {
            kind: 'pages',
        };
    }
    if (section === 'pages' && name !== undefined) {
        return {
            kind: 'document',
            ref:
                id === undefined
                    ? formatRef({
                          type: 'page',
                          name,
                      })
                    : formatRef({
                          type: 'page',
                          site: name,
                          name: id,
                      }),
        };
    }
    if (section === 'globals' && name !== undefined && id === undefined) {
        return {
            kind: 'document',
            ref: formatRef({
                type: 'global',
                name,
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
    entries: NavigationEntry[];
}

/**
 * The heading pages sit under, with every global, collection and view that
 * names no `group`.
 */
export const CONTENT_GROUP = 'Content';

/**
 * The sidebar's headings: Content first, with the pages and the media, then each `group`
 * in the order the globals, collections and views first name it.
 */
export const navigationOf = (options: {
    globals: readonly GlobalSummary[];
    collections: readonly CollectionSummary[];
    views?: readonly ViewSummary[];
    groups: Readonly<Record<string, string>>;
}): NavigationSection[] => {
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
    for (const global of options.globals) {
        add(global.group, {
            label: global.label ?? humanize(global.name),
            screen: {
                kind: 'document',
                ref: `global:${global.name}`,
            },
        });
    }
    for (const collection of options.collections) {
        add(options.groups[collection.name], {
            label: collection.label,
            screen: {
                kind: 'collection',
                name: collection.name,
            },
            count: collection.count,
        });
    }
    for (const view of options.views ?? []) {
        add(options.groups[view.name], {
            label: view.label,
            screen: {
                kind: 'view',
                name: view.name,
            },
        });
    }
    return [...sections].map(([label, entries]) => ({
        label,
        entries,
    }));
};

/**
 * Whether a sidebar entry is the screen shown, or the list it opened from.
 */
export const isCurrent = (entry: Screen, shown: Screen): boolean => {
    if (entry.kind === 'document') return shown.kind === 'document' && shown.ref === entry.ref;
    if (entry.kind === 'collection') {
        return (
            (shown.kind === 'collection' && shown.name === entry.name) ||
            (shown.kind === 'document' && shown.ref.startsWith(`item:${entry.name}:`))
        );
    }
    if (entry.kind === 'view') {
        return (shown.kind === 'view' && shown.name === entry.name) || (shown.kind === 'record' && shown.view === entry.name);
    }
    if (entry.kind === 'media') return shown.kind === 'media';
    if (entry.kind === 'pages') return shown.kind === 'pages' || (shown.kind === 'document' && shown.ref.startsWith('page:'));
    return shown.kind === 'dashboard';
};

/**
 * The browser tab's title: the screen's, then the site's `name`, as in
 * "Front page · Hagen".
 */
export const tabTitleOf = (screenTitle: string | undefined, siteName: string | undefined): string => {
    const site = siteName ?? 'Kizuna CMS';
    return screenTitle === undefined || screenTitle === '' ? site : `${screenTitle} · ${site}`;
};
