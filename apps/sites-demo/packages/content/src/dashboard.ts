import type {
    ChartBar,
    DashboardContext,
    DashboardPeriod,
    DashboardWidget,
    ListRow,
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

type Context = DashboardContext<typeof sites>;
type Overview = OverviewContext<typeof sites>;
type SiteKey = Context['site']['key'];
type Shop = Exclude<SiteKey, 'group'>;

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
 * How busy each weekday is, Sunday first: the UK sells most at the Sunday
 * market, Norway on Saturdays, and the group's site is read on weekdays.
 */
const WEEK: Record<SiteKey, readonly number[]> = {
    group: [0.42, 1.12, 1.18, 1.14, 1.08, 0.94, 0.38],
    uk: [1.62, 0.86, 0.82, 0.88, 0.94, 1.08, 1.3],
    norway: [1.1, 0.88, 0.84, 0.9, 0.96, 1.12, 1.66],
};

const VISITORS: Record<SiteKey, number> = {
    group: 670,
    uk: 2010,
    norway: 1750,
};

/**
 * Each shop's campaign, every four weeks from its first day: Norway's
 * newsletter goes out on a Tuesday, and the UK posts its offer on a Thursday.
 * `lift` is the extra share of visitors on the day and the two after.
 */
const CAMPAIGNS: Record<Shop, { first: number; lift: readonly number[] }> = {
    norway: {
        first: Date.UTC(2026, 9, 27),
        lift: [0.95, 0.38, 0.12],
    },
    uk: {
        first: Date.UTC(2026, 9, 29),
        lift: [0.8, 0.3, 0.1],
    },
};

const CAMPAIGN_EVERY = 28;

/**
 * Visitors grow a little each day, so most periods beat the one before.
 */
const GROWTH_FROM = Date.UTC(2026, 0, 1);
const GROWTH_PER_DAY = 0.0012;

/**
 * The share of visitors who order.
 */
const RATE: Record<Shop, number> = {
    uk: 0.0135,
    norway: 0.021,
};

/**
 * The average order, in the shop's own money.
 */
const BASKET: Record<Shop, number> = {
    uk: 61,
    norway: 640,
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

const noise = (name: string, site: SiteKey, day: Day): number => fractionOf(`${name}:${site}:${dayKey(day.start)}`);

const isShop = (site: SiteKey): site is Shop => site !== 'group';

/**
 * The share of visitors a shop's campaign adds on a day, 0 on most.
 */
const liftOn = (site: SiteKey, day: Day): number => {
    if (!isShop(site)) return 0;
    const campaign = CAMPAIGNS[site];
    const since = Math.round((day.start.getTime() - campaign.first) / DAY);
    const inCycle = ((since % CAMPAIGN_EVERY) + CAMPAIGN_EVERY) % CAMPAIGN_EVERY;
    return campaign.lift[inCycle] ?? 0;
};

const visitorsOn = (site: SiteKey, day: Day): number =>
    VISITORS[site] *
    (WEEK[site][day.start.getUTCDay()] ?? 1) *
    (1 + ((day.start.getTime() - GROWTH_FROM) / DAY) * GROWTH_PER_DAY) *
    (0.9 + noise('visitors', site, day) * 0.2) *
    (1 + liftOn(site, day)) *
    day.elapsed;

/**
 * Orders: a campaign's visitors buy more readily than the rest.
 */
const ordersOn = (shop: Shop, day: Day): number => {
    const lift = liftOn(shop, day);
    const visitors = visitorsOn(shop, day);
    const extra = (visitors * lift) / (1 + lift);
    return (visitors - extra + extra * 1.6) * RATE[shop] * (0.88 + noise('orders', shop, day) * 0.24);
};

const revenueOn = (shop: Shop, day: Day): number => ordersOn(shop, day) * BASKET[shop] * (0.92 + noise('basket', shop, day) * 0.16);

const kronerOf = (shop: Shop, amount: number): number => (shop === 'uk' ? amount * KRONER_PER_POUND : amount);

const sum = (days: readonly Day[], metric: (day: Day) => number): number => days.reduce((total, day) => total + metric(day), 0);

/**
 * A metric over the period, how far it moved since the period before, and
 * its value each day for the small line beside it.
 */
const counted = (period: DashboardPeriod, metric: (day: Day) => number) => {
    const days = daysOf(period);
    const total = sum(days, metric);
    const before = sum(daysOf(period.previous), metric);
    return {
        total,
        change: (total - before) / before,
        trend: days.map((day) => Math.round(metric(day))),
    };
};

const count = new Intl.NumberFormat('en-GB');

const percent = new Intl.NumberFormat('en-GB', {
    style: 'percent',
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
});

const kroner = (amount: number): string => `${new Intl.NumberFormat('nb-NO').format(Math.round(amount))} kr`;

const pounds = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
});

const money = (shop: Shop, amount: number): string => (shop === 'uk' ? pounds.format(amount) : kroner(amount));

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

const shopsOf = (shown: Overview['sites']): Shop[] => shown.map((site) => site.key).filter(isShop);

// A site's dashboard

export const visitors = ({ site, period }: Context): StatValue => {
    const { total, change, trend } = counted(period, (day) => visitorsOn(site.key, day));
    return {
        value: count.format(Math.round(total)),
        change,
        trend,
    };
};

export const revenue = ({ site, period }: Context): StatValue => {
    if (!isShop(site.key)) return '–';
    const shop = site.key;
    const { total, change, trend } = counted(period, (day) => revenueOn(shop, day));
    return {
        value: money(shop, total),
        change,
        trend,
    };
};

export const orders = ({ site, period }: Context): StatValue => {
    if (!isShop(site.key)) return '–';
    const shop = site.key;
    const { total, change, trend } = counted(period, (day) => ordersOn(shop, day));
    const revenueTotal = sum(daysOf(period), (day) => revenueOn(shop, day));
    return {
        value: count.format(Math.round(total)),
        detail: `${money(shop, revenueTotal / total)} average order`,
        change,
        trend,
    };
};

/**
 * The UK's workshops still to come, from the events the demo seeds. Bookings
 * open six weeks before, and the wreath evening sells out first.
 */
const WORKSHOPS = [
    {
        title: 'Repotting without the mess',
        date: Date.UTC(2026, 10, 14),
        seats: 12,
        demand: 0.95,
    },
    {
        title: 'Houseplants through the winter',
        date: Date.UTC(2026, 10, 28),
        seats: 30,
        demand: 0.8,
    },
    {
        title: 'Wreath evening',
        date: Date.UTC(2026, 11, 10),
        seats: 16,
        demand: 1.2,
    },
];

const BOOKINGS_OPEN = 42;

/**
 * The workshops still to come at a moment, with the seats booked by then.
 */
const bookedAt = (moment: Date) =>
    WORKSHOPS.filter((workshop) => workshop.date > moment.getTime()).map((workshop) => {
        const until = (workshop.date - moment.getTime()) / DAY;
        const progress = Math.min(1, Math.max(0, 1 - until / BOOKINGS_OPEN));
        return {
            ...workshop,
            booked: Math.min(workshop.seats, Math.round(workshop.seats * (0.25 + 0.75 * progress ** 0.6) * workshop.demand)),
        };
    });

export const workshopBookings = ({ period }: Context): StatValue => {
    const now = bookedAt(period.to);
    const booked = now.reduce((total, workshop) => total + workshop.booked, 0);
    const before = bookedAt(period.from)
        .filter((workshop) => now.some((upcoming) => upcoming.title === workshop.title))
        .reduce((total, workshop) => total + workshop.booked, 0);
    return {
        value: count.format(booked),
        detail: `${now.length} workshops coming up`,
        change: (booked - before) / before,
    };
};

const workshopDay = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
});

export const workshops = ({ period }: Context): ListRow[] =>
    bookedAt(period.to).map((workshop) => {
        const left = workshop.seats - workshop.booked;
        return {
            label: workshop.title,
            detail: `${workshopDay.format(new Date(workshop.date))} · ${left === 0 ? 'Full' : left === 1 ? '1 seat left' : `${left} seats left`}`,
            value: workshop.booked,
            formatted: `${workshop.booked} of ${workshop.seats}`,
            of: workshop.seats,
        };
    });

const PAGES: Record<SiteKey, ReadonlyArray<{ key: string; label: string; path: string; weight: number }>> = {
    group: [
        {
            key: 'front',
            label: 'Front page',
            path: '/',
            weight: 0.34,
        },
        {
            key: 'team',
            label: 'Team',
            path: '/team',
            weight: 0.21,
        },
        {
            key: 'about',
            label: 'About',
            path: '/about',
            weight: 0.18,
        },
        {
            key: 'offices',
            label: 'Offices',
            path: '/offices',
            weight: 0.15,
        },
        {
            key: 'privacy',
            label: 'Privacy policy',
            path: '/privacy',
            weight: 0.04,
        },
    ],
    uk: [
        {
            key: 'front',
            label: 'Front page',
            path: '/',
            weight: 0.22,
        },
        {
            key: 'monstera',
            label: 'Monstera deliciosa',
            path: '/plants/monstera-deliciosa',
            weight: 0.09,
        },
        {
            key: 'events',
            label: 'Events',
            path: '/events',
            weight: 0.08,
        },
        {
            key: 'dark-flat',
            label: 'Five plants for a dark flat',
            path: '/guides/plants-for-a-dark-flat',
            weight: 0.07,
        },
        {
            key: 'plants',
            label: 'All plants',
            path: '/plants',
            weight: 0.065,
        },
        {
            key: 'offices',
            label: 'Visit us',
            path: '/offices',
            weight: 0.04,
        },
    ],
    norway: [
        {
            key: 'front',
            label: 'Forside',
            path: '/',
            weight: 0.21,
        },
        {
            key: 'plants',
            label: 'Alle planter',
            path: '/planter',
            weight: 0.1,
        },
        {
            key: 'poinsettia',
            label: 'Julestjerne',
            path: '/planter/julestjerne',
            weight: 0.085,
        },
        {
            key: 'winter',
            label: 'Slik overvintrer du stueplanter',
            path: '/guider/overvintring',
            weight: 0.07,
        },
        {
            key: 'monstera',
            label: 'Monstera deliciosa',
            path: '/planter/monstera',
            weight: 0.06,
        },
        {
            key: 'offices',
            label: 'Butikkene våre',
            path: '/offices',
            weight: 0.035,
        },
    ],
};

/**
 * Each page's share of a site's visitors, nudged a little each day, with how
 * far it moved since the period before.
 */
const pagesOf = (site: SiteKey, period: DashboardPeriod) =>
    PAGES[site]
        .map((page) => {
            const { total, change } = counted(
                period,
                (day) => visitorsOn(site, day) * page.weight * (0.82 + noise(page.key, site, day) * 0.36)
            );
            return {
                ...page,
                total,
                change,
            };
        })
        .sort((first, second) => second.total - first.total);

export const topPages = ({ site, period }: Context): ListRow[] =>
    pagesOf(site.key, period).map((page) => ({
        label: page.label,
        detail: page.path,
        value: Math.round(page.total),
        change: page.change,
    }));

// The overview, across the sites

export const dailyVisitors = ({ site, period }: Context): ChartBar[] =>
    daysOf(period).map((day) => ({
        label: labelOf(period, day),
        value: Math.round(visitorsOn(site.key, day)),
    }));

/**
 * A shop's revenue in kroner, so the sites compare in one currency.
 */
export const revenueInKroner = ({ site, period }: Context): StatValue => {
    if (!isShop(site.key)) return '–';
    const shop = site.key;
    return kroner(sum(daysOf(period), (day) => kronerOf(shop, revenueOn(shop, day))));
};

const conversionOf = (shops: readonly Shop[], window: { from: Date; to: Date }): number => {
    const days = daysOf(window);
    const ordered = shops.reduce((total, shop) => total + sum(days, (day) => ordersOn(shop, day)), 0);
    const visited = shops.reduce((total, shop) => total + sum(days, (day) => visitorsOn(shop, day)), 0);
    return visited === 0 ? 0 : ordered / visited;
};

export const conversion = ({ site, period }: Context): StatValue =>
    isShop(site.key) ? percent.format(conversionOf([site.key], period)) : '–';

export const visitorsAcrossSites = ({ sites: shown, period }: Overview): StatValue => {
    const { total, change, trend } = counted(period, (day) => shown.reduce((running, site) => running + visitorsOn(site.key, day), 0));
    return {
        value: count.format(Math.round(total)),
        change,
        trend,
    };
};

/**
 * The shops' revenue in kroner, the UK's at a fixed rate to the pound.
 */
export const revenueAcrossShops = ({ sites: shown, period }: Overview): StatValue => {
    const shops = shopsOf(shown);
    if (shops.length === 0) return '–';
    const { total, change, trend } = counted(period, (day) =>
        shops.reduce((running, shop) => running + kronerOf(shop, revenueOn(shop, day)), 0)
    );
    return {
        value: kroner(total),
        change,
        trend,
    };
};

export const ordersAcrossShops = ({ sites: shown, period }: Overview): StatValue => {
    const shops = shopsOf(shown);
    const { total, change, trend } = counted(period, (day) => shops.reduce((running, shop) => running + ordersOn(shop, day), 0));
    return {
        value: count.format(Math.round(total)),
        detail: `${percent.format(conversionOf(shops, period))} of visitors ordered`,
        change,
        trend,
    };
};

export const conversionAcrossShops = ({ sites: shown, period }: Overview): StatValue => {
    const shops = shopsOf(shown);
    return shops.length === 0 ? '–' : percent.format(conversionOf(shops, period));
};

export const topPagesAcrossSites = ({ sites: shown, period }: Overview): ListRow[] =>
    shown
        .flatMap((site) =>
            pagesOf(site.key, period).map((page) => ({
                label: page.label,
                site: site.key,
                value: Math.round(page.total),
            }))
        )
        .sort((first, second) => second.value - first.value)
        .slice(0, 7);

/**
 * Each site's dashboard: its totals, the pages people read, the UK's
 * workshops, and the reviews waiting.
 */
export const dashboard: DashboardWidget<typeof sites>[] = [
    {
        type: 'stat',
        label: 'Visitors',
        value: visitors,
    },
    {
        type: 'stat',
        label: 'Revenue',
        value: revenue,
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
        type: 'waiting',
        sites: ['group', 'norway'],
    },
    {
        type: 'list',
        label: 'Top pages',
        columns: {
            label: 'Page',
            value: 'Visitors',
        },
        data: topPages,
    },
    {
        type: 'list',
        label: 'Workshops',
        columns: {
            label: 'Workshop',
            value: 'Booked',
        },
        data: workshops,
        sites: ['uk'],
    },
    {
        type: 'reviews',
    },
];

/**
 * What an admin over every site opens: the group's totals, the sites side by
 * side, the pages people read across them, and the reviews waiting.
 */
export const overview: OverviewWidget<typeof sites>[] = [
    {
        type: 'stat',
        label: 'Visitors',
        value: visitorsAcrossSites,
    },
    {
        type: 'stat',
        label: 'Revenue',
        value: revenueAcrossShops,
    },
    {
        type: 'stat',
        label: 'Orders',
        value: ordersAcrossShops,
    },
    {
        type: 'waiting',
    },
    {
        type: 'sites',
        chart: {
            label: 'Week',
            data: dailyVisitors,
        },
        stats: [
            {
                label: 'Visitors',
                value: visitors,
                total: visitorsAcrossSites,
            },
            {
                label: 'Revenue',
                value: revenueInKroner,
                total: revenueAcrossShops,
                sites: ['uk', 'norway'],
            },
            {
                label: 'Conversion',
                value: conversion,
                total: conversionAcrossShops,
                sites: ['uk', 'norway'],
            },
        ],
    },
    {
        type: 'list',
        label: 'Top pages',
        columns: {
            label: 'Page',
            value: 'Visitors',
        },
        data: topPagesAcrossSites,
    },
    {
        type: 'reviews',
    },
];
