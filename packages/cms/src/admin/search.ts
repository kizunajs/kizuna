import type { Connection } from '../view/connection.js';
import { humanize } from '../view/schema.js';
import type { CollectionSummary, NavigationSection, Screen } from './navigation.js';

/**
 * One thing ⌘K can open: a screen in the sidebar, or a page or item by its
 * title.
 */
export interface SearchResult {
    label: string;
    /**
     * Shown beside the label, like the sidebar heading or the collection.
     */
    detail: string;
    screen: Screen;
}

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
        screen: {
            kind: 'dashboard',
        },
    },
    ...sections.flatMap((section) =>
        section.entries.map((entry) => ({
            label: entry.label,
            detail: section.label,
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
                      detail: collections[index]!.label,
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
