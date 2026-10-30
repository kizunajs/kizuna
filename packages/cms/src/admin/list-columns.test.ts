import { describe, expect, it } from 'vitest';
import {
    choiceLabelsOf,
    DOCUMENT_COLUMNS,
    NEWEST_FIRST,
    collectionColumnsOf,
    columnText,
    dateOf,
    dateTimeOf,
    fieldValuesOf,
    nextSort,
    orderOf,
    pageOf,
    sortOfParam,
    sortParamOf,
    pagesAround,
    shownColumnsOf,
    sortRows,
    type ListRow,
} from './list-columns.js';

const row = (title: string, status: string, updatedAt: string, updatedBy = 'ingrid'): ListRow => ({
    ref: `item:articles:${title}`,
    href: '#',
    title,
    status,
    updatedAt,
    updatedBy,
});

const rows = [
    row('Repotting without the mess', 'draft', '2026-10-27T17:20:00.000Z', 'felix'),
    row('Watering a Monstera', 'published', '2026-10-28T09:42:00.000Z'),
    row('Choosing a pot that drains', 'changed', '2026-10-21T16:05:00.000Z', 'jonas'),
];

const titles = (sorted: readonly ListRow[]) => sorted.map((candidate) => candidate.title);

describe('the columns of a list', () => {
    it('sorts newest first, by title, by status and by who saved it', () => {
        expect(titles(sortRows(rows, NEWEST_FIRST, DOCUMENT_COLUMNS))).toEqual([
            'Watering a Monstera',
            'Repotting without the mess',
            'Choosing a pot that drains',
        ]);
        expect(
            titles(
                sortRows(
                    rows,
                    {
                        column: 'title',
                        direction: 'ascending',
                    },
                    DOCUMENT_COLUMNS
                )
            )
        ).toEqual(['Choosing a pot that drains', 'Repotting without the mess', 'Watering a Monstera']);
        expect(
            titles(
                sortRows(
                    rows,
                    {
                        column: 'status',
                        direction: 'ascending',
                    },
                    DOCUMENT_COLUMNS
                )
            )
        ).toEqual(['Watering a Monstera', 'Choosing a pot that drains', 'Repotting without the mess']);
        const names: Record<string, string> = {
            ingrid: 'Ingrid Haugen',
            felix: 'Felix Lund',
            jonas: 'Jonas Berg',
        };
        expect(
            titles(
                sortRows(
                    rows,
                    {
                        column: 'updatedBy',
                        direction: 'ascending',
                    },
                    DOCUMENT_COLUMNS,
                    (id) => names[id] ?? id
                )
            )
        ).toEqual(['Repotting without the mess', 'Watering a Monstera', 'Choosing a pot that drains']);
        expect(titles(sortRows(rows, undefined, DOCUMENT_COLUMNS))).toEqual(titles(rows));
    });

    it('turns a sorted column round, and starts a date newest first', () => {
        const title = DOCUMENT_COLUMNS.find((column) => column.key === 'title')!;
        const updated = DOCUMENT_COLUMNS.find((column) => column.key === 'updated')!;
        expect(nextSort(undefined, title)).toEqual({
            column: 'title',
            direction: 'ascending',
        });
        expect(nextSort(NEWEST_FIRST, updated)).toEqual({
            column: 'updated',
            direction: 'ascending',
        });
        expect(nextSort(undefined, updated).direction).toBe('descending');
    });

    it('shows the defaults until the editor chooses, and the title always', () => {
        expect(shownColumnsOf(DOCUMENT_COLUMNS, undefined).map((column) => column.key)).toEqual(['title', 'status', 'updated']);
        expect(shownColumnsOf(DOCUMENT_COLUMNS, ['updatedBy']).map((column) => column.key)).toEqual(['title', 'updatedBy']);
    });

    it('shows a page of the rows, and where it sits', () => {
        const numbers = Array.from(
            {
                length: 23,
            },
            (_, index) => index
        );
        expect(pageOf(numbers, 1, 12)).toEqual({
            rows: numbers.slice(12),
            page: 1,
            pageCount: 2,
            first: 13,
            last: 23,
        });
        expect(pageOf(numbers, 5, 12).page).toBe(1);
        expect(pageOf([], 0, 12)).toMatchObject({
            first: 0,
            last: 0,
            pageCount: 1,
        });
        expect(pagesAround(0, 129)).toEqual([0, 1, null, 128]);
    });

    it('says when a row changed with the day, the year and the time', () => {
        expect(dateTimeOf(new Date(2026, 9, 28, 9, 42).toISOString())).toBe('28 Oct 2026, 09:42');
        expect(dateTimeOf(null)).toBe('');
    });

    it('shows a date as its day and a date and time as the list shows Updated', () => {
        const signedUpAt = new Date(2026, 9, 28, 9, 42).toISOString();
        expect(dateOf('2026-10-28')).toBe('28 Oct 2026');
        expect(columnText('2026-10-28', 'date')).toBe('28 Oct 2026');
        expect(columnText(signedUpAt, 'date-time')).toBe('28 Oct 2026, 09:42');
        expect(columnText(['2026-10-28', '2026-11-02'], 'date')).toBe('28 Oct 2026, 2 Nov 2026');
        expect(columnText('soon', 'date')).toBe('soon');
        expect(columnText(null, 'date-time')).toBe('');
        expect(columnText(signedUpAt, undefined)).toBe(signedUpAt);
        expect(columnText(true, undefined)).toBe('Yes');
    });

    it('offers the fields of a collection as columns, sorting by its indexes alone', () => {
        const columns = collectionColumnsOf({
            filters: [],
            columns: [
                {
                    field: 'author',
                    label: 'Written by',
                    sortable: false,
                    shown: true,
                },
                {
                    field: 'publishedOn',
                    label: null,
                    sortable: true,
                    shown: false,
                },
            ],
        });
        expect(columns.slice(DOCUMENT_COLUMNS.length)).toEqual([
            {
                key: 'field:author',
                label: 'Written by',
                kind: 'text',
                shown: true,
                sortable: false,
            },
            {
                key: 'field:publishedOn',
                label: 'Published on',
                kind: 'text',
                shown: false,
                sortable: true,
            },
        ]);
        expect(columns.find((column) => column.key === 'updatedBy')?.sortable).toBe(false);
    });

    it('asks the server for the sort a column names', () => {
        expect(orderOf(NEWEST_FIRST)).toEqual({
            orderBy: 'updatedAt',
            direction: 'desc',
        });
        expect(
            orderOf({
                column: 'field:publishedOn',
                direction: 'ascending',
            })
        ).toEqual({
            orderBy: 'publishedOn',
            direction: 'asc',
        });
        expect(orderOf(undefined)).toEqual({});
    });

    it('writes a sort into the address, and reads it back', () => {
        expect(sortParamOf(NEWEST_FIRST)).toBe('-updatedAt');
        expect(sortParamOf(undefined)).toBeUndefined();
        const sorts = [
            NEWEST_FIRST,
            {
                column: 'title',
                direction: 'ascending',
            },
            {
                column: 'field:publishedOn',
                direction: 'descending',
            },
        ] satisfies Parameters<typeof sortParamOf>[0][];
        for (const sort of sorts) expect(sortOfParam(sortParamOf(sort)!)).toEqual(sort);
    });

    it('shows a field by the label the server gives it', () => {
        expect(
            fieldValuesOf(
                {
                    topic: 'care',
                    order: 2,
                },
                {
                    topic: 'Plant care',
                }
            )
        ).toEqual({
            'field:topic': 'Plant care',
            'field:order': 2,
        });
    });

    it('names the values of a column that names them, and leaves out the rest', () => {
        expect(
            choiceLabelsOf(
                {
                    showsOn: ['norway', 'uk'],
                },
                [
                    {
                        field: 'showsOn',
                        label: 'Shows on',
                        sortable: false,
                        shown: true,
                        choices: [
                            {
                                value: 'uk',
                                label: 'Hagen UK',
                            },
                        ],
                    },
                ]
            )
        ).toEqual({
            showsOn: 'Hagen UK',
        });
    });
});
