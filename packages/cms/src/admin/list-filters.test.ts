import { describe, expect, it } from 'vitest';
import { NO_FILTERS, STATUS_FIELD, filterEntriesOf, groupsOf, isFiltering, withCondition, type Condition } from './list-filters.js';

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
        expect(filterEntriesOf(NO_FILTERS)).toEqual([]);
        expect(isFiltering(NO_FILTERS)).toBe(false);
    });

    it('writes each condition for the list route, with or between the groups', () => {
        expect(
            filterEntriesOf([
                topicIs('care'),
                statusIs('draft'),
                topicIs('season', 'or'),
                {
                    join: 'and',
                    field: 'category',
                    operator: 'outside',
                    value: 'lighting',
                },
            ])
        ).toEqual(['topic:is:care', 'status:is:draft', 'or', 'topic:is:season', 'category:outside:lighting']);
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
        expect(filterEntriesOf(filters)).toEqual([]);
    });

    it('groups the rows joined by and, and starts a group at each or', () => {
        expect(groupsOf([statusIs('draft'), topicIs('care'), statusIs('published', 'or')]).map((group) => group.length)).toEqual([2, 1]);
    });

    it('changes one row, or removes it', () => {
        const filters = [statusIs('draft'), topicIs('care')];
        expect(withCondition(filters, 1, topicIs('season'))[1]?.value).toBe('season');
        expect(withCondition(filters, 0, undefined)).toEqual([topicIs('care')]);
    });
});
