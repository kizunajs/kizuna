import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Chart, chartSummary } from './chart.js';
import type { ChartBar } from './dashboard-widgets.js';

const week: ChartBar[] = [
    {
        label: 'Mon',
        value: 1200,
        previous: 900,
    },
    {
        label: 'Tue',
        value: 4800,
        previous: 3100,
    },
    {
        label: 'Wed',
        value: 2300,
    },
    {
        label: 'Thu',
        value: 2600,
        previous: 2900,
    },
];

const render = (props: Parameters<typeof Chart>[0]): string => renderToStaticMarkup(createElement(Chart, props));

/**
 * The paths a mark layer draws, found by the class TanStack Charts gives it.
 */
const pathsOf = (html: string, layer: string): string[] =>
    [...html.matchAll(new RegExp(`<g[^>]*class="ts-chart__${layer}"[^>]*>(.*?)</g>`, 'g'))].flatMap((group) =>
        [...(group[1] ?? '').matchAll(/<path [^>]*>/g)].map((path) => path[0])
    );

const tickLabelsOf = (html: string, axis: 'x' | 'y'): string[] =>
    [...html.matchAll(new RegExp(`data-ts-key="${axis}-tick-label:[^"]*"[^>]*>([^<]*)</text>`, 'g'))].map((label) => label[1] ?? '');

describe('Chart', () => {
    it('draws a bar for each point, in the paint for this period', () => {
        const html = render({
            label: 'Visitors per day',
            style: 'bar',
            data: week.map(({ label, value }) => ({
                label,
                value,
            })),
        });
        const bars = pathsOf(html, 'bar ts-chart__bar-y');
        expect(bars).toHaveLength(4);
        expect(bars.every((bar) => bar.includes('fill="var(--k-chart-bar)"'))).toBe(true);
    });

    it('puts a paler bar for the period before beside each point that has one', () => {
        const bars = pathsOf(
            render({
                label: 'Visitors per day',
                style: 'bar',
                data: week,
            }),
            'bar ts-chart__bar-y'
        );
        expect(bars.filter((bar) => bar.includes('fill="var(--k-chart-bar)"'))).toHaveLength(4);
        expect(bars.filter((bar) => bar.includes('fill="var(--k-chart-previous)"'))).toHaveLength(3);
    });

    it('draws a line with the area under it, and the period before as a dotted line', () => {
        const html = render({
            label: 'Revenue per day',
            style: 'line',
            data: week,
        });
        expect(pathsOf(html, 'area')).toHaveLength(1);
        const lines = pathsOf(html, 'line');
        expect(lines.filter((line) => line.includes('stroke="var(--k-ink)"'))).toHaveLength(1);
        expect(lines.filter((line) => line.includes('stroke-dasharray="0 3.5"')).length).toBeGreaterThan(0);
    });

    it('leaves the dotted line out when no point has a period before', () => {
        const html = render({
            label: 'Revenue per day',
            style: 'line',
            data: week.map(({ label, value }) => ({
                label,
                value,
            })),
        });
        expect(html).not.toContain('stroke-dasharray="0 3.5"');
    });

    it('labels the value axis from zero on round, compact steps', () => {
        expect(
            tickLabelsOf(
                render({
                    label: 'Visitors per day',
                    style: 'bar',
                    data: week,
                }),
                'y'
            )
        ).toEqual(['0', '2K', '4K', '6K']);
    });

    it('covers the values of charts beside it, so they share one scale', () => {
        expect(
            tickLabelsOf(
                render({
                    label: 'Visitors per day, Hagen Group',
                    style: 'bar',
                    data: [
                        {
                            label: 'Mon',
                            value: 300,
                        },
                    ],
                    domain: [5900],
                }),
                'y'
            )
        ).toEqual(['0', '2K', '4K', '6K']);
    });

    it('labels six points at most under the axis, always the latest', () => {
        const month = Array.from(
            {
                length: 30,
            },
            (_, index) => ({
                label: `${index + 1} Oct`,
                value: index * 10,
            })
        );
        const labels = tickLabelsOf(
            render({
                label: 'Visitors per day',
                style: 'bar',
                data: month,
            }),
            'x'
        );
        expect(labels.length).toBeLessThanOrEqual(6);
        expect(labels.at(-1)).toBe('30 Oct');
    });

    it('is named by its summary and keeps its numbers in a table for screen readers', () => {
        const html = render({
            label: 'Visitors per day',
            style: 'bar',
            data: week,
        });
        expect(html).toContain('role="img"');
        expect(html).toContain(`aria-label="${chartSummary('Visitors per day', week)}"`);
        expect(html).toContain('<caption>Visitors per day</caption>');
        expect(html).toContain('<th scope="col">Previous period</th>');
        expect(html).toContain('<th scope="row">Tue</th><td>4,800</td><td>3,100</td>');
    });
});

describe('chartSummary', () => {
    it('names the range, the highest, the lowest and the latest', () => {
        expect(chartSummary('Visitors per day', week)).toBe(
            'Visitors per day: 4 bars, Mon to Thu. Highest 4,800 (Tue). Lowest 1,200 (Mon). Latest 2,600 (Thu).'
        );
    });

    it('counts points on a line', () => {
        expect(chartSummary('Revenue per day', week.slice(0, 1), 'point')).toBe(
            'Revenue per day: 1 point, Mon. Highest 1,200 (Mon). Lowest 1,200 (Mon). Latest 1,200 (Mon).'
        );
    });

    it('says when there are no numbers yet', () => {
        expect(chartSummary('Visitors per day', [])).toBe('Visitors per day: no numbers yet.');
    });
});
