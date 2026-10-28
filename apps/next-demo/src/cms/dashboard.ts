import type { ChartBar, DashboardContext, DashboardPeriod, DashboardWidget, StatValue } from '@kizunajs/cms';
import { formatKroner } from '../lib/format';
import {
    type Bucket,
    daysBetween,
    hoursBetween,
    newSubscribersIn,
    ordersIn,
    revenueIn,
    runningTotal,
    subscribersAt,
    total,
    visitorsIn,
} from '../lib/shop-numbers';

const dayLabel = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Oslo',
});

const hourLabel = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Oslo',
});

const count = new Intl.NumberFormat('en-GB');

/**
 * The window's buckets: hours over the last 24 hours, days over anything
 * longer.
 */
const bucketsOf = (key: DashboardPeriod['key'], window: { from: Date; to: Date }): Bucket[] =>
    key === '24h' ? hoursBetween(window.from, window.to) : daysBetween(window.from, window.to);

const labelOf = (bucket: Bucket): string => (bucket.unit === 'hour' ? hourLabel.format(bucket.start) : dayLabel.format(bucket.start));

/**
 * A metric over the period and the period before it, as a stat: the total,
 * how far it moved, and a line of its buckets.
 */
const statOf = (period: DashboardPeriod, metric: (bucket: Bucket) => number) => {
    const current = bucketsOf(period.key, period);
    const before = total(bucketsOf(period.key, period.previous), metric);
    const sum = total(current, metric);
    return {
        sum,
        change: (sum - before) / before,
        trend: current.map((bucket) => Math.round(metric(bucket))),
    };
};

export const revenue = ({ period }: DashboardContext): StatValue => {
    const { sum, change, trend } = statOf(period, revenueIn);
    return {
        value: formatKroner(sum),
        change,
        trend,
    };
};

export const orders = ({ period }: DashboardContext): StatValue => {
    const { sum, change, trend } = statOf(period, ordersIn);
    const revenueSum = total(bucketsOf(period.key, period), revenueIn);
    return {
        value: count.format(Math.round(sum)),
        detail: `${formatKroner(revenueSum / sum)} average order`,
        change,
        trend,
    };
};

export const visitors = ({ period }: DashboardContext): StatValue => {
    const { sum, change, trend } = statOf(period, visitorsIn);
    return {
        value: count.format(Math.round(sum)),
        change,
        trend,
    };
};

export const newSubscribers = ({ period }: DashboardContext): StatValue => {
    const { sum, change, trend } = statOf(period, newSubscribersIn);
    return {
        value: count.format(Math.round(sum)),
        detail: `${count.format(subscribersAt(period.to))} on the list`,
        change,
        trend,
    };
};

/**
 * Revenue added up across the period, beside the same running total for the
 * period before, point for point.
 */
export const salesOverTime = ({ period }: DashboardContext): ChartBar[] => {
    const current = bucketsOf(period.key, period);
    const before = runningTotal(bucketsOf(period.key, period.previous), revenueIn);
    return runningTotal(current, revenueIn).map((value, index) => ({
        label: labelOf(current[index]!),
        value: Math.round(value),
        previous: Math.round(before[index] ?? 0),
    }));
};

export const ordersPerDay = ({ period }: DashboardContext): ChartBar[] =>
    bucketsOf(period.key, period).map((bucket) => ({
        label: labelOf(bucket),
        value: Math.round(ordersIn(bucket)),
    }));

/**
 * The admin's first page: how the shop is doing over the period the editor
 * picks, then the reviews waiting on whoever signed in, then every collection.
 */
export const dashboard: DashboardWidget[] = [
    {
        type: 'stat',
        label: 'Revenue',
        value: revenue,
        auth: {
            roles: 'admin',
        },
    },
    {
        type: 'stat',
        label: 'Orders',
        value: orders,
    },
    {
        type: 'stat',
        label: 'Visitors',
        value: visitors,
    },
    {
        type: 'stat',
        label: 'New subscribers',
        value: newSubscribers,
    },
    {
        type: 'chart',
        label: 'Sales over time',
        description: 'Succeeded orders · NOK',
        style: 'line',
        data: salesOverTime,
    },
    {
        type: 'chart',
        label: 'Orders per day',
        data: ordersPerDay,
    },
    {
        type: 'reviews',
    },
    {
        type: 'collections',
    },
];
