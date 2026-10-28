import { describe, expect, it } from 'vitest';
import type { DescribedField } from '../view/schema.js';
import { fieldChanges, savedAtOf, shownValue } from './history.js';

const field = (path: string, extra: Partial<DescribedField> = {}): DescribedField => ({
    path,
    name: path.split('.').at(-1)!,
    readOnly: false,
    writable: true,
    schema: {},
    ...extra,
});

describe('comparing a version with the draft', () => {
    it('lists the fields that differ, in the order the form shows them', () => {
        const fields = [field('title'), field('intro'), field('category')];
        expect(
            fieldChanges(
                fields,
                {
                    title: 'Inside the lamp workshop',
                    intro: 'Four people turn brass and oak into lamps.',
                    category: 'news',
                },
                {
                    title: 'Inside the workshop',
                    intro: 'Four people turn brass and oak into lamps.',
                    category: 'news',
                }
            )
        ).toEqual([
            {
                path: 'title',
                label: 'Title',
                then: 'Inside the lamp workshop',
                now: 'Inside the workshop',
            },
        ]);
    });

    it('compares the fields inside a group, named under the group', () => {
        const fields = [
            field('hero'),
            field('hero.heading', {
                parent: 'hero',
            }),
            field('hero.subheading', {
                parent: 'hero',
            }),
        ];
        expect(
            fieldChanges(
                fields,
                {
                    hero: {
                        heading: 'Spring sale',
                        subheading: 'Lamps for every room',
                    },
                },
                {
                    hero: {
                        heading: 'Summer sale',
                        subheading: 'Lamps for every room',
                    },
                }
            )
        ).toEqual([
            {
                path: 'hero.heading',
                label: 'Hero, Heading',
                then: 'Spring sale',
                now: 'Summer sale',
            },
        ]);
    });

    it('takes a missing value as empty, and finds nothing to list when they match', () => {
        const fields = [field('title'), field('tags')];
        expect(
            fieldChanges(
                fields,
                {
                    title: 'Inside the lamp workshop',
                    tags: null,
                },
                {
                    title: 'Inside the lamp workshop',
                }
            )
        ).toEqual([]);
        expect(
            fieldChanges(fields, null, {
                title: 'Inside the lamp workshop',
            })
        ).toEqual([
            {
                path: 'title',
                label: 'Title',
                then: 'Empty',
                now: 'Inside the lamp workshop',
            },
        ]);
    });
});

describe('a value in a few words', () => {
    it('writes out text, choices, numbers and switches', () => {
        expect(shownValue('  Inside   the lamp workshop ')).toBe('Inside the lamp workshop');
        expect(
            shownValue('news', {
                news: 'News',
            })
        ).toBe('News');
        expect(shownValue(12)).toBe('12');
        expect(shownValue(true)).toBe('Yes');
        expect(shownValue(undefined)).toBe('Empty');
        expect(shownValue('')).toBe('Empty');
        expect(shownValue([])).toBe('Empty');
    });

    it('cuts long text', () => {
        const shown = shownValue('a'.repeat(200));
        expect(shown).toHaveLength(80);
        expect(shown.endsWith('…')).toBe(true);
    });

    it('reads rich text as its words', () => {
        expect(
            shownValue([
                {
                    _type: 'block',
                    _key: 'one',
                    children: [
                        {
                            _type: 'span',
                            _key: 'two',
                            text: 'Four people',
                            marks: [],
                        },
                    ],
                },
                {
                    _type: 'block',
                    _key: 'three',
                    children: [
                        {
                            _type: 'span',
                            _key: 'four',
                            text: 'by the harbour.',
                            marks: [],
                        },
                    ],
                },
            ])
        ).toBe('Four people by the harbour.');
    });

    it('lists ids, and counts anything larger', () => {
        expect(shownValue(['workshop', 'brass'])).toBe('workshop, brass');
        expect(
            shownValue([
                {
                    _type: 'hero',
                },
                {
                    _type: 'gallery',
                },
            ])
        ).toBe('2 items');
        expect(
            shownValue({
                id: 'media-1',
            })
        ).toBe('Set');
    });
});

describe('when a version was saved', () => {
    it('leaves out the year this year, and writes it for an earlier one', () => {
        const today = new Date('2026-10-28T12:00:00Z');
        expect(savedAtOf('2026-10-24T09:12:00Z', today)).not.toMatch(/2026/);
        expect(savedAtOf('2025-10-24T09:12:00Z', today)).toMatch(/2025/);
        expect(savedAtOf('not a date', today)).toBe('');
    });
});
