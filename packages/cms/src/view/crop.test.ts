import { describe, expect, it } from 'vitest';
import { defaultCrop, dragCrop, fitsRatio, ratioOf } from './crop.js';

describe('ratioOf', () => {
    it('reads a shape as width over height', () => {
        expect(ratioOf('16:9')).toBeCloseTo(16 / 9);
        expect(ratioOf('4:5')).toBe(0.8);
        expect(ratioOf('1.91:1')).toBe(1.91);
    });

    it('refuses what is not two positive numbers', () => {
        expect(ratioOf('16x9')).toBeUndefined();
        expect(ratioOf('0:9')).toBeUndefined();
        expect(ratioOf('wide')).toBeUndefined();
    });
});

describe('defaultCrop', () => {
    it('keeps the full height of a wide image cropped narrower, around the focal point', () => {
        expect(
            defaultCrop(
                1,
                {
                    x: 0.75,
                    y: 0.5,
                },
                1600,
                1000
            )
        ).toEqual({
            x: 0.375,
            y: 0,
            width: 0.625,
            height: 1,
        });
    });

    it('keeps the full width of a tall image cropped to 16:9, centred without a focal point', () => {
        const crop = defaultCrop(16 / 9, undefined, 760, 1066);
        expect(crop.width).toBe(1);
        expect(crop.x).toBe(0);
        expect(crop.y).toBeCloseTo((1 - crop.height) / 2, 3);
        expect(fitsRatio(crop, 16 / 9, 760, 1066)).toBe(true);
    });

    it('stops at the edge when the focal point is near it', () => {
        expect(
            defaultCrop(
                16 / 9,
                {
                    x: 0.5,
                    y: 0.02,
                },
                1000,
                1000
            ).y
        ).toBe(0);
    });
});

describe('fitsRatio', () => {
    it('allows a pixel of rounding', () => {
        expect(
            fitsRatio(
                {
                    x: 0,
                    y: 0.2,
                    width: 1,
                    height: 0.57,
                },
                16 / 9,
                1600,
                1600
            )
        ).toBe(false);
        expect(
            fitsRatio(
                {
                    x: 0,
                    y: 0.2,
                    width: 1,
                    height: 0.5625,
                },
                16 / 9,
                1600,
                1600
            )
        ).toBe(true);
    });
});

describe('dragCrop', () => {
    const start = {
        x: 0.25,
        y: 0.25,
        width: 0.5,
        height: 0.5,
    };

    it('moves the frame and keeps it inside the image', () => {
        expect(
            dragCrop(
                start,
                'move',
                {
                    x: 0.4,
                    y: -0.1,
                },
                undefined
            )
        ).toEqual({
            x: 0.5,
            y: 0.15,
            width: 0.5,
            height: 0.5,
        });
    });

    it('resizes from a corner and keeps the opposite one in place', () => {
        expect(
            dragCrop(
                start,
                'top-left',
                {
                    x: -0.1,
                    y: 0.1,
                },
                undefined
            )
        ).toEqual({
            x: 0.15,
            y: 0.35,
            width: 0.6,
            height: 0.4,
        });
    });

    it('keeps a shape however the corner is dragged', () => {
        const dragged = dragCrop(
            start,
            'bottom-right',
            {
                x: 0.2,
                y: 0.4,
            },
            {
                ratio: 16 / 9,
                width: 1600,
                height: 900,
            }
        );
        expect(fitsRatio(dragged, 16 / 9, 1600, 900)).toBe(true);
        expect(dragged.x).toBe(0.25);
        expect(dragged.y).toBe(0.25);
    });

    it('shrinks a shaped frame that would leave the image', () => {
        const dragged = dragCrop(
            start,
            'bottom-right',
            {
                x: 0.5,
                y: 0,
            },
            {
                ratio: 1,
                width: 1000,
                height: 1000,
            }
        );
        expect(dragged.y + dragged.height).toBeLessThanOrEqual(1);
        expect(dragged.x + dragged.width).toBeLessThanOrEqual(1);
        expect(fitsRatio(dragged, 1, 1000, 1000)).toBe(true);
    });
});
