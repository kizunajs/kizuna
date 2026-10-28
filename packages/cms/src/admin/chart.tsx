import { useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import {
    areaPath,
    chartSummary,
    labelledBars,
    linePath,
    linePointsOf,
    placeBars,
    positionOf,
    scaleOf,
    sparklineOf,
    type ChartBar,
} from './chart-geometry.js';

const HEIGHT = 190;
const TOP = 10;
const AXIS_SPACE = 24;
const TICK_GAP = 8;
const TICK_CHARACTER = 6.2;

/**
 * The room the axis labels get, enough for a compact number like "48.2k",
 * so charts side by side start their plots at the same place.
 */
const AXIS_WIDTH = 48;

const SPARKLINE_WIDTH = 72;
const SPARKLINE_HEIGHT = 28;

const WHOLE = new Intl.NumberFormat();
const COMPACT = new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
});

/**
 * The width the element is drawn at, following it as it changes.
 */
const useWidth = (element: RefObject<HTMLElement | null>, fallback: number): number => {
    const [width, setWidth] = useState(fallback);
    useLayoutEffect(() => {
        const current = element.current;
        if (current === null) return;
        setWidth(current.clientWidth || fallback);
        const observer = new ResizeObserver(([entry]) => {
            if (entry !== undefined && entry.contentRect.width > 0) setWidth(entry.contentRect.width);
        });
        observer.observe(current);
        return () => observer.disconnect();
    }, [element, fallback]);
    return width;
};

/**
 * A small line of a stat's recent values, with a faint area under it. Fewer
 * than two values draw nothing.
 */
export function Sparkline({ values }: { values: readonly number[] }) {
    const sparkline = sparklineOf(values, SPARKLINE_WIDTH, SPARKLINE_HEIGHT);
    if (sparkline === undefined) return null;
    return (
        <svg
            className="k-admin-sparkline"
            width={SPARKLINE_WIDTH}
            height={SPARKLINE_HEIGHT}
            viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
            aria-hidden="true">
            <path className="k-admin-chart-area" d={sparkline.area} />
            <path className="k-admin-chart-line" d={sparkline.line} />
        </svg>
    );
}

/**
 * Says which mark is this period and which the period before, for a chart
 * that compares them.
 */
export function Legend({ style }: { style: 'bar' | 'line' }) {
    const swatch = (previous: boolean) =>
        style === 'line' ? (
            <svg width="18" height="8" aria-hidden="true">
                <line className={previous ? 'k-admin-chart-previous-line' : 'k-admin-chart-line'} x1="1" x2="17" y1="4" y2="4" />
            </svg>
        ) : (
            <span className="k-admin-legend-bar" data-previous={previous ? '' : undefined} aria-hidden="true" />
        );
    return (
        <div className="k-admin-legend">
            <span className="k-admin-legend-entry">
                {swatch(false)}
                This period
            </span>
            <span className="k-admin-legend-entry">
                {swatch(true)}
                Previous period
            </span>
        </div>
    );
}

/**
 * One series from a zero baseline, as bars or a line, with the period before
 * beside it when the points carry one. Hovering or arrowing to a point shows
 * its label, value and the value before, and a screen reader gets the summary
 * and a table.
 */
export function Chart({ label, style, data }: { label: string; style: 'bar' | 'line'; data: readonly ChartBar[] }) {
    const frame = useRef<HTMLDivElement>(null);
    const width = useWidth(frame, 560);
    const [active, setActive] = useState<number | undefined>();

    const compares = data.some((point) => point.previous !== undefined);
    const scale = scaleOf([
        ...data.map((point) => point.value),
        ...data.flatMap((point) => (point.previous === undefined ? [] : [point.previous])),
    ]);
    const tickLabels = scale.ticks.map((tick) => COMPACT.format(tick));
    const left = Math.max(AXIS_WIDTH, Math.max(...tickLabels.map((tickLabel) => tickLabel.length)) * TICK_CHARACTER + TICK_GAP * 2);
    const bottom = HEIGHT - AXIS_SPACE;
    const plot = {
        left,
        right: width,
        top: TOP,
        bottom,
        scale,
    };
    const bars = placeBars(data, plot);
    const points = linePointsOf(
        data.map((point) => point.value),
        plot
    );
    const previousPoints = linePointsOf(
        data.map((point) => point.previous),
        plot
    );
    const slotWidth = bars[0]?.slotWidth ?? 0;
    const labelled = labelledBars(data, slotWidth);
    const baseline = positionOf(scale, 0, TOP, bottom);
    const shown = active === undefined ? undefined : bars[active];
    const shownPoint = active === undefined ? undefined : data[active];
    const shownValue = active === undefined ? undefined : points[active];
    const shownPrevious = active === undefined ? undefined : previousPoints[active];
    // The tip sits over the highest mark of the point, this period's or the one before.
    const shownTop = Math.min(
        style === 'line' ? (shownValue?.y ?? baseline) : (shown?.end ?? baseline),
        baseline,
        shownPrevious?.y ?? baseline
    );

    const move = (event: KeyboardEvent<SVGSVGElement>): void => {
        const last = data.length - 1;
        const next = (() => {
            if (event.key === 'ArrowLeft') return Math.max(0, (active ?? last) - 1);
            if (event.key === 'ArrowRight') return Math.min(last, (active ?? last) + 1);
            if (event.key === 'Home') return 0;
            if (event.key === 'End') return last;
            return undefined;
        })();
        if (next === undefined) return;
        event.preventDefault();
        setActive(next);
    };

    return (
        <div ref={frame} className="k-admin-chart-frame">
            <div className="k-admin-chart-stage">
                <svg
                    className="k-admin-chart-plot"
                    width={width}
                    height={HEIGHT}
                    role="img"
                    aria-label={chartSummary(label, data, (value) => WHOLE.format(value), style === 'line' ? 'point' : 'bar')}
                    tabIndex={0}
                    onKeyDown={move}
                    onFocus={() => setActive((current) => current ?? data.length - 1)}
                    onBlur={() => setActive(undefined)}
                    onPointerLeave={() => setActive(undefined)}>
                    {scale.ticks.map((tick, index) => {
                        const y = positionOf(scale, tick, TOP, bottom);
                        return (
                            <g key={tick}>
                                <line
                                    className={tick === 0 ? 'k-admin-chart-baseline' : 'k-admin-chart-grid'}
                                    x1={left}
                                    x2={width}
                                    y1={y}
                                    y2={y}
                                />
                                <text className="k-admin-chart-axis" x={left - TICK_GAP} y={y + 3.5} textAnchor="end">
                                    {tickLabels[index]}
                                </text>
                            </g>
                        );
                    })}
                    {style === 'line' ? (
                        <>
                            {shown === undefined ? null : (
                                <line
                                    className="k-admin-chart-crosshair"
                                    x1={shown.slotX + shown.slotWidth / 2}
                                    x2={shown.slotX + shown.slotWidth / 2}
                                    y1={TOP}
                                    y2={bottom}
                                />
                            )}
                            <path className="k-admin-chart-area" d={areaPath(points, baseline)} />
                            {compares ? <path className="k-admin-chart-previous-line" d={linePath(previousPoints)} /> : null}
                            <path className="k-admin-chart-line" d={linePath(points)} />
                            {shownPrevious === undefined ? null : (
                                <circle className="k-admin-chart-dot" data-previous="" cx={shownPrevious.x} cy={shownPrevious.y} r={3} />
                            )}
                            {shownValue === undefined ? null : (
                                <circle className="k-admin-chart-dot" cx={shownValue.x} cy={shownValue.y} r={3.5} />
                            )}
                        </>
                    ) : (
                        bars.map((bar, index) => (
                            <g key={index}>
                                {bar.previous === undefined ? null : (
                                    <path
                                        className="k-admin-chart-bar"
                                        data-previous=""
                                        data-active={index === active}
                                        d={bar.previous.path}
                                    />
                                )}
                                <path className="k-admin-chart-bar" data-active={index === active} d={bar.path} />
                            </g>
                        ))
                    )}
                    {bars.map((bar, index) => (
                        <g key={index}>
                            {labelled.has(index) ? (
                                <text className="k-admin-chart-axis" x={bar.slotX + bar.slotWidth / 2} y={bottom + 16} textAnchor="middle">
                                    {data[index]?.label}
                                </text>
                            ) : null}
                            <rect
                                x={bar.slotX}
                                y={TOP}
                                width={bar.slotWidth}
                                height={bottom - TOP}
                                fill="transparent"
                                onPointerEnter={() => setActive(index)}
                            />
                        </g>
                    ))}
                    {scale.minimum < 0 ? (
                        <line className="k-admin-chart-baseline" x1={left} x2={width} y1={baseline} y2={baseline} />
                    ) : null}
                </svg>
                {shown === undefined || shownPoint === undefined || active === undefined ? null : (
                    <div
                        className="k-popup k-admin-chart-tip"
                        data-align={active === 0 ? 'start' : active === data.length - 1 ? 'end' : 'middle'}
                        style={{
                            left:
                                active === 0
                                    ? shown.slotX
                                    : active === data.length - 1
                                      ? shown.slotX + shown.slotWidth
                                      : shown.slotX + shown.slotWidth / 2,
                            top: shownTop,
                        }}
                        aria-hidden="true">
                        <span>{shownPoint.label}</span>
                        <strong>{WHOLE.format(shownPoint.value)}</strong>
                        {shownPoint.previous === undefined ? null : <span>Previous {WHOLE.format(shownPoint.previous)}</span>}
                    </div>
                )}
            </div>
            <table className="k-admin-visually-hidden">
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
