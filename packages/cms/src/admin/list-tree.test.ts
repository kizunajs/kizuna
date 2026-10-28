import { describe, expect, it } from 'vitest';
import { parentAfterDrop, parentChange, treeLinesOf, type TreePlace } from './list-tree.js';

const tag = (id: string, label: string, parent: string | null = null): { tree: TreePlace } => ({
    tree: {
        id,
        parent,
        label,
    },
});

const tags = [
    tag('lighting', 'Lighting'),
    tag('deskLamps', 'Desk lamps', 'lighting'),
    tag('materials', 'Materials'),
    tag('brass', 'Brass', 'materials'),
    tag('brushedBrass', 'Brushed brass', 'brass'),
    tag('oak', 'Oak', 'materials'),
    tag('news', 'News'),
];

const outline = (lines: ReturnType<typeof treeLinesOf<{ tree: TreePlace }>>): string[] =>
    lines.map((line) => `${'  '.repeat(line.depth)}${line.row.tree.label}${line.hasChildren ? (line.expanded ? ' -' : ' +') : ''}`);

describe('the tree a list shows', () => {
    it('puts each item under its parent, in the order the items arrive', () => {
        expect(outline(treeLinesOf(tags, new Set()))).toEqual([
            'Lighting -',
            '  Desk lamps',
            'Materials -',
            '  Brass -',
            '    Brushed brass',
            '  Oak',
            'News',
        ]);
    });

    it('leaves out what sits under a collapsed item, at any depth', () => {
        expect(outline(treeLinesOf(tags, new Set(['materials'])))).toEqual(['Lighting -', '  Desk lamps', 'Materials +', 'News']);
        expect(outline(treeLinesOf(tags, new Set(['brass'])))).toEqual([
            'Lighting -',
            '  Desk lamps',
            'Materials -',
            '  Brass +',
            '  Oak',
            'News',
        ]);
    });

    it('shows an item whose parent is missing, or that sits under itself, at the top', () => {
        expect(outline(treeLinesOf([tag('workshop', 'Workshop', 'gone'), tag('brass', 'Brass', 'brass')], new Set()))).toEqual([
            'Workshop',
            'Brass',
        ]);
    });

    it('shows every item of a loop once', () => {
        expect(outline(treeLinesOf([tag('brass', 'Brass', 'oak'), tag('oak', 'Oak', 'brass')], new Set()))).toEqual(['Brass -', '  Oak']);
    });
});

describe('dropping a row onto another', () => {
    const brass: TreePlace = {
        id: 'brass',
        parent: 'materials',
        label: 'Brass',
    };

    it('puts the item under the row it lands on, or at the top', () => {
        expect(
            parentAfterDrop(brass, {
                id: 'lighting',
                parent: null,
                label: 'Lighting',
            })
        ).toBe('lighting');
        expect(parentAfterDrop(brass, null)).toBeNull();
    });

    it('changes nothing on the item itself or the parent it already has', () => {
        expect(parentAfterDrop(brass, brass)).toBeUndefined();
        expect(
            parentAfterDrop(brass, {
                id: 'materials',
                parent: null,
                label: 'Materials',
            })
        ).toBeUndefined();
        expect(
            parentAfterDrop(
                {
                    ...brass,
                    parent: null,
                },
                null
            )
        ).toBeUndefined();
    });

    it('saves the tree field, with null emptying it', () => {
        expect(parentChange('parent', 'lighting')).toEqual({
            parent: 'lighting',
        });
        expect(parentChange('parent', null)).toEqual({
            parent: null,
        });
    });
});
