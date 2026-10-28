import { describe, expect, it } from 'vitest';
import { BAR_GAP, barPath, chartSummary, labelledBars, placeBars, positionOf, scaleOf, WIDEST_BAR } from './chart-geometry.js';

const days = (values: readonly number[]) =>
    values.map((value, index) => ({
        label: `${index + 15} Oct`,
        value,
    }));

describe('the chart scale', () => {
    it('ticks a fortnight of orders at round tens', () => {
        expect(scaleOf([14, 18, 11, 22, 19, 9, 7, 16, 21, 24, 17, 20, 12, 8])).toEqual({
            minimum: 0,
            maximum: 30,
            ticks: [0, 10, 20, 30],
        });
    });

    it('takes the smallest round step that keeps the grid to four intervals', () => {
        expect(scaleOf([7]).ticks).toEqual([0, 2, 4, 6, 8]);
        expect(scaleOf([100]).ticks).toEqual([0, 50, 100]);
        expect(scaleOf([48290]).ticks).toEqual([0, 20000, 40000, 60000]);
    });

    it('steps below one without float noise', () => {
        expect(scaleOf([0.7]).ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
        expect(scaleOf([0.3]).ticks).toEqual([0, 0.1, 0.2, 0.3]);
    });

    it('keeps zero on the axis when every value is above it', () => {
        expect(scaleOf([40, 45]).minimum).toBe(0);
    });

    it('spans both sides of zero for a loss', () => {
        expect(scaleOf([-12, 25])).toEqual({
            minimum: -20,
            maximum: 40,
            ticks: [-20, 0, 20, 40],
        });
    });

    it('draws only the baseline when every value is zero', () => {
        expect(scaleOf([0, 0, 0])).toEqual({
            minimum: 0,
            maximum: 1,
            ticks: [0],
        });
    });

    it('places a value between the top and the bottom', () => {
        const scale = scaleOf([30]);
        expect(positionOf(scale, 0, 10, 160)).toBe(160);
        expect(positionOf(scale, 30, 10, 160)).toBe(10);
        expect(positionOf(scale, 15, 10, 160)).toBe(85);
    });
});

describe('a bar', () => {
    it('rounds its top and keeps its foot square on the baseline', () => {
        expect(
            barPath({
                x: 10,
                width: 20,
                baseline: 100,
                end: 40,
            })
        ).toBe('M10,100 V44 Q10,40 14,40 H26 Q30,40 30,44 V100 Z');
    });

    it('rounds its bottom when the value is below zero', () => {
        expect(
            barPath({
                x: 10,
                width: 20,
                baseline: 100,
                end: 130,
            })
        ).toBe('M10,100 V126 Q10,130 14,130 H26 Q30,130 30,126 V100 Z');
    });

    it('shrinks its corners to fit a short bar', () => {
        expect(
            barPath({
                x: 0,
                width: 20,
                baseline: 100,
                end: 98,
            })
        ).toBe('M0,100 V100 Q0,98 2,98 H18 Q20,98 20,100 V100 Z');
    });

    it('draws nothing for zero', () => {
        expect(
            barPath({
                x: 0,
                width: 20,
                baseline: 100,
                end: 100,
            })
        ).toBe('');
    });
});

describe('placing the bars', () => {
    const plot = (data: ReturnType<typeof days>, width: number) =>
        placeBars(data, {
            left: 0,
            right: width,
            top: 0,
            bottom: 100,
            scale: scaleOf(data.map((bar) => bar.value)),
        });

    it('leaves the gap between neighbours', () => {
        const [first, second] = plot(days([3, 4, 5, 6]), 100);
        expect(first?.width).toBe(25 - BAR_GAP);
        expect((second?.x ?? 0) - ((first?.x ?? 0) + (first?.width ?? 0))).toBe(BAR_GAP);
    });

    it('stops a bar growing past the widest, centred in its slot', () => {
        const [only] = plot(days([3]), 300);
        expect(only?.width).toBe(WIDEST_BAR);
        expect(only?.x).toBe(130);
    });

    it('anchors every bar to the baseline', () => {
        for (const bar of plot(days([1, 2, 3]), 90)) expect(bar.path).toMatch(/V100 Z$/);
    });
});

describe('the labels under a chart', () => {
    it('labels every bar while they fit', () => {
        expect([...labelledBars(days([1, 2, 3]), 80)]).toEqual([0, 1, 2]);
    });

    it('labels every other bar when they would touch, ending on the latest', () => {
        expect([...labelledBars(days([1, 2, 3, 4, 5]), 36)]).toEqual([0, 2, 4]);
        expect([...labelledBars(days([1, 2, 3, 4]), 36)]).toEqual([1, 3]);
    });
});

describe('the chart summary', () => {
    const format = (value: number) => String(value);

    it('names the range, the extremes and the latest bar', () => {
        expect(chartSummary('Orders per day', days([14, 24, 7, 8]), format)).toBe(
            'Orders per day: 4 bars, 15 Oct to 18 Oct. Highest 24 (16 Oct). Lowest 7 (17 Oct). Latest 8 (18 Oct).'
        );
    });

    it('says when there are no bars', () => {
        expect(chartSummary('Orders per day', [], format)).toBe('Orders per day: no numbers yet.');
    });
});
