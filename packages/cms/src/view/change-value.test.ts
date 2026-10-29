import { describe, expect, it } from 'vitest';
import { changeView, listDiff, referencesOf, showValue, textOf, wordDiff, type ReferenceLabel, type ValueShape } from './change-value.js';

const unknownShape: ValueShape = {
    schema: {},
    root: {},
};

const noLabels: ReferenceLabel = () => undefined;

const products: ReferenceLabel = (brand, id) =>
    brand === 'products'
        ? {
              prod_wildflower_seeds: 'Wildflower seeds',
              prod_garden_gloves: 'Garden gloves',
          }[id]
        : undefined;

const heroSize: ValueShape = {
    schema: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
    },
    root: {},
    options: {
        high: 'Large',
        medium: 'Medium',
        low: 'Small',
    },
};

const sections: ValueShape = {
    schema: {
        type: 'array',
        items: {
            type: 'string',
            enum: ['statement', 'categories', 'products', 'articles', 'callToAction'],
        },
    },
    root: {},
    options: {
        statement: 'Statement',
        categories: 'Categories',
        products: 'Products',
        articles: 'Journal',
        callToAction: 'Call to action',
    },
};

const productList: ValueShape = {
    schema: {
        type: 'array',
        items: {
            type: 'string',
            brand: 'products',
        },
    },
    root: {},
    brand: 'products',
};

const imageShape: ValueShape = {
    schema: {
        $ref: '#/$defs/CMS.Image',
        $defs: {
            'CMS.Image': {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                    },
                    alt: {
                        type: 'string',
                    },
                },
            },
        },
    },
    root: {
        $defs: {
            'CMS.Image': {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                    },
                    alt: {
                        type: 'string',
                    },
                },
            },
        },
    },
};

describe('showValue', () => {
    it('shows a choice by its label', () => {
        expect(showValue('medium', heroSize, noLabels)).toEqual({
            kind: 'text',
            text: 'Medium',
            prose: false,
        });
    });

    it('writes out a choice that has no label', () => {
        expect(
            textOf(
                showValue(
                    'callToAction',
                    {
                        schema: {
                            type: 'string',
                            enum: ['callToAction'],
                        },
                        root: {},
                    },
                    noLabels
                )
            )
        ).toBe('Call to action');
    });

    it('shows a list of choices by their labels', () => {
        expect(textOf(showValue(['statement', 'categories', 'products'], sections, noLabels))).toBe('Statement, Categories, Products');
    });

    it('shows an id by the label of the item it names', () => {
        expect(textOf(showValue(['prod_wildflower_seeds'], productList, products))).toBe('Wildflower seeds');
    });

    it('shows an id plainly when its label is not known', () => {
        expect(textOf(showValue(['prod_unknown'], productList, products))).toBe('prod_unknown');
    });

    it('shows a switch as On or Off', () => {
        expect(textOf(showValue(true, unknownShape, noLabels))).toBe('On');
        expect(textOf(showValue(false, unknownShape, noLabels))).toBe('Off');
    });

    it('shows an image with its alt text', () => {
        expect(
            showValue(
                {
                    id: 'media_1',
                    alt: 'Seed packets on a table',
                },
                imageShape,
                noLabels
            )
        ).toEqual({
            kind: 'image',
            id: 'media_1',
            alt: 'Seed packets on a table',
        });
    });

    it('shows rich text as its words', () => {
        expect(
            showValue(
                [
                    {
                        _type: 'block',
                        children: [
                            {
                                _type: 'span',
                                text: 'Grown ',
                            },
                            {
                                _type: 'span',
                                text: 'by hand.',
                            },
                        ],
                    },
                ],
                {
                    schema: {
                        'x-kizuna': 'rich-text',
                    },
                    root: {},
                },
                noLabels
            )
        ).toEqual({
            kind: 'text',
            text: 'Grown by hand.',
            prose: true,
        });
    });

    it('shows an object as its labelled properties', () => {
        expect(
            textOf(
                showValue(
                    {
                        label: 'Shop',
                        href: '/shop',
                    },
                    unknownShape,
                    noLabels
                )
            )
        ).toBe('Label: Shop, Href: /shop');
    });
});

describe('referencesOf', () => {
    it('finds the ids a list of references holds', () => {
        expect(referencesOf(['prod_wildflower_seeds', 'prod_garden_gloves'], productList)).toEqual([
            {
                brand: 'products',
                id: 'prod_wildflower_seeds',
            },
            {
                brand: 'products',
                id: 'prod_garden_gloves',
            },
        ]);
    });

    it('finds none in plain text', () => {
        expect(referencesOf('Wildflower seeds', unknownShape)).toEqual([]);
    });
});

describe('listDiff', () => {
    it('matches block items whose keys come back in another order', () => {
        expect(
            listDiff(
                [
                    {
                        block: 'statement',
                        text: 'Plants for every room',
                    },
                ],
                [
                    {
                        text: 'Plants for every room',
                        block: 'statement',
                    },
                ]
            )
        ).toEqual({
            added: [false],
            removed: [],
            reordered: false,
        });
    });

    it('says the kept items moved', () => {
        expect(listDiff(['statement', 'categories', 'products'], ['products', 'statement', 'categories'])).toEqual({
            added: [false, false, false],
            removed: [],
            reordered: true,
        });
    });

    it('marks what was added and removed without calling it a move', () => {
        expect(listDiff(['statement', 'categories'], ['statement', 'products'])).toEqual({
            added: [false, true],
            removed: [1],
            reordered: false,
        });
    });
});

describe('changeView', () => {
    it('keeps a choice before and after apart', () => {
        expect(changeView('high', 'medium', heroSize, noLabels)).toEqual({
            kind: 'replace',
            before: {
                kind: 'text',
                text: 'Large',
                prose: false,
            },
            after: {
                kind: 'text',
                text: 'Medium',
                prose: false,
            },
        });
    });

    it('shows a reordered list as its new order', () => {
        const view = changeView(['statement', 'categories', 'articles'], ['articles', 'statement', 'categories'], sections, noLabels);
        expect(view.kind).toBe('list');
        if (view.kind !== 'list') return;
        expect(view.summary).toBe('Order changed');
        expect(view.items.map((item) => textOf(item.value))).toEqual(['Journal', 'Statement', 'Categories']);
        expect(view.removed).toEqual([]);
    });

    it('lists what a list gained and lost', () => {
        const view = changeView(['statement', 'categories'], ['statement', 'products'], sections, noLabels);
        if (view.kind !== 'list') throw new Error('Expected a list change.');
        expect(view.summary).toBe('1 added, 1 removed');
        expect(view.items.map((item) => item.added)).toEqual([false, true]);
        expect(view.removed.map(textOf)).toEqual(['Categories']);
    });

    it('keeps the old list in its order with what it lost marked', () => {
        const view = changeView(['statement', 'categories', 'articles'], ['statement', 'products'], sections, noLabels);
        if (view.kind !== 'list') throw new Error('Expected a list change.');
        expect(
            view.before.map((item) => ({
                text: textOf(item.value),
                removed: item.removed,
            }))
        ).toEqual([
            {
                text: 'Statement',
                removed: false,
            },
            {
                text: 'Categories',
                removed: true,
            },
            {
                text: 'Journal',
                removed: true,
            },
        ]);
    });

    it('lists a new list without marking each item added', () => {
        const view = changeView(undefined, ['prod_wildflower_seeds'], productList, products);
        if (view.kind !== 'list') throw new Error('Expected a list change.');
        expect(view.summary).toBeUndefined();
        expect(view.items).toEqual([
            {
                value: {
                    kind: 'text',
                    text: 'Wildflower seeds',
                    prose: false,
                },
                added: false,
            },
        ]);
    });

    it('diffs free text word by word when the two share words', () => {
        expect(changeView('Seeds for the spring garden', 'Seeds for the summer garden', unknownShape, noLabels)).toEqual({
            kind: 'words',
            pieces: wordDiff('Seeds for the spring garden', 'Seeds for the summer garden'),
        });
    });

    it('shows text with nothing in common as before and after', () => {
        expect(changeView('Spring', 'Summer', unknownShape, noLabels).kind).toBe('replace');
    });

    it('names the properties that changed in an object', () => {
        const view = changeView(
            {
                label: 'Shop',
                href: '/shop',
            },
            {
                label: 'Shop',
                href: '/products',
            },
            unknownShape,
            noLabels
        );
        if (view.kind !== 'fields') throw new Error('Expected a fields change.');
        expect(view.entries.map((entry) => entry.label)).toEqual(['Href']);
    });

    it('says what changed about the same image', () => {
        expect(
            changeView(
                {
                    id: 'media_1',
                    alt: '',
                },
                {
                    id: 'media_1',
                    alt: 'Seed packets on a table',
                },
                imageShape,
                noLabels
            )
        ).toEqual({
            kind: 'image',
            image: {
                id: 'media_1',
                alt: 'Seed packets on a table',
            },
            facts: ['Alt text: Seed packets on a table'],
        });
    });
});
