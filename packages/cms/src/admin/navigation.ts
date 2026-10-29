import { humanize } from '../view/schema.js';
import type { ViewSummary } from './views.js';

/**
 * What the admin shows, read from the address's hash so one route serves
 * every screen.
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
      };

export const hrefOf = (screen: Screen): string => {
    if (screen.kind === 'pages') return '#/pages';
    if (screen.kind === 'media') return screen.id === undefined ? '#/media' : `#/media/${encodeURIComponent(screen.id)}`;
    if (screen.kind === 'collection') return `#/collections/${encodeURIComponent(screen.name)}`;
    if (screen.kind === 'document') return `#/edit/${encodeURIComponent(screen.ref)}`;
    if (screen.kind === 'view') return `#/views/${encodeURIComponent(screen.name)}`;
    if (screen.kind === 'record') return `#/views/${encodeURIComponent(screen.view)}/${encodeURIComponent(screen.id)}`;
    return '#/';
};

export const screenOf = (hash: string): Screen => {
    const [first, second, third] = hash.replace(/^#?\/?/, '').split('/');
    if (first === 'pages') {
        return {
            kind: 'pages',
        };
    }
    if (first === 'media') {
        return second === undefined || second === ''
            ? {
                  kind: 'media',
              }
            : {
                  kind: 'media',
                  id: decodeURIComponent(second),
              };
    }
    if (first === 'collections' && second !== undefined && second !== '') {
        return {
            kind: 'collection',
            name: decodeURIComponent(second),
        };
    }
    if (first === 'edit' && second !== undefined && second !== '') {
        return {
            kind: 'document',
            ref: decodeURIComponent(second),
        };
    }
    if (first === 'views' && second !== undefined && second !== '') {
        if (third !== undefined && third !== '') {
            return {
                kind: 'record',
                view: decodeURIComponent(second),
                id: decodeURIComponent(third),
            };
        }
        return {
            kind: 'view',
            name: decodeURIComponent(second),
        };
    }
    return {
        kind: 'dashboard',
    };
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
