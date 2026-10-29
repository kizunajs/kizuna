import { describe, expect, it } from 'vitest';
import type { DescribedField, DescribedLayout } from '../view/schema.js';
import { sectionLabelOf, sectionTitleOf, sectionsOf, sentenceOf } from './sections.js';

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
    {
        id: 'tab-seo',
        type: 'tab',
        label: 'SEO',
    },
];

const fields = [
    field('hero', {
        layout: ['tab-hero'],
    }),
    field('hero.heading', {
        parent: 'hero',
    }),
    field('seo', {
        layout: ['tab-seo'],
    }),
    field('seo.title', {
        parent: 'seo',
    }),
    field('seo.description', {
        parent: 'seo',
    }),
    field('slug', {
        layout: ['tab-seo'],
    }),
    field('owner'),
];

describe('sections', () => {
    it('finds the tab a field sits in through the field holding it', () => {
        expect(sectionTitleOf(fields, layout, 'hero.heading')).toBe('Hero');
        expect(sectionTitleOf(fields, layout, 'slug')).toBe('SEO');
        expect(sectionTitleOf(fields, layout, 'owner')).toBe('');
    });

    it('names a block field alone when the block is the only field on its tab', () => {
        expect(sectionLabelOf(fields, layout, 'hero.heading', 'Hero › Heading')).toBe('Heading');
    });

    it('names the block too when its tab holds more', () => {
        expect(sectionLabelOf(fields, layout, 'seo.title', 'Seo › Title')).toBe('Title');
        const shared = [
            ...fields,
            field('summary', {
                layout: ['tab-hero'],
            }),
        ];
        expect(sectionLabelOf(shared, layout, 'hero.heading', 'Hero › Heading')).toBe('Heading');
        const renamed = shared.map((candidate) =>
            candidate.path === 'hero'
                ? {
                      ...candidate,
                      label: 'Banner',
                  }
                : candidate
        );
        expect(sectionLabelOf(renamed, layout, 'hero.heading', 'Banner › Heading')).toBe('Banner, Heading');
    });

    it('keeps the label it was given for a field it does not know', () => {
        expect(sectionLabelOf(fields, layout, 'gone', 'Gone')).toBe('Gone');
    });

    it('groups entries in the order their sections first come', () => {
        expect(sectionsOf(['seo.title', 'hero.heading', 'seo.description'], (path) => sectionTitleOf(fields, layout, path))).toEqual([
            {
                title: 'SEO',
                entries: ['seo.title', 'seo.description'],
            },
            {
                title: 'Hero',
                entries: ['hero.heading'],
            },
        ]);
    });

    it('lists names in a sentence', () => {
        expect(sentenceOf(['Hero'])).toBe('Hero');
        expect(sentenceOf(['Hero', 'Products'])).toBe('Hero and Products');
        expect(sentenceOf(['Hero', 'Products', 'SEO'], 'or')).toBe('Hero, Products or SEO');
    });
});
