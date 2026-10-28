import { describe, expect, it } from 'vitest';
import { groupsOf, runsOf, type DashboardCollection, type DashboardWidgetBody } from './dashboard-widgets.js';

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
