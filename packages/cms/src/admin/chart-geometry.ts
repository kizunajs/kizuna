/**
 * One bar of a dashboard chart, as the dashboard route sends it.
 */
export interface ChartBar {
    label: string;
    value: number;
    /**
     * The same point in the period before, drawn beside it.
     */
    previous?: number;
}

/**
 * The values a chart's axis spans, and the round values it labels.
 */
export interface ChartScale {
    minimum: number;
    maximum: number;
    ticks: number[];
}

/**
 * The most intervals an axis is split into, so the grid stays a few lines.
 */
const MOST_INTERVALS = 4;

const ROUND_MULTIPLES = [1, 2, 5];

/**
 * A value without the float noise a step adds, so `3 * 0.1` reads as `0.3`.
 */
const tidy = (value: number): number => Number(value.toPrecision(12));

/**
 * The axis for a chart's values: it always includes zero, and its ticks fall
 * on a round step, 1, 2 or 5 times a power of ten, the smallest that keeps
 * the grid to four intervals.
 */
export const scaleOf = (values: readonly number[]): ChartScale => {
    const low = Math.min(0, ...values);
    const high = Math.max(0, ...values);
    if (low === high) {
        return {
            minimum: 0,
            maximum: 1,
            ticks: [0],
        };
    }
    const smallest = (high - low) / MOST_INTERVALS;
    for (let exponent = Math.floor(Math.log10(smallest)); ; exponent += 1) {
        for (const multiple of ROUND_MULTIPLES) {
            const step = tidy(multiple * 10 ** exponent);
            const first = Math.floor(tidy(low / step));
            const last = Math.ceil(tidy(high / step));
            if (last - first > MOST_INTERVALS) continue;
            const ticks = Array.from(
                {
                    length: last - first + 1,
                },
                (_, index) => tidy((first + index) * step)
            );
            return {
                minimum: ticks[0] ?? 0,
                maximum: ticks.at(-1) ?? 1,
                ticks,
            };
        }
    }
};

/**
 * Where a value sits between the plot's top and bottom edges.
 */
export const positionOf = (scale: ChartScale, value: number, top: number, bottom: number): number =>
    top + ((scale.maximum - value) / (scale.maximum - scale.minimum)) * (bottom - top);

/**
 * How much of its slot a bar fills, the rest the gap to its neighbour, so a
 * chart of thirty points spaces its bars as one of fourteen does.
 */
export const BAR_SHARE = 0.7;

/**
 * How wide a bar grows when there are few of them.
 */
export const WIDEST_BAR = 40;

const CORNER = 4;

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * A bar from the baseline to its value, with its far end rounded and the end
 * on the baseline square. A bar of zero draws nothing.
 */
export const barPath = (bar: { x: number; width: number; baseline: number; end: number }): string => {
    const height = Math.abs(bar.baseline - bar.end);
    if (height === 0 || bar.width <= 0) return '';
    const radius = Math.min(CORNER, bar.width / 2, height);
    const curveEnd = bar.end < bar.baseline ? bar.end + radius : bar.end - radius;
    const left = round(bar.x);
    const right = round(bar.x + bar.width);
    return [
        `M${left},${round(bar.baseline)}`,
        `V${round(curveEnd)}`,
        `Q${left},${round(bar.end)} ${round(bar.x + radius)},${round(bar.end)}`,
        `H${round(bar.x + bar.width - radius)}`,
        `Q${right},${round(bar.end)} ${right},${round(curveEnd)}`,
        `V${round(bar.baseline)}`,
        'Z',
    ].join(' ');
};

/**
 * One bar laid out in the plot: its slot, which takes the pointer, and the
 * mark inside it.
 */
export interface PlacedBar {
    slotX: number;
    slotWidth: number;
    x: number;
    width: number;
    end: number;
    path: string;
    /**
     * The bar for the period before, on the left of the slot, when the chart
     * compares periods and this point has one.
     */
    previous?: {
        x: number;
        width: number;
        path: string;
    };
}

/**
 * The space between a bar and the one for the period before it.
 */
const PAIR_GAP = 1;

/**
 * The plot a chart draws in, and the scale its values map through.
 */
export interface Plot {
    left: number;
    right: number;
    top: number;
    bottom: number;
    scale: ChartScale;
}

/**
 * Lays the bars across the plot, each centred in an equal slot and filling
 * `BAR_SHARE` of it, until they reach `WIDEST_BAR`. A chart that
 * compares periods splits each slot's bar in two, the period before on the
 * left.
 */
export const placeBars = (data: readonly ChartBar[], plot: Plot): PlacedBar[] => {
    const slotWidth = data.length === 0 ? 0 : (plot.right - plot.left) / data.length;
    const pairWidth = Math.max(0, Math.min(slotWidth * BAR_SHARE, WIDEST_BAR));
    const compares = data.some((bar) => bar.previous !== undefined);
    const width = compares ? Math.max(0, (pairWidth - PAIR_GAP) / 2) : pairWidth;
    const baseline = positionOf(plot.scale, 0, plot.top, plot.bottom);
    return data.map((bar, index) => {
        const slotX = plot.left + index * slotWidth;
        const pairX = slotX + (slotWidth - pairWidth) / 2;
        const x = compares ? pairX + width + PAIR_GAP : pairX;
        const end = positionOf(plot.scale, bar.value, plot.top, plot.bottom);
        const previousEnd = bar.previous === undefined ? undefined : positionOf(plot.scale, bar.previous, plot.top, plot.bottom);
        return {
            slotX,
            slotWidth,
            x,
            width,
            end,
            path: barPath({
                x,
                width,
                baseline,
                end,
            }),
            ...(previousEnd === undefined
                ? {}
                : {
                      previous: {
                          x: pairX,
                          width,
                          path: barPath({
                              x: pairX,
                              width,
                              baseline,
                              end: previousEnd,
                          }),
                      },
                  }),
        };
    });
};

/**
 * A point of a line, at the middle of its slot.
 */
export interface LinePoint {
    x: number;
    y: number;
}

/**
 * Where each value sits on a line through the slots' middles, `undefined`
 * where a value is missing, so the line leaves a gap there.
 */
export const linePointsOf = (values: ReadonlyArray<number | undefined>, plot: Plot): Array<LinePoint | undefined> => {
    const slotWidth = values.length === 0 ? 0 : (plot.right - plot.left) / values.length;
    return values.map((value, index) =>
        value === undefined
            ? undefined
            : {
                  x: plot.left + (index + 0.5) * slotWidth,
                  y: positionOf(plot.scale, value, plot.top, plot.bottom),
              }
    );
};

/**
 * The runs of points between gaps.
 */
const segmentsOf = (points: ReadonlyArray<LinePoint | undefined>): LinePoint[][] => {
    const segments: LinePoint[][] = [[]];
    for (const point of points) {
        if (point === undefined) segments.push([]);
        else segments.at(-1)!.push(point);
    }
    return segments.filter((segment) => segment.length > 0);
};

/**
 * The slope a smooth line leaves each point at, kept monotone so it never
 * overshoots a peak or dips below a valley it passes through.
 */
const tangentsOf = (segment: readonly LinePoint[]): number[] => {
    const secants = segment.slice(1).map((point, index) => (point.y - segment[index]!.y) / (point.x - segment[index]!.x));
    const tangents = segment.map((_, index) => {
        if (index === 0) return secants[0] ?? 0;
        if (index === segment.length - 1) return secants.at(-1) ?? 0;
        const before = secants[index - 1]!;
        const after = secants[index]!;
        return before * after <= 0 ? 0 : (before + after) / 2;
    });
    secants.forEach((secant, index) => {
        if (secant === 0) {
            tangents[index] = 0;
            tangents[index + 1] = 0;
            return;
        }
        const start = tangents[index]! / secant;
        const end = tangents[index + 1]! / secant;
        const length = start * start + end * end;
        if (length > 9) {
            const shrink = 3 / Math.sqrt(length);
            tangents[index] = shrink * start * secant;
            tangents[index + 1] = shrink * end * secant;
        }
    });
    return tangents;
};

const smoothSegment = (segment: readonly LinePoint[]): string => {
    const first = segment[0]!;
    if (segment.length === 1) return `M${round(first.x)},${round(first.y)} h0`;
    const tangents = tangentsOf(segment);
    const curves = segment.slice(1).map((point, index) => {
        const from = segment[index]!;
        const third = (point.x - from.x) / 3;
        return `C${round(from.x + third)},${round(from.y + tangents[index]! * third)} ${round(point.x - third)},${round(point.y - tangents[index + 1]! * third)} ${round(point.x)},${round(point.y)}`;
    });
    return [`M${round(first.x)},${round(first.y)}`, ...curves].join(' ');
};

/**
 * A smooth line through the points, broken where one is missing. A point
 * alone between gaps draws as a dot, given a round line cap.
 */
export const linePath = (points: ReadonlyArray<LinePoint | undefined>): string => segmentsOf(points).map(smoothSegment).join(' ');

/**
 * The area between the line and the baseline, for a faint fill under it.
 */
export const areaPath = (points: ReadonlyArray<LinePoint | undefined>, baseline: number): string =>
    segmentsOf(points)
        .filter((segment) => segment.length > 1)
        .map((segment) => `${smoothSegment(segment)} V${round(baseline)} H${round(segment[0]!.x)} Z`)
        .join(' ');

/**
 * The line and the area under it for a small trend beside a number, scaled
 * to its own lowest and highest values. Fewer than two values draw nothing.
 */
export const sparklineOf = (values: readonly number[], width: number, height: number): { line: string; area: string } | undefined => {
    if (values.length < 2) return undefined;
    const low = Math.min(...values);
    const high = Math.max(...values);
    const inset = 2;
    const points = values.map((value, index) => ({
        x: (index / (values.length - 1)) * width,
        y: high === low ? height / 2 : inset + ((high - value) / (high - low)) * (height - inset * 2),
    }));
    return {
        line: linePath(points),
        area: areaPath(points, height),
    };
};

/**
 * Roughly how wide a character of an axis label is, in pixels.
 */
const CHARACTER_WIDTH = 6.5;

const LABEL_SPACE = 10;

/**
 * Which bars carry a label under the axis: every one while the labels fit,
 * otherwise every nth, counted back from the latest so it is always labelled.
 */
export const labelledBars = (data: readonly ChartBar[], slotWidth: number): Set<number> => {
    const longest = Math.max(0, ...data.map((bar) => bar.label.length));
    const every = slotWidth <= 0 ? data.length : Math.max(1, Math.ceil((longest * CHARACTER_WIDTH + LABEL_SPACE) / slotWidth));
    return new Set(data.flatMap((_, index) => ((data.length - 1 - index) % every === 0 ? [index] : [])));
};

/**
 * What a screen reader hears for a chart: its range, its extremes and its
 * latest bar or point.
 */
export const chartSummary = (
    label: string,
    data: readonly ChartBar[],
    format: (value: number) => string,
    unit: 'bar' | 'point' = 'bar'
): string => {
    const first = data[0];
    const last = data.at(-1);
    if (first === undefined || last === undefined) return `${label}: no numbers yet.`;
    const highest = data.reduce((best, bar) => (bar.value > best.value ? bar : best), first);
    const lowest = data.reduce((best, bar) => (bar.value < best.value ? bar : best), first);
    const range = data.length === 1 ? `1 ${unit}, ${first.label}` : `${data.length} ${unit}s, ${first.label} to ${last.label}`;
    return [
        `${label}: ${range}.`,
        `Highest ${format(highest.value)} (${highest.label}).`,
        `Lowest ${format(lowest.value)} (${lowest.label}).`,
        `Latest ${format(last.value)} (${last.label}).`,
    ].join(' ');
};
