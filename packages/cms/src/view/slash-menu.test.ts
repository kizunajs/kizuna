import { describe, expect, it } from 'vitest';
import { filterSlashItems, groupSlashItems, slashItemsOf, slashQueryOf, stepSlashIndex } from './slash-menu.js';
import { pastedUrlOf } from './paste-link.js';

const items = slashItemsOf([
    {
        name: 'article',
        label: 'Article',
    },
    {
        name: 'plants',
        label: 'Plants',
    },
]);

const labelsFor = (query: string): string[] => filterSlashItems(items, query).map((item) => item.label);

describe('the slash menu', () => {
    it('lists the text styles, lists, an image, a link to a page and each block by its label', () => {
        expect(groupSlashItems(items).map((group) => [group.group, group.items.map((entry) => entry.item.label)])).toEqual([
            ['Text', ['Paragraph', 'Heading', 'Subheading', 'Quote']],
            ['Lists', ['Bulleted list', 'Numbered list']],
            ['Insert', ['Image', 'Link to a page']],
            ['Blocks', ['Article', 'Plants']],
        ]);
    });

    it('lists no blocks for a field that holds none', () => {
        expect(slashItemsOf([]).some((item) => item.group === 'Blocks')).toBe(false);
    });

    it('filters by label, the closest first, and moves its heading to the top', () => {
        expect(labelsFor('pl')).toEqual(['Plants']);
        expect(labelsFor('list')).toEqual(['Bulleted list', 'Numbered list']);
        expect(labelsFor('h')).toEqual(['Heading', 'Subheading']);
        expect(groupSlashItems(filterSlashItems(items, 'a'))[0]!.group).toBe('Blocks');
    });

    it('matches keywords and ignores spaces, hyphens and case', () => {
        expect(labelsFor('h3')).toEqual(['Subheading']);
        expect(labelsFor('ol')).toEqual(['Numbered list']);
        expect(labelsFor('NUMBERED-LIST')).toEqual(['Numbered list']);
        expect(labelsFor('block')).toEqual(['Article', 'Plants']);
        expect(labelsFor('photo')).toEqual(['Image']);
    });

    it('keeps every item for an empty query, and none for one nothing matches', () => {
        expect(labelsFor('')).toHaveLength(items.length);
        expect(labelsFor('zzz')).toEqual([]);
    });

    it('numbers the items in the order the menu shows them, for the arrow keys', () => {
        const grouped = groupSlashItems(filterSlashItems(items, 'a'));
        expect(grouped.flatMap((group) => group.items.map((entry) => entry.index))).toEqual(
            grouped.flatMap((group) => group.items).map((_, index) => index)
        );
    });

    it('wraps the arrow keys at either end', () => {
        expect(stepSlashIndex(0, -1, 3)).toBe(2);
        expect(stepSlashIndex(2, 1, 3)).toBe(0);
        expect(stepSlashIndex(0, 1, 0)).toBe(0);
    });
});

describe('typing a slash', () => {
    it('opens at the start of an empty line', () => {
        expect(slashQueryOf('/', '')).toEqual({
            query: '',
            offset: 0,
        });
        expect(slashQueryOf('/head', '')).toEqual({
            query: 'head',
            offset: 0,
        });
    });

    it('opens after a space', () => {
        expect(slashQueryOf('Read more /art', ' below')).toEqual({
            query: 'art',
            offset: 10,
        });
    });

    it('stays shut inside a word, at the start of a line with text after it, or once a space follows', () => {
        expect(slashQueryOf('and/or', '')).toBeUndefined();
        expect(slashQueryOf('/', 'Spring sale')).toBeUndefined();
        expect(slashQueryOf('/head ', '')).toBeUndefined();
        expect(slashQueryOf('https://hagen.example.no', '')).toBeUndefined();
    });
});

describe('pasting a URL', () => {
    it('takes one http or https address', () => {
        expect(pastedUrlOf(' https://hagen.example.no/en/butikker\n')).toBe('https://hagen.example.no/en/butikker');
        expect(pastedUrlOf('http://hagen.example.co.uk/plant-care')).toBe('http://hagen.example.co.uk/plant-care');
    });

    it('leaves other text alone', () => {
        expect(pastedUrlOf('Visit https://hagen.example.no')).toBeUndefined();
        expect(pastedUrlOf('mailto:hello@hagen.example.no')).toBeUndefined();
        expect(pastedUrlOf('/plant-care')).toBeUndefined();
        expect(pastedUrlOf('https://')).toBeUndefined();
    });
});
