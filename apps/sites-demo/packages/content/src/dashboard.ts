import type {
    ChartBar,
    DashboardContext,
    DashboardPeriod,
    DashboardWidget,
    OverviewContext,
    OverviewWidget,
    StatValue,
} from '@kizunajs/cms';
import type { sites } from './sites';

/**
 * Hagen's numbers, made up. The demo keeps no visits or orders, so each day's
 * figures come from the site and the date: the same period always gives the
 * same numbers, and a reload never changes them.
 */

type Site = DashboardContext<typeof sites>['site'];
type SiteKey = Site['key'];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Kroner to the pound, for adding the UK's sales to Norway's.
 */
const KRONER_PER_POUND = 13.23;

/**
 * A number between 0 and 1 that only the text decides.
 */
const fractionOf = (text: string): number => {
    let hash = 2166136261;
    for (const character of text) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967296;
};

const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * How busy each site is: the UK sells most at the Sunday market, Norway on
 * Saturdays, and the group's site is read on weekdays.
 */
const SHAPES: Record<SiteKey, { visits: number; weekend: number; orders: number; basket: number }> = {
    group: {
        visits: 1400,
        weekend: 0.6,
        orders: 0,
        basket: 0,
    },
    uk: {
        visits: 2900,
        weekend: 1.45,
        orders: 44,
        basket: 58,
    },
    norway: {
        visits: 2400,
        weekend: 1.25,
        orders: 250,
        basket: 620,
    },
};

/**
 * One day of a period, and how much of it had passed when the period ended.
 */
interface Day {
    start: Date;
    elapsed: number;
}

const daysOf = (window: { from: Date; to: Date }): Day[] => {
    const last = Date.UTC(window.to.getUTCFullYear(), window.to.getUTCMonth(), window.to.getUTCDate());
    const count = Math.max(1, Math.round((window.to.getTime() - window.from.getTime()) / DAY));
    return Array.from(
        {
            length: count,
        },
        (_, index) => {
            const start = last - (count - 1 - index) * DAY;
            return {
                start: new Date(start),
                elapsed: index === count - 1 ? Math.min(1, (window.to.getTime() - start) / DAY) : 1,
            };
        }
    );
};

const weekendOf = (site: SiteKey, date: Date): number => {
    const weekday = date.getUTCDay();
    return weekday === 0 || weekday === 6 ? SHAPES[site].weekend : 1;
};

const visitsOn = (site: SiteKey, day: Day): number =>
    SHAPES[site].visits * weekendOf(site, day.start) * (0.85 + fractionOf(`visits:${site}:${dayKey(day.start)}`) * 0.3) * day.elapsed;

const ordersOn = (site: SiteKey, day: Day): number =>
    SHAPES[site].orders * weekendOf(site, day.start) * (0.8 + fractionOf(`orders:${site}:${dayKey(day.start)}`) * 0.4) * day.elapsed;

const salesOn = (site: SiteKey, day: Day): number =>
    ordersOn(site, day) * SHAPES[site].basket * (0.9 + fractionOf(`basket:${site}:${dayKey(day.start)}`) * 0.2);

const sum = (days: readonly Day[], metric: (day: Day) => number): number => days.reduce((total, day) => total + metric(day), 0);

/**
 * A metric over the period, and how far it moved since the period before.
 */
const counted = (period: DashboardPeriod, metric: (day: Day) => number) => {
    const total = sum(daysOf(period), metric);
    const before = sum(daysOf(period.previous), metric);
    return {
        total,
        change: (total - before) / before,
    };
};

const count = new Intl.NumberFormat('en-GB');

const money = (site: SiteKey, amount: number): string =>
    site === 'uk'
        ? new Intl.NumberFormat('en-GB', {
              style: 'currency',
              currency: 'GBP',
              maximumFractionDigits: 0,
          }).format(amount)
        : `${new Intl.NumberFormat('nb-NO').format(Math.round(amount))} kr`;

const dayLabel = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    timeZone: 'UTC',
});

const longDayLabel = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
});

const labelOf = (period: DashboardPeriod, day: Day): string =>
    period.key === '7d' ? dayLabel.format(day.start) : longDayLabel.format(day.start);

export const visits = ({ site, period }: DashboardContext<typeof sites>): StatValue => {
    const { total, change } = counted(period, (day) => visitsOn(site.key, day));
    return {
        value: count.format(Math.round(total)),
        change,
    };
};

export const sales = ({ site, period }: DashboardContext<typeof sites>): StatValue => {
    const { total, change } = counted(period, (day) => salesOn(site.key, day));
    const orders = sum(daysOf(period), (day) => ordersOn(site.key, day));
    return {
        value: money(site.key, total),
        detail: `${count.format(Math.round(orders))} orders`,
        change,
    };
};

export const orders = ({ site, period }: DashboardContext<typeof sites>): StatValue => {
    const { total, change } = counted(period, (day) => ordersOn(site.key, day));
    const salesTotal = sum(daysOf(period), (day) => salesOn(site.key, day));
    return {
        value: count.format(Math.round(total)),
        detail: `${money(site.key, salesTotal / total)} average order`,
        change,
    };
};

/**
 * The UK's workshop places booked, of the 60 its three workshops hold.
 */
export const workshopBookings = ({ period }: DashboardContext<typeof sites>): StatValue => {
    const { total, change } = counted(period, (day) => 6 * (0.6 + fractionOf(`workshops:${dayKey(day.start)}`) * 0.8) * day.elapsed);
    return {
        value: count.format(Math.round(total)),
        change,
    };
};

export const visitsPerDay = ({ site, period }: DashboardContext<typeof sites>): ChartBar[] =>
    daysOf(period).map((day) => ({
        label: labelOf(period, day),
        value: Math.round(visitsOn(site.key, day)),
    }));

/**
 * Sales per day, beside the same day of the period before.
 */
export const salesPerDay = ({ site, period }: DashboardContext<typeof sites>): ChartBar[] => {
    const before = daysOf(period.previous);
    return daysOf(period).map((day, index) => ({
        label: labelOf(period, day),
        value: Math.round(salesOn(site.key, day)),
        previous: before[index] === undefined ? undefined : Math.round(salesOn(site.key, before[index]!)),
    }));
};

export const visitsAcrossSites = ({ sites: shown, period }: OverviewContext<typeof sites>): StatValue => {
    const { total, change } = counted(period, (day) => shown.reduce((running, site) => running + visitsOn(site.key, day), 0));
    return {
        value: count.format(Math.round(total)),
        change,
    };
};

/**
 * Both shops' sales in kroner, the UK's at a fixed rate to the pound.
 */
export const salesAcrossShops = ({ period }: OverviewContext<typeof sites>): StatValue => {
    const { total, change } = counted(period, (day) => salesOn('uk', day) * KRONER_PER_POUND + salesOn('norway', day));
    return {
        value: money('norway', total),
        change,
    };
};

export const ordersAcrossShops = ({ period }: OverviewContext<typeof sites>): StatValue => {
    const { total, change } = counted(period, (day) => ordersOn('uk', day) + ordersOn('norway', day));
    const uk = sum(daysOf(period), (day) => ordersOn('uk', day));
    return {
        value: count.format(Math.round(total)),
        detail: `${count.format(Math.round(uk))} in the UK, ${count.format(Math.round(total - uk))} in Norway`,
        change,
    };
};

/**
 * Each site's dashboard. The group's site sells nothing, so sales and orders
 * show on the two shops.
 */
export const dashboard: DashboardWidget<typeof sites>[] = [
    {
        type: 'stat',
        label: 'Visits',
        value: visits,
    },
    {
        type: 'stat',
        label: 'Sales',
        value: sales,
        sites: ['uk', 'norway'],
    },
    {
        type: 'stat',
        label: 'Orders',
        value: orders,
        sites: ['uk', 'norway'],
    },
    {
        type: 'stat',
        label: 'Workshop bookings',
        value: workshopBookings,
        sites: ['uk'],
    },
    {
        type: 'chart',
        label: 'Sales per day',
        style: 'line',
        data: salesPerDay,
        sites: ['uk', 'norway'],
    },
    {
        type: 'chart',
        label: 'Visits per day',
        data: visitsPerDay,
    },
    {
        type: 'reviews',
    },
    {
        type: 'collections',
    },
];

/**
 * What an admin over every site opens: the sites compared, then what the CMS
 * records across them.
 */
export const overview: OverviewWidget<typeof sites>[] = [
    {
        type: 'stat',
        label: 'Visits',
        value: visitsAcrossSites,
    },
    {
        type: 'stat',
        label: 'Sales across shops',
        value: salesAcrossShops,
    },
    {
        type: 'stat',
        label: 'Orders',
        value: ordersAcrossShops,
    },
    {
        type: 'sites',
        stats: [
            {
                label: 'Visits',
                value: visits,
            },
            {
                label: 'Sales',
                value: sales,
                sites: ['uk', 'norway'],
            },
        ],
        chart: {
            label: 'Visits per day',
            data: visitsPerDay,
        },
    },
    {
        type: 'reviews',
    },
    {
        type: 'refreshes',
    },
    {
        type: 'reach',
    },
    {
        type: 'editors',
    },
];
