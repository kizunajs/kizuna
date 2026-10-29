import { describe, expect, it } from 'vitest';
import { applyLabelOf, chosenCountOf, toggledIds } from './reference-sheet.js';

const products = {
    one: 'product',
    many: 'products',
};

describe('toggledIds', () => {
    it('adds an id at the end, and takes out one already chosen', () => {
        expect(toggledIds(['prod_boston_fern'], 'prod_lady_fern', undefined)).toEqual(['prod_boston_fern', 'prod_lady_fern']);
        expect(toggledIds(['prod_boston_fern', 'prod_lady_fern'], 'prod_boston_fern', undefined)).toEqual(['prod_lady_fern']);
    });

    it('adds nothing past the most the list may hold', () => {
        expect(toggledIds(['prod_boston_fern', 'prod_lady_fern'], 'prod_snake_plant', 2)).toEqual(['prod_boston_fern', 'prod_lady_fern']);
        expect(toggledIds(['prod_boston_fern', 'prod_lady_fern'], 'prod_lady_fern', 2)).toEqual(['prod_boston_fern']);
    });
});

describe('the sheet foot', () => {
    it('counts against the maximum when the schema has one', () => {
        expect(chosenCountOf(3, 8)).toBe('3 of 8 chosen');
        expect(chosenCountOf(3, undefined)).toBe('3 chosen');
    });

    it('names the button after what it applies', () => {
        expect(applyLabelOf(1, products)).toBe('Use 1 product');
        expect(applyLabelOf(4, products)).toBe('Use 4 products');
        expect(applyLabelOf(0, products)).toBe('Use 0 products');
    });
});
