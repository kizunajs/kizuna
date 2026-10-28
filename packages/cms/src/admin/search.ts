import type { Connection } from '../view/connection.js';
import { humanize } from '../view/schema.js';
import type { CollectionSummary, NavigationSection, Screen } from './navigation.js';
import { statusLabelOf } from './parts.js';

/**
 * One thing ⌘K can open: a screen in the sidebar, or a page or item by its
 * title.
 */
export interface SearchResult {
    label: string;
    /**
     * Shown beside the label: the sidebar heading of a screen, the path of a
     * page, or where an item stands.
     */
    detail: string;
    /**
     * The heading the palette lists it under: Go to for a screen, Pages for
     * a page, and the collection for an item.
     */
    group: string;
    screen: Screen;
}

/**
 * The heading the palette lists the sidebar's screens under.
 */
export const PLACES_GROUP = 'Go to';

export interface SearchResults {
    places: SearchResult[];
    documents: SearchResult[];
}

/**
 * How many documents ⌘K lists for one search.
 */
export const DOCUMENT_LIMIT = 20;

/**
 * Everything the sidebar lists, the dashboard first, each under its heading.
 */
export const placesOf = (sections: readonly NavigationSection[]): SearchResult[] => [
    {
        label: 'Dashboard',
        detail: '',
        group: PLACES_GROUP,
        screen: {
            kind: 'dashboard',
        },
    },
    ...sections.flatMap((section) =>
        section.entries.map((entry) => ({
            label: entry.label,
            detail: section.label,
            group: PLACES_GROUP,
            screen: entry.screen,
        }))
    ),
];

/**
 * How well a label answers a search: 0 when it starts with it, 1 when a word
 * does, 2 when it holds every word somewhere, and `undefined` when it misses.
 */
export const rankOf = (label: string, query: string): number | undefined => {
    const text = label.toLowerCase();
    const search = query.trim().toLowerCase();
    const words = search.split(/\s+/).filter((word) => word !== '');
    if (words.length === 0 || !words.every((word) => text.includes(word))) return undefined;
    if (text.startsWith(search)) return 0;
    if (text.split(/\s+/).some((word) => word.startsWith(words[0]!))) return 1;
    return 2;
};

const matching = (results: readonly SearchResult[], query: string): SearchResult[] =>
    results
        .map((result, index) => ({
            result,
            index,
            rank: rankOf(result.label, query),
        }))
        .filter((candidate): candidate is typeof candidate & { rank: number } => candidate.rank !== undefined)
        .sort((left, right) => left.rank - right.rank || left.index - right.index)
        .map((candidate) => candidate.result);

/**
 * What a search finds. With nothing typed it offers the sidebar, and
 * documents only once something matches their titles.
 */
export const searchOf = (options: {
    query: string;
    places: readonly SearchResult[];
    documents: readonly SearchResult[];
}): SearchResults => {
    if (options.query.trim() === '') {
        return {
            places: [...options.places],
            documents: [],
        };
    }
    return {
        places: matching(options.places, options.query),
        documents: matching(options.documents, options.query).slice(0, DOCUMENT_LIMIT),
    };
};

interface PageEntry {
    ref: string;
    name: string;
    label?: string | null;
    path: string;
}

interface ItemEntry {
    ref: string;
    label: string;
    status?: string;
}

/**
 * Every page and every item of the collections given, by title, through the
 * routes the lists load from. A list that does not load is left out.
 */
export const loadDocuments = async (connection: Connection, collections: readonly CollectionSummary[]): Promise<SearchResult[]> => {
    const [pages, ...items] = await Promise.all([
        connection.call<{ pages: PageEntry[] }>('editing_pages_list'),
        ...collections.map((collection) =>
            connection.call<{ items: ItemEntry[] }>('editing_collections_list_items', {
                params: {
                    name: collection.name,
                },
            })
        ),
    ]);
    const pageResults =
        pages.status === 200
            ? pages.body.pages
                  .filter((page) => page.ref.startsWith('page:'))
                  .map(
                      (page): SearchResult => ({
                          label: page.label ?? humanize(page.name.replace(/Page$/, '')),
                          detail: page.path,
                          group: 'Pages',
                          screen: {
                              kind: 'document',
                              ref: page.ref,
                          },
                      })
                  )
            : [];
    const itemResults = items.flatMap((answer, index) =>
        answer.status === 200
            ? answer.body.items.map(
                  (item): SearchResult => ({
                      label: item.label,
                      detail: item.status === undefined ? '' : statusLabelOf(item.status),
                      group: collections[index]!.label,
                      screen: {
                          kind: 'document',
                          ref: item.ref,
                      },
                  })
              )
            : []
    );
    return [...pageResults, ...itemResults];
};

export interface SearchGroup {
    label: string;
    items: SearchResult[];
}

/**
 * What a search found, under the palette's headings: the screens first, then
 * the documents under their group, the group of the best match first.
 */
export const groupsOfResults = (results: SearchResults): SearchGroup[] => {
    const groups = new Map<string, SearchResult[]>();
    for (const result of [...results.places, ...results.documents]) {
        groups.set(result.group, [...(groups.get(result.group) ?? []), result]);
    }
    return [...groups].map(([label, items]) => ({
        label,
        items,
    }));
};

/**
 * A label cut into the parts a search matched and the parts it did not, so
 * the palette can set the matches in bold.
 */
export const highlightOf = (label: string, query: string): Array<{ text: string; matched: boolean }> => {
    const text = label.toLowerCase();
    const matched = new Array<boolean>(label.length).fill(false);
    for (const word of query.trim().toLowerCase().split(/\s+/)) {
        if (word === '') continue;
        let from = text.indexOf(word);
        while (from !== -1) {
            matched.fill(true, from, from + word.length);
            from = text.indexOf(word, from + word.length);
        }
    }
    const parts: Array<{ text: string; matched: boolean }> = [];
    for (let index = 0; index < label.length; index++) {
        const last = parts.at(-1);
        if (last !== undefined && last.matched === matched[index]) last.text += label[index];
        else {
            parts.push({
                text: label[index]!,
                matched: matched[index]!,
            });
        }
    }
    return parts;
};
