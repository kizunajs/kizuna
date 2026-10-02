import { describe, expect, it } from 'vitest';
import { inStoredOrder } from './in-order.js';

describe('inStoredOrder', () => {
    it('keeps the stored order and drops missing items', () => {
        const products = [
            {
                id: 'b',
            },
            {
                id: 'a',
            },
        ];
        expect(inStoredOrder(['a', 'missing', 'b'], products, (product) => product.id)).toEqual([
            {
                id: 'a',
            },
            {
                id: 'b',
            },
        ]);
    });
});
