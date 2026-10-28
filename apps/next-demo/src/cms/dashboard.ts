import type { ChartBar, DashboardWidget, StatValue } from '@kizunajs/cms';
import { formatKroner } from '../lib/format';
import { daysBefore, daysUpTo, ordersOn, ordersToday, revenueForWeek, subscribersOn, visitorsOn } from '../lib/shop-numbers';

const dayLabel = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
});

const change = (current: number, previous: number, period: string): string => {
    const percent = Math.round(((current - previous) / previous) * 100);
    if (percent === 0) return `Level with ${period}`;
    return `${percent > 0 ? 'Up' : 'Down'} ${Math.abs(percent)}% on ${period}`;
};

export const ordersSoFarToday = (): StatValue => {
    const now = new Date();
    return {
        value: ordersToday(now),
        detail: `${ordersOn(daysBefore(now, 1))} yesterday`,
    };
};

export const revenueThisWeek = (): StatValue => {
    const now = new Date();
    const current = revenueForWeek(now);
    return {
        value: formatKroner(current),
        detail: change(current, revenueForWeek(daysBefore(now, 7)), 'last week'),
    };
};

export const newsletterSubscribers = (): StatValue => {
    const now = new Date();
    const current = subscribersOn(now);
    return {
        value: current.toLocaleString('en-GB'),
        detail: `${current - subscribersOn(daysBefore(now, 7))} joined this week`,
    };
};

/**
 * Counted from the CMS itself. The config imports this file, so the reader is
 * imported when the dashboard opens rather than when the config loads.
 */
export const publishedArticles = async (): Promise<StatValue> => {
    const { default: kizuna } = await import('../../kizuna.cms.config');
    let count = 0;
    let latest: string | undefined;
    let cursor: string | undefined;
    do {
        const page = await kizuna.content.collections.articles.list({
            orderBy: 'publishedOn',
            direction: 'desc',
            limit: 50,
            ...(cursor === undefined
                ? {}
                : {
                      cursor,
                  }),
        });
        latest ??= page.items[0]?.title;
        count += page.items.length;
        cursor = page.next;
    } while (cursor !== undefined);
    return {
        value: count,
        detail: latest === undefined ? 'None yet' : `Latest: ${latest}`,
    };
};

const perDay = (count: (date: Date) => number): ChartBar[] =>
    daysUpTo(new Date(), 14).map((date) => ({
        label: dayLabel.format(date),
        value: count(date),
    }));

export const ordersPerDay = (): ChartBar[] => perDay(ordersOn);

export const visitorsPerDay = (): ChartBar[] => perDay(visitorsOn);

/**
 * The admin's first page: how the shop is doing, then the reviews waiting on
 * whoever signed in, then every collection.
 */
export const dashboard: DashboardWidget[] = [
    {
        type: 'stat',
        label: 'Orders today',
        value: ordersSoFarToday,
    },
    {
        type: 'stat',
        label: 'Revenue this week',
        value: revenueThisWeek,
        auth: {
            roles: 'admin',
        },
    },
    {
        type: 'stat',
        label: 'Newsletter subscribers',
        value: newsletterSubscribers,
    },
    {
        type: 'stat',
        label: 'Published articles',
        value: publishedArticles,
    },
    {
        type: 'chart',
        label: 'Orders per day',
        data: ordersPerDay,
    },
    {
        type: 'chart',
        label: 'Visitors per day',
        data: visitorsPerDay,
    },
    {
        type: 'reviews',
    },
    {
        type: 'collections',
    },
];
