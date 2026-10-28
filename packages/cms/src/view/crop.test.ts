import { describe, expect, it } from 'vitest';
import { cropOf, edgesOf } from './crop.js';

describe('edgesOf', () => {
    it('reads a stored crop as the pixels trimmed from each edge', () => {
        expect(
            edgesOf(
                {
                    x: 0.075,
                    y: 0,
                    width: 0.85,
                    height: 1,
                },
                1600,
                1067
            )
        ).toEqual({
            top: 0,
            right: 120,
            bottom: 0,
            left: 120,
        });
    });

    it('trims nothing without a crop', () => {
        expect(edgesOf(undefined, 1600, 1067)).toEqual({
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
        });
    });
});

describe('cropOf', () => {
    it('stores trimmed pixels as the fractions kept', () => {
        expect(
            cropOf(
                {
                    top: 0,
                    right: 120,
                    bottom: 0,
                    left: 120,
                },
                1600,
                1067
            )
        ).toEqual({
            x: 0.075,
            y: 0,
            width: 0.85,
            height: 1,
        });
    });

    it('stores no crop when nothing is trimmed', () => {
        expect(
            cropOf(
                {
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                },
                1600,
                1067
            )
        ).toBeUndefined();
    });

    it('keeps a pixel when the edges would cross', () => {
        expect(
            cropOf(
                {
                    top: 0,
                    right: 900,
                    bottom: 0,
                    left: 900,
                },
                1600,
                1000
            )
        ).toEqual({
            x: 0.5625,
            y: 0,
            width: 0.0006,
            height: 1,
        });
    });
});
