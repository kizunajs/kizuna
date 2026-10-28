import { useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { chartSummary, labelledBars, placeBars, positionOf, scaleOf, type ChartBar } from './chart-geometry.js';

const HEIGHT = 190;
const TOP = 10;
const AXIS_SPACE = 24;
const TICK_GAP = 8;
const TICK_CHARACTER = 6.2;

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
 * One series of bars from a zero baseline. Hovering or arrowing to a bar shows
 * its label and value, and a screen reader gets the summary and a table.
 */
export function BarChart({ label, data }: { label: string; data: readonly ChartBar[] }) {
    const frame = useRef<HTMLDivElement>(null);
    const width = useWidth(frame, 560);
    const [active, setActive] = useState<number | undefined>();

    const scale = scaleOf(data.map((bar) => bar.value));
    const tickLabels = scale.ticks.map((tick) => COMPACT.format(tick));
    const left = Math.max(...tickLabels.map((tickLabel) => tickLabel.length)) * TICK_CHARACTER + TICK_GAP * 2;
    const bottom = HEIGHT - AXIS_SPACE;
    const bars = placeBars(data, {
        left,
        right: width,
        top: TOP,
        bottom,
        scale,
    });
    const labelled = labelledBars(data, bars[0]?.slotWidth ?? 0);
    const baseline = positionOf(scale, 0, TOP, bottom);
    const shown = active === undefined ? undefined : bars[active];
    const shownBar = active === undefined ? undefined : data[active];

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
            <svg
                className="k-admin-chart-plot"
                width={width}
                height={HEIGHT}
                role="img"
                aria-label={chartSummary(label, data, (value) => WHOLE.format(value))}
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
                {bars.map((bar, index) => (
                    <g key={index}>
                        <path className="k-admin-chart-bar" data-active={index === active} d={bar.path} />
                        {labelled.has(index) ? (
                            <text className="k-admin-chart-axis" x={bar.x + bar.width / 2} y={bottom + 16} textAnchor="middle">
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
                {scale.minimum < 0 ? <line className="k-admin-chart-baseline" x1={left} x2={width} y1={baseline} y2={baseline} /> : null}
            </svg>
            {shown === undefined || shownBar === undefined ? null : (
                <div
                    className="k-popup k-admin-chart-tip"
                    data-align={active === 0 ? 'start' : active === data.length - 1 ? 'end' : 'middle'}
                    style={{
                        left: active === 0 ? shown.x : active === data.length - 1 ? shown.x + shown.width : shown.x + shown.width / 2,
                        top: Math.min(shown.end, baseline),
                    }}
                    aria-hidden="true">
                    <strong>{WHOLE.format(shownBar.value)}</strong>
                    <span>{shownBar.label}</span>
                </div>
            )}
            <table className="k-admin-visually-hidden">
                <caption>{label}</caption>
                <thead>
                    <tr>
                        <th scope="col">Label</th>
                        <th scope="col">Value</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((bar, index) => (
                        <tr key={index}>
                            <th scope="row">{bar.label}</th>
                            <td>{WHOLE.format(bar.value)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
