import { describe, expect, it } from 'vitest';
import {
    NO_FILTERS,
    STATUS_FIELD,
    filterItems,
    groupsOf,
    isFiltering,
    itemQueriesOf,
    queryKeyOf,
    withCondition,
    type Condition,
} from './list-filters.js';

const articles = [
    {
        ref: 'item:articles:wateringMonstera',
        status: 'published',
    },
    {
        ref: 'item:articles:repotting',
        status: 'draft',
    },
    {
        ref: 'item:articles:northWindow',
        status: 'changed',
    },
];

const topicIs = (value: string, join: Condition['join'] = 'and'): Condition => ({
    join,
    field: 'topic',
    operator: 'is',
    value,
});

const statusIs = (value: string, join: Condition['join'] = 'and'): Condition => ({
    join,
    field: STATUS_FIELD,
    operator: 'is',
    value,
});

describe('the filters above a list', () => {
    it('asks for every item when nothing is filtered', () => {
        expect(itemQueriesOf(NO_FILTERS)).toEqual([{}]);
        expect(isFiltering(NO_FILTERS)).toBe(false);
    });

    it('asks once for each field, besides every item, and never for the status', () => {
        expect(
            itemQueriesOf([
                topicIs('care'),
                statusIs('draft'),
                topicIs('care', 'or'),
                {
                    join: 'and',
                    field: 'category',
                    operator: 'outside',
                    value: 'lighting',
                },
            ])
        ).toEqual([
            {},
            {
                field: 'topic',
                value: 'care',
            },
            {
                field: 'category',
                value: 'lighting',
                descendants: true,
            },
        ]);
    });

    it('leaves out a row with no value picked', () => {
        const filters: Condition[] = [
            {
                join: 'and',
                field: 'topic',
                operator: 'is',
                value: undefined,
            },
        ];
        expect(isFiltering(filters)).toBe(false);
        expect(itemQueriesOf(filters)).toEqual([{}]);
    });

    it('groups the rows joined by and, and starts a group at each or', () => {
        expect(groupsOf([statusIs('draft'), topicIs('care'), statusIs('published', 'or')]).map((group) => group.length)).toEqual([2, 1]);
    });

    it('keeps the items every condition of some group holds', () => {
        const held = new Map([
            [queryKeyOf(itemQueriesOf([topicIs('care')])[1]!), new Set(['item:articles:repotting', 'item:articles:northWindow'])],
        ]);
        const refs = (filters: readonly Condition[]) =>
            filterItems(articles, filters, (query) => held.get(queryKeyOf(query))).map((item) => item.ref);
        expect(refs([topicIs('care'), statusIs('draft')])).toEqual(['item:articles:repotting']);
        expect(refs([statusIs('published'), topicIs('care', 'or')])).toEqual([
            'item:articles:wateringMonstera',
            'item:articles:repotting',
            'item:articles:northWindow',
        ]);
        expect(
            refs([
                {
                    ...topicIs('care'),
                    operator: 'isNot',
                },
            ])
        ).toEqual(['item:articles:wateringMonstera']);
        expect(refs(NO_FILTERS)).toHaveLength(3);
    });

    it('changes one row, or removes it', () => {
        const filters = [statusIs('draft'), topicIs('care')];
        expect(withCondition(filters, 1, topicIs('season'))[1]?.value).toBe('season');
        expect(withCondition(filters, 0, undefined)).toEqual([topicIs('care')]);
    });
});
