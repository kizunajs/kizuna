import { useMemo } from 'react';
import {
    areaY,
    barY,
    crosshair,
    defineChart,
    dot,
    group,
    lineY,
    ruleY,
    whenFocused,
    type ChartCurve,
    type ChartPoint,
} from '@tanstack/charts';
import { Chart as TanStackChart } from '@tanstack/charts/react/tooltip';
import { Chart as PlainChart } from '@tanstack/charts/react';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { tooltip } from '@tanstack/charts/tooltip';
import { portal } from '@tanstack/charts/tooltip/portal';
import type { ChartBar } from './dashboard-widgets.js';

const HEIGHT = 168;
const TOP = 10;
const AXIS_SPACE = 24;
const TICK_GAP = 8;
const TICK_CHARACTER = 6.2;
const TICK_SIZE = 10.5;

/**
 * The room the axis labels get, enough for a compact number like "48.2k",
 * so charts side by side start their plots at the same place.
 */
const AXIS_WIDTH = 48;

/**
 * How much of its slot a bar fills, the rest the gap to its neighbour, so a
 * chart of thirty points spaces its bars as one of fourteen does.
 */
const BAR_SHARE = 0.7;

/**
 * How wide a bar, or a bar and the one for the period before, grows when
 * there are few of them.
 */
const WIDEST_BAR = 40;

/**
 * The most labels under the axis, however wide the chart is.
 */
const MOST_LABELS = 6;

const WHOLE = new Intl.NumberFormat();
const COMPACT = new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
});

/**
 * One value of a chart as its marks read it: the point it belongs to, and
 * whether it is this period's or the one before.
 */
interface ChartRow {
    index: number;
    value: number | undefined;
    period: 'current' | 'previous';
}

/**
 * The axis for a chart's values: it always includes zero, and its round
 * ticks keep the grid to three or four lines.
 */
const valueScaleOf = (values: readonly number[]) => {
    const low = Math.min(0, ...values);
    const high = Math.max(0, ...values);
    const domain = low === high ? [0, 1] : [low, high];
    const coarse = scaleLinear().domain(domain).nice(2);
    const fine = scaleLinear().domain(domain).nice(3);
    return fine.ticks(3).length <= 4
        ? {
              scale: fine,
              ticks: fine.ticks(3),
          }
        : {
              scale: coarse,
              ticks: coarse.ticks(2),
          };
};

/**
 * The slope a smooth line leaves each point at, kept monotone so it never
 * overshoots a peak or dips below a valley it passes through.
 */
const tangentsOf = (points: ReadonlyArray<readonly [number, number]>): number[] => {
    const secants = points.slice(1).map(([x, y], index) => (y - points[index]![1]) / (x - points[index]![0]));
    const tangents = points.map((_, index) => {
        if (index === 0) return secants[0] ?? 0;
        if (index === points.length - 1) return secants.at(-1) ?? 0;
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

const smoothThrough = (points: ReadonlyArray<readonly [number, number]>): string => {
    const first = points[0];
    if (first === undefined) return '';
    if (points.length === 1) return `M${first[0]},${first[1]}h0`;
    const tangents = tangentsOf(points);
    const curves = points.slice(1).map(([x, y], index) => {
        const [fromX, fromY] = points[index]!;
        const third = (x - fromX) / 3;
        return `C${fromX + third},${fromY + tangents[index]! * third} ${x - third},${y - tangents[index + 1]! * third} ${x},${y}`;
    });
    return `M${first[0]},${first[1]}${curves.join('')}`;
};

/**
 * A smooth line through the points that keeps to their peaks and valleys,
 * and the area under it down to the baseline.
 */
const monotone: ChartCurve = {
    line: smoothThrough,
    area: (top, bottom) =>
        `${smoothThrough(top)}${[...bottom]
            .reverse()
            .map(([x, y]) => `L${x},${y}`)
            .join('')}Z`,
};

/**
 * What a screen reader hears for a chart: its range, its extremes and its
 * latest bar or point.
 */
export const chartSummary = (label: string, data: readonly ChartBar[], unit: 'bar' | 'point' = 'bar'): string => {
    const first = data[0];
    const last = data.at(-1);
    if (first === undefined || last === undefined) return `${label}: no numbers yet.`;
    const highest = data.reduce((best, bar) => (bar.value > best.value ? bar : best), first);
    const lowest = data.reduce((best, bar) => (bar.value < best.value ? bar : best), first);
    const range = data.length === 1 ? `1 ${unit}, ${first.label}` : `${data.length} ${unit}s, ${first.label} to ${last.label}`;
    return [
        `${label}: ${range}.`,
        `Highest ${WHOLE.format(highest.value)} (${highest.label}).`,
        `Lowest ${WHOLE.format(lowest.value)} (${lowest.label}).`,
        `Latest ${WHOLE.format(last.value)} (${last.label}).`,
    ].join(' ');
};

/**
 * What the tooltip says to a screen reader as it moves to a point.
 */
const spokenOf = (point: ChartBar | undefined): string => {
    if (point === undefined) return '';
    const value = `${point.label}: ${WHOLE.format(point.value)}`;
    return point.previous === undefined ? value : `${value}, previous period ${WHOLE.format(point.previous)}`;
};

/**
 * The mark a series is drawn with, small, for the legend and the tooltip:
 * this period a full line or bar, the period before a dotted line or a paler
 * bar.
 */
function Swatch({ style, previous }: { style: 'bar' | 'line'; previous: boolean }) {
    if (style === 'bar')
        return <span className={previous ? 'k-chart__swatch k-chart__swatch--previous' : 'k-chart__swatch'} aria-hidden="true" />;
    return (
        <svg className="k-chart__swatch-line" width="16" height="6" aria-hidden="true">
            <line className={previous ? 'k-chart__line k-chart__line--previous' : 'k-chart__line'} x1="1" x2="15" y1="3" y2="3" />
        </svg>
    );
}

/**
 * Says which mark is this period and which the period before, for a chart
 * that compares them.
 */
export function Legend({ style }: { style: 'bar' | 'line' }) {
    return (
        <div className="k-chart__legend">
            <span className="k-chart__legend-entry">
                <Swatch style={style} previous={false} />
                This period
            </span>
            <span className="k-chart__legend-entry">
                <Swatch style={style} previous />
                Previous period
            </span>
        </div>
    );
}

/**
 * One point's label, value and the value before, shown while it is hovered
 * or focused.
 */
function Tooltip({ point, style, compares }: { point: ChartBar; style: 'bar' | 'line'; compares: boolean }) {
    return (
        <span className="k-popup k-chart__tooltip-body">
            <span className="k-chart__tooltip-label">{point.label}</span>
            <span className="k-chart__tooltip-row">
                {compares ? <Swatch style={style} previous={false} /> : null}
                {compares ? <span>This period</span> : null}
                <strong>{WHOLE.format(point.value)}</strong>
            </span>
            {point.previous === undefined ? null : (
                <span className="k-chart__tooltip-row">
                    <Swatch style={style} previous />
                    <span>Previous period</span>
                    <strong>{WHOLE.format(point.previous)}</strong>
                </span>
            )}
        </span>
    );
}

/**
 * One series from a zero baseline, as bars or a line, with the period before
 * beside it when the points carry one. Hovering or arrowing to a point shows
 * its label, value and the value before, and a screen reader gets the summary
 * and a table.
 */
export function Chart({
    label,
    style,
    data,
    domain = [],
    height = HEIGHT,
}: {
    label: string;
    style: 'bar' | 'line';
    data: readonly ChartBar[];
    /**
     * Values the axis covers besides the chart's own, so charts side by side
     * share one scale.
     */
    domain?: readonly number[];
    height?: number;
}) {
    const compares = data.some((point) => point.previous !== undefined);
    const values = [
        ...domain,
        ...data.map((point) => point.value),
        ...data.flatMap((point) => (point.previous === undefined ? [] : [point.previous])),
    ];
    const low = Math.min(0, ...values);
    const high = Math.max(0, ...values);

    const definition = useMemo(() => {
        const { scale, ticks } = valueScaleOf([low, high]);
        const left = Math.max(AXIS_WIDTH, Math.max(...ticks.map((tick) => COMPACT.format(tick).length)) * TICK_CHARACTER + TICK_GAP * 2);
        const indexes = data.map((_, index) => index);
        const last = data.length - 1;
        const every = Math.max(1, Math.ceil(last / (MOST_LABELS - 1)));
        const current: ChartRow[] = data.map((point, index) => ({
            index,
            value: point.value,
            period: 'current',
        }));
        const previous: ChartRow[] = data.map((point, index) => ({
            index,
            value: point.previous,
            period: 'previous',
        }));

        return defineChart({
            chart: ({ width }) => {
                const slot = Math.max(1, width - left) / Math.max(1, data.length);
                // The bars fill BAR_SHARE of their slot until they reach WIDEST_BAR, centred in it.
                const gap = style === 'bar' ? 1 - Math.min(BAR_SHARE, WIDEST_BAR / slot) : 0;
                return {
                    marks: [
                        crosshair({
                            x:
                                style === 'line'
                                    ? {
                                          stroke: 'var(--k-line-strong)',
                                          strokeWidth: 1,
                                      }
                                    : false,
                            y: false,
                        }),
                        ruleY([0], {
                            stroke: 'var(--k-line-strong)',
                            strokeOpacity: 0.7,
                        }),
                        ...(style === 'bar'
                            ? [
                                  barY(compares ? [...previous, ...current].filter((row) => row.value !== undefined) : current, {
                                      x: 'index',
                                      y1: 0,
                                      y2: 'value',
                                      z: 'period',
                                      ...(compares
                                          ? {
                                                layout: group({
                                                    scale: scaleBand<string>().domain(['previous', 'current']),
                                                }),
                                                inset: 0.5,
                                            }
                                          : {}),
                                      radius: {
                                          end: 4,
                                      },
                                      fill: (row) => (row.period === 'previous' ? 'var(--k-chart-previous)' : 'var(--k-chart-bar)'),
                                      states: [
                                          {
                                              when: {
                                                  focus: 'x',
                                              },
                                              style: {
                                                  fill: ({ datum }) =>
                                                      datum.period === 'previous'
                                                          ? 'var(--k-chart-previous-active)'
                                                          : 'var(--k-chart-bar-active)',
                                              },
                                          },
                                      ],
                                  }),
                              ]
                            : [
                                  areaY(current, {
                                      x: 'index',
                                      y1: 0,
                                      y2: 'value',
                                      fill: 'var(--k-chart-area)',
                                      fillOpacity: 1,
                                      curve: monotone,
                                  }),
                                  ...(compares
                                      ? [
                                            lineY(previous, {
                                                x: 'index',
                                                y: 'value',
                                                stroke: 'var(--k-muted)',
                                                strokeOpacity: 0.8,
                                                strokeWidth: 1,
                                                strokeDasharray: '0 3.5',
                                                curve: monotone,
                                            }),
                                        ]
                                      : []),
                                  lineY(current, {
                                      x: 'index',
                                      y: 'value',
                                      stroke: 'var(--k-ink)',
                                      strokeWidth: 2,
                                      curve: monotone,
                                  }),
                                  ...(compares
                                      ? [
                                            whenFocused(
                                                dot(previous, {
                                                    x: 'index',
                                                    y: 'value',
                                                    r: 2.5,
                                                    fill: 'var(--k-canvas)',
                                                    stroke: 'var(--k-muted)',
                                                    strokeWidth: 1.5,
                                                }),
                                                {
                                                    match: 'x',
                                                }
                                            ),
                                        ]
                                      : []),
                                  whenFocused(
                                      dot(current, {
                                          x: 'index',
                                          y: 'value',
                                          r: 3.5,
                                          fill: 'var(--k-ink)',
                                          stroke: 'var(--k-canvas)',
                                          strokeWidth: 2,
                                      }),
                                      {
                                          match: 'x',
                                      }
                                  ),
                              ]),
                    ],
                    scales: {
                        x: {
                            scale: scaleBand<number>()
                                .domain(indexes)
                                .paddingInner(gap)
                                .paddingOuter(gap / 2),
                            axis: {
                                line: false,
                                ticks: {
                                    values: indexes.filter((index) => (last - index) % every === 0),
                                    size: 0,
                                    padding: 7,
                                    format: (index: number) => data[index]?.label ?? '',
                                },
                                tickLabels: {
                                    fontSize: TICK_SIZE,
                                    opacity: 1,
                                    thin: {
                                        minGap: 10,
                                        keep: [last],
                                    },
                                },
                            },
                        },
                        y: {
                            scale,
                            grid: {
                                stroke: 'var(--k-line)',
                                strokeOpacity: 0.6,
                            },
                            axis: {
                                line: false,
                                ticks: {
                                    values: ticks,
                                    size: 0,
                                    padding: TICK_GAP,
                                    format: (value: number) => COMPACT.format(value),
                                },
                                tickLabels: {
                                    fontSize: TICK_SIZE,
                                    opacity: 1,
                                },
                            },
                        },
                    },
                    margin: {
                        top: TOP,
                        right: 0,
                        bottom: AXIS_SPACE,
                        left,
                    },
                };
            },
            focus: 'group-x',
            maxFocusDistance: Number.POSITIVE_INFINITY,
            focusRing: false,
            tooltip: {
                use: tooltip,
                portal,
                className: 'k-chart__tooltip',
                format: (point: ChartPoint<ChartRow>) => spokenOf(data[point.datum.index]),
                formatGroup: (points: readonly ChartPoint<ChartRow>[]) => spokenOf(data[points[0]?.datum.index ?? -1]),
                anchor: (points: readonly ChartPoint[]) => ({
                    x: points.reduce((sum, point) => sum + point.x, 0) / Math.max(1, points.length),
                    y: Math.min(...points.map((point) => point.y)),
                }),
                placement: ['top', 'top-right', 'top-left'],
                offset: 10,
                sticky: false,
                motion: false,
            },
        });
    }, [data, style, compares, low, high]);

    return (
        <div className="k-chart__frame">
            <TanStackChart
                definition={definition}
                className="k-chart__plot"
                ariaLabel={chartSummary(label, data, style === 'line' ? 'point' : 'bar')}
                height={height}
                initialWidth={560}
                renderTooltipBody={({ points }) => {
                    const point = data[points[0]?.datum.index ?? -1];
                    return point === undefined ? null : <Tooltip point={point} style={style} compares={compares} />;
                }}
            />
            <table className="k-visually-hidden">
                <caption>{label}</caption>
                <thead>
                    <tr>
                        <th scope="col">Label</th>
                        <th scope="col">Value</th>
                        {compares ? <th scope="col">Previous period</th> : null}
                    </tr>
                </thead>
                <tbody>
                    {data.map((point, index) => (
                        <tr key={index}>
                            <th scope="row">{point.label}</th>
                            <td>{WHOLE.format(point.value)}</td>
                            {compares ? <td>{point.previous === undefined ? '' : WHOLE.format(point.previous)}</td> : null}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/**
 * How far a sparkline's stroke reaches past its points, kept inside the
 * frame.
 */
const SPARK_INSET = 2;

/**
 * A small line of values oldest first, from its own lowest to its highest,
 * with no axis, beside the number it belongs to. It shows a shape, so a
 * screen reader hears its summary and the number carries the value.
 */
export function Sparkline({ label, values, height = 28 }: { label: string; values: readonly number[]; height?: number }) {
    const definition = useMemo(() => {
        const rows = values.map((value, index) => ({
            index,
            value,
        }));
        const low = Math.min(...values);
        const high = Math.max(...values);
        const floor = low === high ? low - 1 : low - (high - low) * 0.15;
        return defineChart({
            marks: [
                areaY(rows, {
                    x: 'index',
                    y1: floor,
                    y2: 'value',
                    fill: 'var(--k-chart-area)',
                    fillOpacity: 1,
                    curve: monotone,
                }),
                lineY(rows, {
                    x: 'index',
                    y: 'value',
                    stroke: 'var(--k-ink)',
                    strokeWidth: 1.5,
                    curve: monotone,
                }),
            ],
            scales: {
                x: {
                    scale: scaleLinear().domain([0, Math.max(1, values.length - 1)]),
                    axis: false,
                },
                y: {
                    scale: scaleLinear().domain([floor, low === high ? high + 1 : high]),
                    axis: false,
                },
            },
            margin: {
                top: SPARK_INSET,
                right: SPARK_INSET,
                bottom: 0,
                left: SPARK_INSET,
            },
            pointer: false,
            keyboard: false,
            focusRing: false,
            tooltip: false,
        });
    }, [values]);
    if (values.length < 2) return null;
    return (
        <PlainChart
            definition={definition}
            className="k-sparkline"
            ariaLabel={chartSummary(
                label,
                values.map((value, index) => ({
                    label: `day ${index + 1}`,
                    value,
                })),
                'point'
            )}
            height={height}
            initialWidth={96}
            tabIndex={-1}
        />
    );
}
