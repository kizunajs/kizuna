import { describe, expect, it } from 'vitest';
import { NO_FILTERS, hasStatus, inEvery, isFiltering, itemQueriesOf, withField } from './list-filters.js';

describe('the filters above a list', () => {
    it('asks for every item when nothing is filtered', () => {
        expect(itemQueriesOf({})).toEqual([{}]);
        expect(isFiltering(NO_FILTERS)).toBe(false);
    });

    it('asks once for each field, with descendants only when picked', () => {
        const filters = withField(
            withField(NO_FILTERS, 'topic', {
                value: 'guides',
                descendants: false,
            }),
            'tags',
            {
                value: 'lighting',
                descendants: true,
            }
        );
        expect(isFiltering(filters)).toBe(true);
        expect(itemQueriesOf(filters.fields)).toEqual([
            {
                field: 'topic',
                value: 'guides',
            },
            {
                field: 'tags',
                value: 'lighting',
                descendants: true,
            },
        ]);
    });

    it('clears a field with undefined, and keeps the others', () => {
        const filters = withField(
            withField(NO_FILTERS, 'topic', {
                value: 'guides',
                descendants: false,
            }),
            'tags',
            {
                value: 'lighting',
                descendants: false,
            }
        );
        expect(Object.keys(withField(filters, 'topic', undefined).fields)).toEqual(['tags']);
    });

    it('keeps the items every answer holds, in the order of the first', () => {
        const article = (ref: string) => ({
            ref,
        });
        expect(
            inEvery([
                [article('item:articles:benchLamps'), article('item:articles:ceilingLights'), article('item:articles:polishingBrass')],
                [article('item:articles:polishingBrass'), article('item:articles:benchLamps')],
            ]).map((item) => item.ref)
        ).toEqual(['item:articles:benchLamps', 'item:articles:polishingBrass']);
        expect(inEvery([])).toEqual([]);
    });

    it('keeps the rows with the status picked, or every row', () => {
        expect(
            hasStatus(
                {
                    status: 'draft',
                },
                'published'
            )
        ).toBe(false);
        expect(
            hasStatus(
                {
                    status: 'draft',
                },
                undefined
            )
        ).toBe(true);
    });
});
