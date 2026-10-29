import { describe, expect, it } from 'vitest';
import type { DescribedField, DescribedLayout } from '../view/schema.js';
import { compareEntriesOf } from './compare.js';

const field = (path: string, extra: Partial<DescribedField> = {}): DescribedField => ({
    path,
    name: path.split('.').at(-1)!,
    readOnly: false,
    required: false,
    writable: true,
    schema: {},
    ...extra,
});

const layout: DescribedLayout[] = [
    {
        id: 'tab-hero',
        type: 'tab',
        label: 'Hero',
    },
];

const noLabels = (): undefined => undefined;

describe('comparing a version with the draft', () => {
    it('lists every field in the order the form shows them, the unchanged ones marked', () => {
        const fields = [field('title'), field('intro')];
        const entries = compareEntriesOf(
            fields,
            [],
            {
                title: 'Inside the lamp workshop',
                intro: 'Four people turn brass and oak into lamps.',
            },
            {
                title: 'Inside the workshop',
                intro: 'Four people turn brass and oak into lamps.',
            },
            noLabels
        );
        expect(entries.map((entry) => [entry.key, entry.note])).toEqual([
            ['title', undefined],
            ['intro', 'Unchanged'],
        ]);
        const title = entries[0]!;
        if (!('view' in title) || title.view.kind !== 'words') throw new Error('Expected a word diff.');
        expect(title.view.pieces.filter((piece) => piece.kind === 'removed').map((piece) => piece.text.trim())).toEqual(['lamp']);
    });

    it('compares the fields inside a block one by one, named under their tab', () => {
        const fields = [
            field('hero', {
                layout: ['tab-hero'],
            }),
            field('hero.heading', {
                parent: 'hero',
            }),
        ];
        const entries = compareEntriesOf(
            fields,
            layout,
            {
                hero: {
                    heading: 'Spring sale',
                },
            },
            {
                hero: {
                    heading: 'Summer sale',
                },
            },
            noLabels
        );
        expect(entries.map((entry) => [entry.key, entry.label])).toEqual([['hero.heading', 'Heading']]);
    });

    it('takes a missing value as the same as an empty one', () => {
        const entries = compareEntriesOf(
            [field('tags')],
            [],
            {
                tags: null,
            },
            {},
            noLabels
        );
        expect(entries[0]?.note).toBe('Unchanged');
    });
});
