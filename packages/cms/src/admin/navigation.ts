import { humanize } from '../view/schema.js';

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
          kind: 'collection';
          name: string;
      }
    | {
          kind: 'document';
          ref: string;
      };

export const hrefOf = (screen: Screen): string => {
    if (screen.kind === 'pages') return '#/pages';
    if (screen.kind === 'collection') return `#/collections/${encodeURIComponent(screen.name)}`;
    if (screen.kind === 'document') return `#/edit/${encodeURIComponent(screen.ref)}`;
    return '#/';
};

export const screenOf = (hash: string): Screen => {
    const [first, second] = hash.replace(/^#?\/?/, '').split('/');
    if (first === 'pages') {
        return {
            kind: 'pages',
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
 * The heading pages sit under, with every global and collection that names
 * no `group`.
 */
export const CONTENT_GROUP = 'Content';

/**
 * The sidebar's headings: Content first, with the pages, then each `group`
 * in the order the globals and collections first name it.
 */
export const navigationOf = (options: {
    globals: readonly GlobalSummary[];
    collections: readonly CollectionSummary[];
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
    if (entry.kind === 'pages') return shown.kind === 'pages' || (shown.kind === 'document' && shown.ref.startsWith('page:'));
    return shown.kind === 'dashboard';
};
