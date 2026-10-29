import { describe, expect, it } from 'vitest';
import type { Connection, ToolAnswer } from '../view/connection.js';
import { navigationOf } from './navigation.js';
import {
    actionResultsOf,
    DOCUMENT_LIMIT,
    groupsOfResults,
    highlightOf,
    loadDocuments,
    placesOf,
    rankOf,
    resultKeyOf,
    searchOf,
    type SearchResult,
} from './search.js';

const sections = navigationOf({
    globals: [
        {
            name: 'site',
            label: 'Site',
            group: null,
            status: 'published',
            updatedAt: null,
        },
    ],
    collections: [
        {
            name: 'articles',
            label: 'Articles',
            count: 2,
        },
        {
            name: 'employees',
            label: 'Employees',
            count: 1,
        },
    ],
    views: [
        {
            name: 'appUsers',
            label: 'App users',
            title: 'name',
            columns: [],
            search: [],
            readOnly: true,
        },
    ],
    groups: {
        employees: 'Team',
        appUsers: 'Team',
    },
});

const article = (label: string, id: string): SearchResult => ({
    label,
    detail: 'Draft',
    group: 'Articles',
    screen: {
        kind: 'document',
        ref: `item:articles:${id}`,
    },
});

describe('the admin search', () => {
    it('offers everything in the sidebar, the dashboard first, each under its heading', () => {
        expect(placesOf(sections).map((place) => [place.label, place.detail])).toEqual([
            ['Dashboard', ''],
            ['Pages', 'Content'],
            ['Media', 'Content'],
            ['Site', 'Content'],
            ['Articles', 'Content'],
            ['Employees', 'Team'],
            ['App users', 'Team'],
        ]);
    });

    it('ranks a title that starts with the search over one with a word that does, over one holding it', () => {
        expect(rankOf('Spring sale', 'spring')).toBe(0);
        expect(rankOf('The spring sale', 'spring')).toBe(1);
        expect(rankOf('Offspring', 'spring')).toBe(2);
        expect(rankOf('Summer sale', 'spring')).toBeUndefined();
        expect(rankOf('The spring sale', 'sale spring')).toBe(1);
        expect(rankOf('Anything', '  ')).toBeUndefined();
    });

    it('lists the sidebar with nothing typed, and documents once their titles match', () => {
        const documents = [article('Offspring', '1'), article('Spring sale', '2'), article('Summer sale', '3')];
        const empty = searchOf({
            query: '',
            places: placesOf(sections),
            documents,
        });
        expect(empty.places).toHaveLength(7);
        expect(empty.documents).toEqual([]);

        const found = searchOf({
            query: 'spring',
            places: placesOf(sections),
            documents,
        });
        expect(found.places).toEqual([]);
        expect(found.documents.map((document) => document.label)).toEqual(['Spring sale', 'Offspring']);

        const team = searchOf({
            query: 'app',
            places: placesOf(sections),
            documents,
        });
        expect(team.places.map((place) => place.label)).toEqual(['App users']);
    });

    it('lists no more documents than its limit', () => {
        const many = Array.from(
            {
                length: DOCUMENT_LIMIT + 5,
            },
            (_, index) => article(`Article ${index}`, String(index))
        );
        expect(
            searchOf({
                query: 'article',
                places: [],
                documents: many,
            }).documents
        ).toHaveLength(DOCUMENT_LIMIT);
    });

    it('reads pages and every collection through the routes the lists load from, leaving out a list that fails', async () => {
        const calls: Array<{ name: string; input: Record<string, unknown> | undefined }> = [];
        const connection: Connection = {
            call: async <Body = unknown>(name: string, input?: Record<string, unknown>): Promise<ToolAnswer<Body>> => {
                calls.push({
                    name,
                    input,
                });
                if (name === 'editing_pages_list') {
                    return {
                        status: 200,
                        body: {
                            pages: [
                                {
                                    ref: 'page:frontPage',
                                    name: 'frontPage',
                                    label: null,
                                    path: '/',
                                },
                                {
                                    ref: 'global:site',
                                    name: 'site',
                                    path: '',
                                },
                            ],
                        },
                    } as ToolAnswer<Body>;
                }
                const params = input?.['params'] as { name: string };
                if (params.name === 'employees') {
                    return {
                        status: 403,
                        body: {
                            detail: 'Forbidden',
                        },
                    } as ToolAnswer<Body>;
                }
                return {
                    status: 200,
                    body: {
                        items: [
                            {
                                ref: 'item:articles:1',
                                label: 'Spring sale',
                                status: 'draft',
                            },
                        ],
                    },
                } as ToolAnswer<Body>;
            },
        };
        const documents = await loadDocuments(connection, [
            {
                name: 'articles',
                label: 'Articles',
                count: 1,
            },
            {
                name: 'employees',
                label: 'Employees',
                count: 1,
            },
        ]);
        expect(calls.map((call) => call.name)).toEqual([
            'editing_pages_list',
            'editing_collections_list_items',
            'editing_collections_list_items',
        ]);
        expect(documents).toEqual([
            {
                label: 'Front',
                detail: '/',
                group: 'Pages',
                screen: {
                    kind: 'document',
                    ref: 'page:frontPage',
                },
            },
            {
                label: 'Spring sale',
                detail: 'Draft',
                group: 'Articles',
                screen: {
                    kind: 'document',
                    ref: 'item:articles:1',
                },
            },
        ]);
    });

    it('offers every action with nothing typed, and those whose label matches once something is', () => {
        const actions = actionResultsOf([
            {
                label: 'Publish',
                run: () => undefined,
            },
            {
                label: 'Save draft',
                run: () => undefined,
            },
            {
                label: 'Send to subscribers',
                run: () => undefined,
            },
        ]);
        expect(
            searchOf({
                query: '',
                places: [],
                actions,
                documents: [],
            }).actions.map((action) => action.label)
        ).toEqual(['Publish', 'Save draft', 'Send to subscribers']);
        expect(
            searchOf({
                query: 'draft',
                places: [],
                actions,
                documents: [],
            }).actions.map((action) => action.label)
        ).toEqual(['Save draft']);
        expect(actions.map(resultKeyOf)).toEqual(['action:Publish', 'action:Save draft', 'action:Send to subscribers']);
    });

    it('lists the screens first, then the actions, then the documents under their collection', () => {
        const page: SearchResult = {
            label: 'Front page',
            detail: '/',
            group: 'Pages',
            screen: {
                kind: 'document',
                ref: 'page:frontPage',
            },
        };
        const groups = groupsOfResults({
            places: placesOf(sections).slice(0, 1),
            actions: actionResultsOf([
                {
                    label: 'Create new article',
                    run: () => undefined,
                },
            ]),
            documents: [page, article('Fresh herbs', '1'), article('First frost', '2')],
        });
        expect(groups.map((group) => [group.label, group.items.map((item) => item.label)])).toEqual([
            ['Go to', ['Dashboard']],
            ['Actions', ['Create new article']],
            ['Pages', ['Front page']],
            ['Articles', ['Fresh herbs', 'First frost']],
        ]);
    });

    it('marks every part of a label the search matched', () => {
        expect(highlightOf('Bring your plants in before the first frost', 'fr')).toEqual([
            {
                text: 'Bring your plants in before the first ',
                matched: false,
            },
            {
                text: 'fr',
                matched: true,
            },
            {
                text: 'ost',
                matched: false,
            },
        ]);
        expect(highlightOf('Front page', 'FR pa')).toEqual([
            {
                text: 'Fr',
                matched: true,
            },
            {
                text: 'ont ',
                matched: false,
            },
            {
                text: 'pa',
                matched: true,
            },
            {
                text: 'ge',
                matched: false,
            },
        ]);
    });
});
