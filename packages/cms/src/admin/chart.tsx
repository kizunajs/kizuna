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
        <div ref={frame} className="k-chart__frame">
            <div className="k-chart__stage">
                <svg
                    className="k-chart__plot"
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
                                <line className={tick === 0 ? 'k-chart__baseline' : 'k-chart__grid'} x1={left} x2={width} y1={y} y2={y} />
                                <text className="k-chart__axis" x={left - TICK_GAP} y={y + 3.5} textAnchor="end">
                                    {tickLabels[index]}
                                </text>
                            </g>
                        );
                    })}
                    {style === 'line' ? (
                        <>
                            {shown === undefined ? null : (
                                <line
                                    className="k-chart__crosshair"
                                    x1={shown.slotX + shown.slotWidth / 2}
                                    x2={shown.slotX + shown.slotWidth / 2}
                                    y1={TOP}
                                    y2={bottom}
                                />
                            )}
                            <path className="k-chart__area" d={areaPath(points, baseline)} />
                            {compares ? <path className="k-chart__line k-chart__line--previous" d={linePath(previousPoints)} /> : null}
                            <path className="k-chart__line" d={linePath(points)} />
                            {shownPrevious === undefined ? null : (
                                <circle className="k-chart__dot k-chart__dot--previous" cx={shownPrevious.x} cy={shownPrevious.y} r={2.5} />
                            )}
                            {shownValue === undefined ? null : (
                                <circle className="k-chart__dot" cx={shownValue.x} cy={shownValue.y} r={3.5} />
                            )}
                        </>
                    ) : (
                        bars.map((bar, index) => (
                            <g key={index}>
                                {bar.previous === undefined ? null : (
                                    <path
                                        className="k-chart__bar k-chart__bar--previous"
                                        data-active={index === active}
                                        d={bar.previous.path}
                                    />
                                )}
                                <path className="k-chart__bar" data-active={index === active} d={bar.path} />
                            </g>
                        ))
                    )}
                    {bars.map((bar, index) => (
                        <g key={index}>
                            {labelled.has(index) ? (
                                <text className="k-chart__axis" x={bar.slotX + bar.slotWidth / 2} y={bottom + 16} textAnchor="middle">
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
                    {scale.minimum < 0 ? <line className="k-chart__baseline" x1={left} x2={width} y1={baseline} y2={baseline} /> : null}
                </svg>
                {shown === undefined || shownPoint === undefined || active === undefined ? null : (
                    <div
                        className="k-popup k-chart__tooltip"
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
                        <span className="k-chart__tooltip-label">{shownPoint.label}</span>
                        <span className="k-chart__tooltip-row">
                            {compares ? <Swatch style={style} previous={false} /> : null}
                            {compares ? <span>This period</span> : null}
                            <strong>{WHOLE.format(shownPoint.value)}</strong>
                        </span>
                        {shownPoint.previous === undefined ? null : (
                            <span className="k-chart__tooltip-row">
                                <Swatch style={style} previous />
                                <span>Previous period</span>
                                <strong>{WHOLE.format(shownPoint.previous)}</strong>
                            </span>
                        )}
                    </div>
                )}
            </div>
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
