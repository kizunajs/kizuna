import { describe, expect, it } from 'vitest';
import { arrange, inSidebar, tabSets } from './arrange.js';
import type { DescribedField, DescribedLayout } from './schema.js';

const field = (path: string, extra: Partial<DescribedField> = {}): DescribedField => ({
    path,
    name: path,
    readOnly: false,
    required: false,
    writable: true,
    schema: {},
    ...extra,
});

const layout: DescribedLayout[] = [
    {
        id: '/0',
        type: 'tab',
        label: 'Content',
    },
    {
        id: '/0/1',
        type: 'row',
    },
    {
        id: '/1',
        type: 'tab',
        label: 'Card',
    },
    {
        id: '/2',
        type: 'collapsible',
        label: 'Publishing',
        position: 'sidebar',
    },
];

const fields = [
    field('title', {
        layout: ['/0'],
    }),
    field('image', {
        layout: ['/0', '/0/1'],
    }),
    field('summary', {
        layout: ['/0', '/0/1'],
    }),
    field('card', {
        layout: ['/1'],
    }),
    field('category', {
        layout: ['/2'],
    }),
    field('featured', {
        position: 'sidebar',
    }),
];

describe('arrange', () => {
    it('puts tabs listed one after another under one tab bar, with their rows inside', () => {
        const [tabs] = arrange(fields, layout);
        expect(tabs).toMatchObject({
            kind: 'tabs',
            id: '/0',
        });
        if (tabs?.kind !== 'tabs') throw new Error('expected tabs');
        expect(tabs.tabs.map((tab) => tab.item.label)).toEqual(['Content', 'Card']);
        expect(tabs.tabs[0]!.content.map((entry) => entry.kind)).toEqual(['field', 'row']);
        const row = tabs.tabs[0]!.content[1]!;
        if (row.kind !== 'row') throw new Error('expected a row');
        expect(row.content.map((entry) => (entry.kind === 'field' ? entry.field.path : undefined))).toEqual(['image', 'summary']);
    });

    it('tells the sidebar items from the main column', () => {
        const arranged = arrange(fields, layout);
        expect(arranged.map((entry) => [entry.kind, inSidebar(entry)])).toEqual([
            ['tabs', false],
            ['collapsible', true],
            ['field', true],
        ]);
    });

    it('lists fields with no layout as they are', () => {
        expect(arrange([field('heading'), field('body')], []).map((entry) => entry.kind)).toEqual(['field', 'field']);
    });

    it('finds the tabs each tab is one of', () => {
        expect(tabSets(arrange(fields, layout))).toEqual(
            new Map([
                ['/0', '/0'],
                ['/1', '/0'],
            ])
        );
    });
});
