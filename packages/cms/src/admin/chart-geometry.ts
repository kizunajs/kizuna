/**
 * One bar of a dashboard chart, as the dashboard route sends it.
 */
export interface ChartBar {
    label: string;
    value: number;
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
 * The space between two bars, in the surface's colour.
 */
export const BAR_GAP = 2;

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
}

/**
 * Lays the bars across the plot, each centred in an equal slot, with
 * `BAR_GAP` between neighbours until they reach `WIDEST_BAR`.
 */
export const placeBars = (
    data: readonly ChartBar[],
    plot: {
        left: number;
        right: number;
        top: number;
        bottom: number;
        scale: ChartScale;
    }
): PlacedBar[] => {
    const slotWidth = data.length === 0 ? 0 : (plot.right - plot.left) / data.length;
    const width = Math.max(0, Math.min(slotWidth - BAR_GAP, WIDEST_BAR));
    const baseline = positionOf(plot.scale, 0, plot.top, plot.bottom);
    return data.map((bar, index) => {
        const slotX = plot.left + index * slotWidth;
        const x = slotX + (slotWidth - width) / 2;
        const end = positionOf(plot.scale, bar.value, plot.top, plot.bottom);
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
        };
    });
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
 * latest bar.
 */
export const chartSummary = (label: string, data: readonly ChartBar[], format: (value: number) => string): string => {
    const first = data[0];
    const last = data.at(-1);
    if (first === undefined || last === undefined) return `${label}: no numbers yet.`;
    const highest = data.reduce((best, bar) => (bar.value > best.value ? bar : best), first);
    const lowest = data.reduce((best, bar) => (bar.value < best.value ? bar : best), first);
    const range = data.length === 1 ? `1 bar, ${first.label}` : `${data.length} bars, ${first.label} to ${last.label}`;
    return [
        `${label}: ${range}.`,
        `Highest ${format(highest.value)} (${highest.label}).`,
        `Lowest ${format(lowest.value)} (${lowest.label}).`,
        `Latest ${format(last.value)} (${last.label}).`,
    ].join(' ');
};
