import { describe, expect, it } from 'vitest';
import {
    DOCUMENT_COLUMNS,
    NEWEST_FIRST,
    dateTimeOf,
    nextSort,
    pageOf,
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
});
