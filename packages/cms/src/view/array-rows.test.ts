import { describe, expect, it } from 'vitest';
import { itemNounOf, movedIndex, remapOpen, rowLabelsOf, singularOf } from './array-rows.js';
import type { JsonSchema } from './schema.js';

const contact: JsonSchema = {
    type: 'object',
    properties: {
        role: {
            type: 'string',
            enum: ['sales', 'support'],
        },
        email: {
            type: 'string',
            format: 'email',
        },
        name: {
            type: 'string',
        },
        phone: {
            type: 'string',
        },
    },
};

describe('a list item row', () => {
    it('names one item after the list', () => {
        expect(singularOf('Links')).toBe('Link');
        expect(singularOf('Categories')).toBe('Category');
        expect(singularOf('Addresses')).toBe('Address');
        expect(singularOf('Press')).toBe('Press');
        expect(singularOf('Team')).toBe('Team');
    });

    it('takes its title from the first text and its tag from the first choice', () => {
        expect(
            rowLabelsOf(contact, contact, {
                role: 'sales',
                email: 'ingrid@example.com',
                name: 'Ingrid Solberg',
            })
        ).toEqual({
            title: 'Ingrid Solberg',
            tag: 'Sales',
        });
    });

    it('has no title while the text is empty', () => {
        expect(
            rowLabelsOf(contact, contact, {
                name: '  ',
            }).title
        ).toBeUndefined();
    });
});

describe('the open items', () => {
    it('follow an item moved down or up', () => {
        expect([0, 1, 2, 3].map((index) => movedIndex(index, 0, 2))).toEqual([2, 0, 1, 3]);
        expect([0, 1, 2, 3].map((index) => movedIndex(index, 3, 1))).toEqual([0, 2, 3, 1]);
    });

    it('drop an item that is gone', () => {
        expect([...remapOpen(new Set([0, 2]), (index) => (index === 0 ? undefined : index - 1))]).toEqual([1]);
    });
});

describe('itemNounOf', () => {
    it('names an item by the name its schema gives', () => {
        const root: JsonSchema = {
            $defs: {
                'CMS.Image': {
                    type: 'object',
                },
            },
        };
        expect(
            itemNounOf(
                {
                    $ref: '#/$defs/CMS.Image',
                },
                root,
                'Images'
            )
        ).toBe('image');
        expect(
            itemNounOf(
                {
                    type: 'object',
                    title: 'OpeningHours',
                },
                {},
                'Hours'
            )
        ).toBe('opening hours');
    });

    it('falls back to the label, then to "item"', () => {
        expect(itemNounOf(contact, contact, 'Links')).toBe('link');
        expect(itemNounOf(contact, contact, 'Menu')).toBe('menu item');
        expect(itemNounOf(contact, contact, undefined)).toBe('item');
    });
});
