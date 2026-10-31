import { describe, expect, it } from 'vitest';
import {
    heightIn,
    levelsAt,
    linesWithout,
    parentAt,
    placeAfterMove,
    placeAmongSiblings,
    placeAtSlot,
    placeOnto,
    selectionMoves,
    type TreeSpot,
} from './list-order.js';

const menu: TreeSpot[] = [
    {
        id: 'butikker',
        parent: null,
        depth: 0,
    },
    {
        id: 'oslo',
        parent: 'butikker',
        depth: 1,
    },
    {
        id: 'bergen',
        parent: 'butikker',
        depth: 1,
    },
    {
        id: 'omOss',
        parent: null,
        depth: 0,
    },
    {
        id: 'jobb',
        parent: 'omOss',
        depth: 1,
    },
    {
        id: 'kontakt',
        parent: 'omOss',
        depth: 1,
    },
    {
        id: 'personvern',
        parent: null,
        depth: 0,
    },
];

describe('a drag in a list in an order', () => {
    it('lands before the row it passed going up, and after it going down', () => {
        const ids = ['ingrid', 'eleanor', 'martin', 'priya'];
        expect(placeAfterMove(ids, 3, 1)).toEqual({
            before: 'eleanor',
        });
        expect(placeAfterMove(ids, 0, 2)).toEqual({
            after: 'martin',
        });
        expect(placeAfterMove(ids, 2, 2)).toBeUndefined();
    });
});

describe('a drag in a tree', () => {
    const left = linesWithout(menu, 'personvern');

    it('lifts the dragged row out with everything under it', () => {
        expect(linesWithout(menu, 'omOss').map((line) => line.id)).toEqual(['butikker', 'oslo', 'bergen', 'personvern']);
        expect(heightIn(menu, 'omOss')).toBe(2);
        expect(heightIn(menu, 'oslo')).toBe(1);
    });

    it('offers the levels from the row below to one under the row above, within the depth', () => {
        expect(levelsAt(left, 5)).toEqual({
            min: 1,
            max: 2,
        });
        expect(levelsAt(left, 5, 1, 2)).toEqual({
            min: 1,
            max: 1,
        });
        expect(levelsAt(left, 0)).toEqual({
            min: 0,
            max: 0,
        });
        expect(levelsAt(linesWithout(menu, 'omOss'), 2, 2, 2)).toBeUndefined();
    });

    it('puts a row between Jobb hos oss and Kontakt under Om oss, after Jobb hos oss', () => {
        expect(parentAt(left, 5, 1)).toBe('omOss');
        expect(placeAtSlot(left, 5, 1, true)).toEqual({
            after: 'jobb',
        });
        expect(placeAmongSiblings(left, 5, 1)).toEqual({
            position: 2,
            count: 3,
        });
    });

    it('puts a row held further right first under the row above, or at the level it is held', () => {
        expect(placeAtSlot(left, 4, 1, true)).toEqual({
            parent: 'omOss',
            at: 'first',
        });
        expect(placeAtSlot(left, 6, 0, true)).toEqual({
            after: 'omOss',
        });
        expect(placeAtSlot(left, 0, 0, true)).toEqual({
            parent: null,
            at: 'first',
        });
    });

    it('changes only the parent in a tree without an order', () => {
        expect(placeAtSlot(left, 5, 1, false)).toEqual({
            parent: 'omOss',
        });
        expect(placeOnto('butikker', false)).toEqual({
            parent: 'butikker',
        });
        expect(placeOnto('butikker', true)).toEqual({
            parent: 'butikker',
            at: 'last',
        });
    });
});

describe('Move on the ticked rows', () => {
    const team = ['ingrid', 'eleanor', 'martin', 'priya'].map((id) => ({
        id,
    }));

    it('moves the ticked rows to the top or the bottom, keeping their order', () => {
        expect(selectionMoves(team, new Set(['martin', 'priya']), 'top')).toEqual([
            {
                id: 'priya',
                body: {
                    at: 'first',
                },
            },
            {
                id: 'martin',
                body: {
                    at: 'first',
                },
            },
        ]);
        expect(selectionMoves(team, new Set(['ingrid']), 'bottom')).toEqual([
            {
                id: 'ingrid',
                body: {
                    at: 'last',
                },
            },
        ]);
    });

    it('moves ticked rows up or down together, past the nearest row not ticked', () => {
        expect(selectionMoves(team, new Set(['martin', 'priya']), 'up')).toEqual([
            {
                id: 'martin',
                body: {
                    before: 'eleanor',
                },
            },
            {
                id: 'priya',
                body: {
                    before: 'eleanor',
                },
            },
        ]);
        expect(selectionMoves(team, new Set(['ingrid']), 'up')).toEqual([]);
        expect(selectionMoves(team, new Set(['eleanor']), 'down')).toEqual([
            {
                id: 'eleanor',
                body: {
                    after: 'martin',
                },
            },
        ]);
    });

    it('moves a row in a tree past its sibling, never into another parent', () => {
        expect(selectionMoves(menu, new Set(['personvern']), 'up')).toEqual([
            {
                id: 'personvern',
                body: {
                    before: 'omOss',
                },
            },
        ]);
        expect(selectionMoves(menu, new Set(['bergen']), 'down')).toEqual([]);
    });
});
