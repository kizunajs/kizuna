import { describe, expect, it } from 'vitest';
import {
    changeOf,
    groupsOf,
    periodOfHash,
    rangeOf,
    runsOf,
    tileColumnsOf,
    type DashboardCollection,
    type DashboardWidgetBody,
} from './dashboard-widgets.js';

const revenue: DashboardWidgetBody = {
    type: 'stat',
    label: 'Revenue this week',
    value: '48 290 kr',
};

const orders: DashboardWidgetBody = {
    type: 'stat',
    label: 'Orders this week',
    value: '132',
};

const ordersPerDay: DashboardWidgetBody = {
    type: 'chart',
    label: 'Orders per day',
    style: 'bar',
    data: [],
};

const reviews: DashboardWidgetBody = {
    type: 'reviews',
    reviews: [],
};

const collections: DashboardWidgetBody = {
    type: 'collections',
    collections: [],
};

describe('the dashboard rows', () => {
    it('puts neighbouring stats in one row of tiles, and a chart beside the reviews', () => {
        expect(runsOf([revenue, orders, ordersPerDay, reviews, collections])).toEqual([
            {
                kind: 'stats',
                widgets: [revenue, orders],
            },
            {
                kind: 'panels',
                widgets: [ordersPerDay, reviews],
            },
            {
                kind: 'collections',
                widget: collections,
            },
        ]);
    });

    it('keeps the order listed, starting a new row when another kind comes between', () => {
        expect(runsOf([revenue, reviews, orders]).map((run) => run.kind)).toEqual(['stats', 'panels', 'stats']);
    });
});

describe('the collection groups', () => {
    const collection = (name: string, group: string | null): DashboardCollection => ({
        kind: 'collection',
        name,
        label: name,
        group,
        count: 0,
    });

    it('lists Content first, then each group in the order first named', () => {
        const grouped = groupsOf([collection('orders', 'Shop'), collection('articles', null), collection('products', 'Shop')]);
        expect(
            grouped.map((group) => ({
                label: group.label,
                names: group.collections.map((member) => member.name),
            }))
        ).toEqual([
            {
                label: 'Content',
                names: ['articles'],
            },
            {
                label: 'Shop',
                names: ['orders', 'products'],
            },
        ]);
    });

    it('leaves out Content when nothing sits under it', () => {
        expect(groupsOf([collection('orders', 'Shop')]).map((group) => group.label)).toEqual(['Shop']);
    });
});

describe('changeOf', () => {
    it('shows a rise with an up arrow and one decimal', () => {
        expect(changeOf(0.081)).toEqual({
            text: '↑ 8.1%',
            direction: 'up',
        });
    });

    it('shows a fall with a down arrow, dropping a trailing zero', () => {
        expect(changeOf(-0.02)).toEqual({
            text: '↓ 2%',
            direction: 'down',
        });
    });

    it('shows no arrow for a change that rounds to nothing', () => {
        expect(changeOf(0.0004)).toEqual({
            text: '0%',
            direction: 'none',
        });
    });
});

describe('tileColumnsOf', () => {
    it('gives each of up to four tiles a column', () => {
        expect([1, 2, 3, 4].map(tileColumnsOf)).toEqual([1, 2, 3, 4]);
    });

    it('fills the rows evenly beyond four', () => {
        expect([5, 6, 7, 8, 9].map(tileColumnsOf)).toEqual([3, 3, 4, 4, 3]);
    });

    it('keeps four columns when there are no tiles', () => {
        expect(tileColumnsOf(0)).toBe(4);
    });
});

describe('the dashboard period', () => {
    it('reads the period the address names', () => {
        expect(periodOfHash('#period=30d')).toBe('30d');
        expect(periodOfHash('#period=24h')).toBe('24h');
    });

    it('opens on the last 7 days without one, or with one it does not know', () => {
        expect(periodOfHash('')).toBe('7d');
        expect(periodOfHash('#/')).toBe('7d');
        expect(periodOfHash('#period=1y')).toBe('7d');
    });

    it('names a week by its first and last day', () => {
        expect(
            rangeOf(
                {
                    from: '2026-10-21T12:00:00.000Z',
                    to: '2026-10-28T12:00:00.000Z',
                },
                'en-GB',
                new Date('2026-10-28T12:00:00.000Z')
            )
        ).toBe('21 Oct – 28 Oct');
    });

    it('adds the year once the range is not this one', () => {
        expect(
            rangeOf(
                {
                    from: '2026-12-01T12:00:00.000Z',
                    to: '2026-12-31T12:00:00.000Z',
                },
                'en-GB',
                new Date('2027-01-02T12:00:00.000Z')
            )
        ).toBe('1 Dec 2026 – 31 Dec 2026');
    });

    it('names the hour for the last 24 hours', () => {
        expect(
            rangeOf(
                {
                    from: '2026-10-27T12:00:00.000Z',
                    to: '2026-10-28T12:00:00.000Z',
                },
                'en-GB',
                new Date('2026-10-28T12:00:00.000Z')
            )
        ).toMatch(/^27 Oct.*\d\d:\d\d – 28 Oct.*\d\d:\d\d$/);
    });
});
