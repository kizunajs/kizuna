import { describe, expect, it } from 'vitest';
import { shownSizeOf } from './preview-pane.js';

describe('shownSizeOf', () => {
    it('reads the stage itself on Desktop', () => {
        expect(
            shownSizeOf('desktop', {
                width: 1280,
                height: 800,
            })
        ).toBe('1280 × 800');
    });

    it('reads a device at its own width, with the height the scaled frame fits', () => {
        expect(
            shownSizeOf('tablet', {
                width: 384,
                height: 600,
            })
        ).toBe('768 × 1200');
        expect(
            shownSizeOf('mobile', {
                width: 800,
                height: 700,
            })
        ).toBe('390 × 700');
    });
});
