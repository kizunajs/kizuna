import type {
    ChartBar,
    DashboardContext,
    DashboardPeriod,
    DashboardWidget,
    FunnelStep,
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

const SHOPS: readonly Shop[] = ['uk', 'norway'];

const LABELS: Record<SiteKey, string> = {
    group: 'Hagen Group',
    uk: 'Hagen UK',
    norway: 'Hagen Norge',
};

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

const SESSIONS: Record<SiteKey, number> = {
    group: 820,
    uk: 2650,
    norway: 2300,
};

/**
 * Each site's campaign, every four weeks from its first day: Norway's
 * newsletter goes out on a Tuesday, and the UK posts its offer on a Thursday.
 * `lift` is the extra share of sessions on the day and the two after.
 */
const CAMPAIGNS: Record<Shop, { first: number; channel: Channel; lift: readonly number[] }> = {
    norway: {
        first: Date.UTC(2026, 9, 27),
        channel: 'newsletter',
        lift: [0.95, 0.38, 0.12],
    },
    uk: {
        first: Date.UTC(2026, 9, 29),
        channel: 'social',
        lift: [0.8, 0.3, 0.1],
    },
};

const CAMPAIGN_EVERY = 28;

/**
 * Sessions grow a little each day, so most periods beat the one before.
 */
const GROWTH_FROM = Date.UTC(2026, 0, 1);
const GROWTH_PER_DAY = 0.0012;

const RATE: Record<Shop, number> = {
    uk: 0.0155,
    norway: 0.0228,
};

/**
 * The average order, in the shop's own money.
 */
const BASKET: Record<Shop, number> = {
    uk: 46,
    norway: 620,
};

const BOUNCE: Record<SiteKey, number> = {
    group: 0.58,
    uk: 0.46,
    norway: 0.43,
};

/**
 * Seconds a visitor spends on a page.
 */
const TIME_ON_PAGE: Record<SiteKey, number> = {
    group: 52,
    uk: 74,
    norway: 81,
};

const RETURNING: Record<SiteKey, number> = {
    group: 0.22,
    uk: 0.36,
    norway: 0.41,
};

const PAGES_PER_SESSION: Record<SiteKey, number> = {
    group: 2.1,
    uk: 3.2,
    norway: 3.5,
};

/**
 * Seconds until the largest image or block of text shows, for three visits
 * in four.
 */
const PAGE_LOAD: Record<SiteKey, number> = {
    group: 1.3,
    uk: 2.4,
    norway: 1.8,
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

/**
 * The share of sessions a site's campaign adds on a day, 0 on most.
 */
const liftOn = (site: SiteKey, day: Day): number => {
    if (site === 'group') return 0;
    const campaign = CAMPAIGNS[site];
    const since = Math.round((day.start.getTime() - campaign.first) / DAY);
    const inCycle = ((since % CAMPAIGN_EVERY) + CAMPAIGN_EVERY) % CAMPAIGN_EVERY;
    return campaign.lift[inCycle] ?? 0;
};

const sessionsOn = (site: SiteKey, day: Day): number =>
    SESSIONS[site] *
    (WEEK[site][day.start.getUTCDay()] ?? 1) *
    (1 + ((day.start.getTime() - GROWTH_FROM) / DAY) * GROWTH_PER_DAY) *
    (0.9 + noise('sessions', site, day) * 0.2) *
    (1 + liftOn(site, day)) *
    day.elapsed;

/**
 * The sessions a campaign brought on a day.
 */
const campaignSessionsOn = (site: SiteKey, day: Day): number => {
    const lift = liftOn(site, day);
    return (sessionsOn(site, day) * lift) / (1 + lift);
};

/**
 * Orders: a campaign's visitors buy more readily than the rest.
 */
const ordersOn = (shop: Shop, day: Day): number => {
    const extra = campaignSessionsOn(shop, day);
    const usual = sessionsOn(shop, day) - extra;
    return (usual + extra * 1.6) * RATE[shop] * (0.88 + noise('orders', shop, day) * 0.24);
};

const revenueOn = (shop: Shop, day: Day): number => ordersOn(shop, day) * BASKET[shop] * (0.92 + noise('basket', shop, day) * 0.16);

const kronerOf = (shop: Shop, amount: number): number => (shop === 'uk' ? amount * KRONER_PER_POUND : amount);

const visitorsOn = (site: SiteKey, day: Day): number => sessionsOn(site, day) * (site === 'group' ? 0.82 : 0.76);

const sum = (days: readonly Day[], metric: (day: Day) => number): number => days.reduce((total, day) => total + metric(day), 0);

/**
 * A metric over the period, and how far it moved since the period before.
 */
const counted = (period: DashboardPeriod, metric: (day: Day) => number) => {
    const total = sum(daysOf(period), metric);
    const before = sum(daysOf(period.previous), metric);
    return {
        total,
        before,
        change: (total - before) / before,
    };
};

/**
 * A rate over the period, each day weighed by its sessions.
 */
const weighed = (period: DashboardPeriod | { from: Date; to: Date }, site: SiteKey, rate: (day: Day) => number): number => {
    const days = daysOf(period);
    return sum(days, (day) => rate(day) * sessionsOn(site, day)) / sum(days, (day) => sessionsOn(site, day));
};

const bounceOn = (site: SiteKey, day: Day): number =>
    BOUNCE[site] + (noise('bounce', site, day) - 0.5) * 0.06 + (liftOn(site, day) / (1 + liftOn(site, day))) * 0.12;

const returningOn = (site: SiteKey, day: Day): number =>
    RETURNING[site] * (0.94 + noise('returning', site, day) * 0.12) * (1 - liftOn(site, day) * 0.2);

const count = new Intl.NumberFormat('en-GB');

const percent = new Intl.NumberFormat('en-GB', {
    style: 'percent',
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
});

const wholePercent = new Intl.NumberFormat('en-GB', {
    style: 'percent',
    maximumFractionDigits: 0,
});

const kroner = (amount: number): string => `${new Intl.NumberFormat('nb-NO').format(Math.round(amount))} kr`;

const pounds = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
});

const money = (shop: Shop, amount: number): string => (shop === 'uk' ? pounds.format(amount) : kroner(amount));

const duration = (seconds: number): string => {
    const rounded = Math.round(seconds);
    return rounded < 60 ? `${rounded}s` : `${Math.floor(rounded / 60)}m ${rounded % 60}s`;
};

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

const isShop = (site: SiteKey): site is Shop => site !== 'group';

/**
 * A metric per day of the period, beside the same day of the period before.
 */
const perDay = (period: DashboardPeriod, metric: (day: Day) => number): ChartBar[] => {
    const before = daysOf(period.previous);
    return daysOf(period).map((day, index) => ({
        label: labelOf(period, day),
        value: Math.round(metric(day)),
        previous: before[index] === undefined ? undefined : Math.round(metric(before[index]!)),
    }));
};

/**
 * Items of a site ranked by their share of a daily total, each day nudging
 * every share a little, with how far each moved since the period before.
 */
const ranked = <Item extends { key: string; weight: number }>(
    items: readonly Item[],
    site: SiteKey,
    period: DashboardPeriod,
    total: (day: Day) => number
): Array<Item & { total: number; change: number }> =>
    items
        .map((item) => {
            const metric = (day: Day) => total(day) * item.weight * (0.82 + noise(item.key, site, day) * 0.36);
            const { total: itemTotal, change } = counted(period, metric);
            return {
                ...item,
                total: itemTotal,
                change,
            };
        })
        .sort((first, second) => second.total - first.total);

// Stats

export const visitors = ({ site, period }: Context): StatValue => {
    const { total, change } = counted(period, (day) => visitorsOn(site.key, day));
    return {
        value: count.format(Math.round(total)),
        detail: `${wholePercent.format(weighed(period, site.key, (day) => returningOn(site.key, day)))} returning`,
        change,
    };
};

export const sessions = ({ site, period }: Context): StatValue => {
    const { total, change } = counted(period, (day) => sessionsOn(site.key, day));
    return {
        value: count.format(Math.round(total)),
        detail: `${PAGES_PER_SESSION[site.key].toFixed(1)} pages each`,
        change,
    };
};

export const bounceRate = ({ site, period }: Context): StatValue => ({
    value: percent.format(weighed(period, site.key, (day) => bounceOn(site.key, day))),
    detail: `${percent.format(weighed(period.previous, site.key, (day) => bounceOn(site.key, day)))} the period before`,
});

export const timeOnPage = ({ site, period }: Context): StatValue => ({
    value: duration(weighed(period, site.key, (day) => TIME_ON_PAGE[site.key] * (0.9 + noise('time', site.key, day) * 0.2))),
    detail: `${duration(weighed(period.previous, site.key, (day) => TIME_ON_PAGE[site.key] * (0.9 + noise('time', site.key, day) * 0.2)))} the period before`,
});

export const revenue = ({ site, period }: Context): StatValue => {
    if (!isShop(site.key)) return '–';
    const shop = site.key;
    const { total, change } = counted(period, (day) => revenueOn(shop, day));
    const orders = sum(daysOf(period), (day) => ordersOn(shop, day));
    return {
        value: money(shop, total),
        detail: `${count.format(Math.round(orders))} orders`,
        change,
    };
};

export const orders = ({ site, period }: Context): StatValue => {
    if (!isShop(site.key)) return '–';
    const shop = site.key;
    const { total, change } = counted(period, (day) => ordersOn(shop, day));
    const revenueTotal = sum(daysOf(period), (day) => revenueOn(shop, day));
    return {
        value: count.format(Math.round(total)),
        detail: `${money(shop, revenueTotal / total)} average order`,
        change,
    };
};

const conversionOf = (shops: readonly Shop[], window: { from: Date; to: Date }): number => {
    const days = daysOf(window);
    const ordered = shops.reduce((total, shop) => total + sum(days, (day) => ordersOn(shop, day)), 0);
    const visited = shops.reduce((total, shop) => total + sum(days, (day) => sessionsOn(shop, day)), 0);
    return ordered / visited;
};

export const conversion = ({ site, period }: Context): StatValue => {
    if (!isShop(site.key)) return '–';
    const rate = conversionOf([site.key], period);
    const before = conversionOf([site.key], period.previous);
    return {
        value: percent.format(rate),
        change: (rate - before) / before,
    };
};

const signupsOn = (shop: Shop, day: Day): number =>
    (sessionsOn(shop, day) + campaignSessionsOn(shop, day) * 2) * 0.0042 * (0.8 + noise('signups', shop, day) * 0.4);

export const newsletterSignups = ({ site, period }: Context): StatValue => {
    if (!isShop(site.key)) return '–';
    const shop = site.key;
    const { total, change } = counted(period, (day) => signupsOn(shop, day));
    return {
        value: count.format(Math.round(total)),
        change,
    };
};

export const returningVisitors = ({ site, period }: Context): StatValue => {
    const share = weighed(period, site.key, (day) => returningOn(site.key, day));
    const before = weighed(period.previous, site.key, (day) => returningOn(site.key, day));
    return {
        value: wholePercent.format(share),
        change: (share - before) / before,
    };
};

export const pageLoad = ({ site, period }: Context): StatValue =>
    `${(PAGE_LOAD[site.key] * (0.94 + fractionOf(`load:${site.key}:${dayKey(period.to)}`) * 0.12)).toFixed(1)} s`;

/**
 * A shop's revenue in kroner, so the sites compare on one scale.
 */
export const revenueInKroner = ({ site, period }: Context): StatValue => {
    if (!isShop(site.key)) return '–';
    const shop = site.key;
    const { total, change } = counted(period, (day) => kronerOf(shop, revenueOn(shop, day)));
    return {
        value: kroner(total),
        change,
    };
};

// Charts

export const visitorsPerDay = ({ site, period }: Context): ChartBar[] => perDay(period, (day) => visitorsOn(site.key, day));

export const revenuePerDay = ({ site, period }: Context): ChartBar[] => {
    if (!isShop(site.key)) return [];
    const shop = site.key;
    return perDay(period, (day) => revenueOn(shop, day));
};

/**
 * Visitors per day without the period before, for the sites side by side.
 */
export const dailyVisitors = ({ site, period }: Context): ChartBar[] =>
    daysOf(period).map((day) => ({
        label: labelOf(period, day),
        value: Math.round(visitorsOn(site.key, day)),
    }));

// Lists

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

const pageViewsOn = (site: SiteKey, day: Day): number => sessionsOn(site, day) * PAGES_PER_SESSION[site];

export const topPages = ({ site, period }: Context): ListRow[] =>
    ranked(PAGES[site.key], site.key, period, (day) => pageViewsOn(site.key, day)).map((page) => ({
        label: page.label,
        detail: page.path,
        value: Math.round(page.total),
        change: page.change,
    }));

const REFERRERS: Record<SiteKey, ReadonlyArray<{ key: string; weight: number }>> = {
    group: [
        {
            key: 'hagen.example.co.uk',
            weight: 0.07,
        },
        {
            key: 'hagen.example.no',
            weight: 0.06,
        },
        {
            key: 'nordichandel.no',
            weight: 0.025,
        },
        {
            key: 'karrierestart.no',
            weight: 0.02,
        },
        {
            key: 'retailnordic.com',
            weight: 0.008,
        },
    ],
    uk: [
        {
            key: 'londonplantclub.org',
            weight: 0.045,
        },
        {
            key: 'flatliving.co.uk',
            weight: 0.032,
        },
        {
            key: 'urbanleaf-blog.co.uk',
            weight: 0.027,
        },
        {
            key: 'eastlondonmarkets.co.uk',
            weight: 0.022,
        },
        {
            key: 'houseplantforum.co.uk',
            weight: 0.014,
        },
    ],
    norway: [
        {
            key: 'planteprat.no',
            weight: 0.05,
        },
        {
            key: 'byhagen.no',
            weight: 0.034,
        },
        {
            key: 'osloplanteklubb.no',
            weight: 0.024,
        },
        {
            key: 'boligdrom.no',
            weight: 0.018,
        },
        {
            key: 'grønnefingre.no',
            weight: 0.012,
        },
    ],
};

export const referrers = ({ site, period }: Context): ListRow[] =>
    ranked(REFERRERS[site.key], site.key, period, (day) => sessionsOn(site.key, day)).map((referrer) => ({
        label: referrer.key,
        value: Math.round(referrer.total),
        change: referrer.change,
    }));

type Channel = 'search' | 'direct' | 'social' | 'newsletter' | 'referral';

const CHANNEL_LABELS: Record<Channel, string> = {
    search: 'Search',
    direct: 'Direct',
    social: 'Social',
    newsletter: 'Newsletter',
    referral: 'Referral',
};

/**
 * Where each site's everyday sessions come from. A campaign's sessions come
 * from its own channel on top.
 */
const CHANNELS: Record<SiteKey, Record<Channel, number>> = {
    group: {
        search: 0.38,
        direct: 0.34,
        social: 0.08,
        newsletter: 0.02,
        referral: 0.18,
    },
    uk: {
        search: 0.43,
        direct: 0.22,
        social: 0.14,
        newsletter: 0.06,
        referral: 0.15,
    },
    norway: {
        search: 0.41,
        direct: 0.25,
        social: 0.09,
        newsletter: 0.1,
        referral: 0.15,
    },
};

const channelSessionsOn = (site: SiteKey, channel: Channel, day: Day): number => {
    const extra = campaignSessionsOn(site, day);
    const usual = (sessionsOn(site, day) - extra) * CHANNELS[site][channel] * (0.9 + noise(channel, site, day) * 0.2);
    return isShop(site) && CAMPAIGNS[site].channel === channel ? usual + extra : usual;
};

type Device = 'mobile' | 'desktop' | 'tablet';

const DEVICE_LABELS: Record<Device, string> = {
    mobile: 'Phone',
    desktop: 'Computer',
    tablet: 'Tablet',
};

const DEVICES: Record<SiteKey, Record<Device, number>> = {
    group: {
        mobile: 0.38,
        desktop: 0.57,
        tablet: 0.05,
    },
    uk: {
        mobile: 0.68,
        desktop: 0.26,
        tablet: 0.06,
    },
    norway: {
        mobile: 0.61,
        desktop: 0.31,
        tablet: 0.08,
    },
};

export const devices = ({ site, period }: Context): ListRow[] => {
    const shares = DEVICES[site.key];
    const totals = (Object.keys(DEVICE_LABELS) as Device[]).map((device) => ({
        label: DEVICE_LABELS[device],
        total: sum(daysOf(period), (day) => sessionsOn(site.key, day) * shares[device] * (0.94 + noise(device, site.key, day) * 0.12)),
    }));
    const all = totals.reduce((running, device) => running + device.total, 0);
    return totals
        .sort((first, second) => second.total - first.total)
        .map((device) => ({
            label: device.label,
            detail: `${count.format(Math.round(device.total))} sessions`,
            value: device.total / all,
            formatted: wholePercent.format(device.total / all),
            of: 1,
        }));
};

const SEARCHES: Record<
    Shop,
    { found: ReadonlyArray<{ key: string; weight: number }>; missing: ReadonlyArray<{ key: string; weight: number }> }
> = {
    uk: {
        found: [
            {
                key: 'monstera',
                weight: 0.11,
            },
            {
                key: 'pothos',
                weight: 0.07,
            },
            {
                key: 'repotting workshop',
                weight: 0.055,
            },
            {
                key: 'gift card',
                weight: 0.05,
            },
            {
                key: 'peace lily',
                weight: 0.04,
            },
            {
                key: 'delivery',
                weight: 0.035,
            },
        ],
        missing: [
            {
                key: 'olive tree',
                weight: 0.022,
            },
            {
                key: 'click and collect',
                weight: 0.017,
            },
            {
                key: 'christmas tree',
                weight: 0.015,
            },
            {
                key: 'grow light',
                weight: 0.011,
            },
            {
                key: 'bonsai',
                weight: 0.008,
            },
        ],
    },
    norway: {
        found: [
            {
                key: 'julestjerne',
                weight: 0.12,
            },
            {
                key: 'monstera',
                weight: 0.08,
            },
            {
                key: 'potte',
                weight: 0.06,
            },
            {
                key: 'gavekort',
                weight: 0.045,
            },
            {
                key: 'gjødsel',
                weight: 0.035,
            },
            {
                key: 'levering',
                weight: 0.03,
            },
        ],
        missing: [
            {
                key: 'juletre',
                weight: 0.024,
            },
            {
                key: 'hente i butikk',
                weight: 0.016,
            },
            {
                key: 'vekstlys',
                weight: 0.013,
            },
            {
                key: 'kaktusjord',
                weight: 0.009,
            },
            {
                key: 'bonsai',
                weight: 0.007,
            },
        ],
    },
};

const searchesOn = (shop: Shop, day: Day): number => sessionsOn(shop, day) * 0.09;

export const searchTerms = ({ site, period }: Context): ListRow[] => {
    if (!isShop(site.key)) return [];
    const shop = site.key;
    return ranked(SEARCHES[shop].found, shop, period, (day) => searchesOn(shop, day)).map((term) => ({
        label: term.key,
        value: Math.round(term.total),
        change: term.change,
    }));
};

export const searchesWithoutResults = ({ site, period }: Context): ListRow[] => {
    if (!isShop(site.key)) return [];
    const shop = site.key;
    return ranked(SEARCHES[shop].missing, shop, period, (day) => searchesOn(shop, day)).map((term) => ({
        label: term.key,
        value: Math.round(term.total),
        change: term.change,
    }));
};

const PRODUCTS: Record<Shop, ReadonlyArray<{ key: string; label: string; price: number; weight: number }>> = {
    uk: [
        {
            key: 'monstera',
            label: 'Monstera deliciosa, 80 cm',
            price: 48,
            weight: 0.16,
        },
        {
            key: 'pothos',
            label: "Pothos 'Marble Queen'",
            price: 18,
            weight: 0.21,
        },
        {
            key: 'fig',
            label: 'Fiddle-leaf fig, 120 cm',
            price: 85,
            weight: 0.06,
        },
        {
            key: 'pot',
            label: 'Glazed pot, sage, 18 cm',
            price: 22,
            weight: 0.14,
        },
        {
            key: 'lily',
            label: 'Peace lily',
            price: 24,
            weight: 0.1,
        },
        {
            key: 'snake',
            label: 'Snake plant',
            price: 28,
            weight: 0.08,
        },
    ],
    norway: [
        {
            key: 'poinsettia',
            label: 'Julestjerne',
            price: 199,
            weight: 0.24,
        },
        {
            key: 'monstera',
            label: 'Monstera deliciosa, 80 cm',
            price: 549,
            weight: 0.12,
        },
        {
            key: 'fig',
            label: 'Fiolinfiken, 120 cm',
            price: 899,
            weight: 0.05,
        },
        {
            key: 'pothos',
            label: 'Gullranke',
            price: 179,
            weight: 0.15,
        },
        {
            key: 'pot',
            label: 'Glasert potte, salvie',
            price: 249,
            weight: 0.13,
        },
        {
            key: 'lily',
            label: 'Fredslilje',
            price: 229,
            weight: 0.08,
        },
    ],
};

/**
 * Items in an order, on average.
 */
const ITEMS_PER_ORDER = 1.7;

export const topProducts = ({ site, period }: Context): ListRow[] => {
    if (!isShop(site.key)) return [];
    const shop = site.key;
    return ranked(
        PRODUCTS[shop].map((product) => ({
            ...product,
            weight: product.weight * product.price,
        })),
        shop,
        period,
        (day) => ordersOn(shop, day) * ITEMS_PER_ORDER
    )
        .slice(0, 5)
        .map((product) => ({
            label: product.label,
            detail: `${count.format(Math.round(product.total / product.price))} sold`,
            value: Math.round(product.total),
            formatted: money(shop, product.total),
            change: product.change,
        }));
};

const ARTICLES: Record<Shop, ReadonlyArray<{ key: string; label: string; path: string; weight: number }>> = {
    uk: [
        {
            key: 'dark-flat',
            label: 'Five plants for a dark flat',
            path: '/guides/plants-for-a-dark-flat',
            weight: 0.07,
        },
        {
            key: 'watering',
            label: 'How often to water a monstera',
            path: '/guides/watering-a-monstera',
            weight: 0.05,
        },
        {
            key: 'winter',
            label: 'Bringing plants through a London winter',
            path: '/guides/london-winter',
            weight: 0.042,
        },
        {
            key: 'pets',
            label: 'Plants that are safe for cats',
            path: '/guides/safe-for-cats',
            weight: 0.03,
        },
        {
            key: 'gnats',
            label: 'Getting rid of fungus gnats',
            path: '/guides/fungus-gnats',
            weight: 0.021,
        },
    ],
    norway: [
        {
            key: 'winter',
            label: 'Slik overvintrer du stueplanter',
            path: '/guider/overvintring',
            weight: 0.07,
        },
        {
            key: 'poinsettia',
            label: 'Julestjerne som varer til januar',
            path: '/guider/julestjerne',
            weight: 0.055,
        },
        {
            key: 'dark',
            label: 'Fem planter som tåler mørke rom',
            path: '/guider/morke-rom',
            weight: 0.04,
        },
        {
            key: 'repotting',
            label: 'Når bør du potte om?',
            path: '/guider/potte-om',
            weight: 0.028,
        },
        {
            key: 'pets',
            label: 'Giftfrie planter for katteeiere',
            path: '/guider/giftfrie-planter',
            weight: 0.02,
        },
    ],
};

export const articles = ({ site, period }: Context): ListRow[] => {
    if (!isShop(site.key)) return [];
    const shop = site.key;
    return ranked(ARTICLES[shop], shop, period, (day) => visitorsOn(shop, day)).map((article) => ({
        label: article.label,
        detail: article.path,
        value: Math.round(article.total),
        change: article.change,
    }));
};

/**
 * The UK's workshops still to come, from the events the demo seeds, with
 * the seats booked by the end of the period. Bookings open six weeks before.
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

const workshopDay = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
});

export const workshops = ({ period }: Context): ListRow[] =>
    WORKSHOPS.filter((workshop) => workshop.date > period.to.getTime()).map((workshop) => {
        const until = (workshop.date - period.to.getTime()) / DAY;
        const progress = Math.min(1, Math.max(0, 1 - until / BOOKINGS_OPEN));
        const booked = Math.min(workshop.seats, Math.round(workshop.seats * (0.25 + 0.75 * progress ** 0.6) * workshop.demand));
        const left = workshop.seats - booked;
        return {
            label: workshop.title,
            detail: `${workshopDay.format(new Date(workshop.date))} · ${left === 0 ? 'Full' : left === 1 ? '1 seat left' : `${left} seats left`}`,
            value: booked,
            formatted: `${booked} of ${workshop.seats}`,
            of: workshop.seats,
        };
    });

export const checkout = ({ site, period }: Context): FunnelStep[] => {
    if (!isShop(site.key)) return [];
    const shop = site.key;
    const days = daysOf(period);
    const visits = sum(days, (day) => sessionsOn(shop, day));
    const products = sum(days, (day) => sessionsOn(shop, day) * 0.52 * (0.95 + noise('product', shop, day) * 0.1));
    const carts = sum(days, (day) => sessionsOn(shop, day) * 0.52 * 0.16 * (0.92 + noise('cart', shop, day) * 0.16));
    const checkouts = sum(days, (day) => sessionsOn(shop, day) * 0.52 * 0.16 * 0.56 * (0.92 + noise('checkout', shop, day) * 0.16));
    const paid = sum(days, (day) => ordersOn(shop, day));
    return [
        {
            label: 'Visit',
            value: Math.round(visits),
        },
        {
            label: 'Product page',
            value: Math.round(products),
        },
        {
            label: 'Cart',
            value: Math.round(carts),
        },
        {
            label: 'Checkout',
            value: Math.round(checkouts),
        },
        {
            label: 'Paid',
            value: Math.round(paid),
        },
    ];
};

// The overview

export const visitorsAcrossSites = ({ sites: shown, period }: Overview): StatValue => {
    const { total, change } = counted(period, (day) => shown.reduce((running, site) => running + visitorsOn(site.key, day), 0));
    const days = daysOf(period);
    const returning =
        shown.reduce((running, site) => running + sum(days, (day) => visitorsOn(site.key, day) * returningOn(site.key, day)), 0) / total;
    return {
        value: count.format(Math.round(total)),
        detail: `${wholePercent.format(returning)} returning`,
        change,
    };
};

const groupRevenueOn = (day: Day): number => SHOPS.reduce((running, shop) => running + kronerOf(shop, revenueOn(shop, day)), 0);

/**
 * Both shops' revenue in kroner, the UK's at a fixed rate to the pound.
 */
export const revenueAcrossShops = ({ period }: Overview): StatValue => {
    const { total, change } = counted(period, groupRevenueOn);
    const ordered = SHOPS.reduce((running, shop) => running + sum(daysOf(period), (day) => ordersOn(shop, day)), 0);
    return {
        value: kroner(total),
        detail: `${count.format(Math.round(ordered))} orders`,
        change,
    };
};

export const conversionAcrossShops = ({ period }: Overview): StatValue => {
    const rate = conversionOf(SHOPS, period);
    const before = conversionOf(SHOPS, period.previous);
    return {
        value: percent.format(rate),
        detail: `${percent.format(conversionOf(['uk'], period))} in the UK, ${percent.format(conversionOf(['norway'], period))} in Norway`,
        change: (rate - before) / before,
    };
};

export const signupsAcrossShops = ({ period }: Overview): StatValue => {
    const { total, change } = counted(period, (day) => SHOPS.reduce((running, shop) => running + signupsOn(shop, day), 0));
    return {
        value: count.format(Math.round(total)),
        change,
    };
};

export const revenueAcrossShopsPerDay = ({ period }: Overview): ChartBar[] => perDay(period, groupRevenueOn);

export const channels = ({ sites: shown, period }: Overview): ListRow[] =>
    (Object.keys(CHANNEL_LABELS) as Channel[])
        .map((channel) => {
            const { total, change } = counted(period, (day) =>
                shown.reduce((running, site) => running + channelSessionsOn(site.key, channel, day), 0)
            );
            return {
                label: CHANNEL_LABELS[channel],
                value: Math.round(total),
                change,
            };
        })
        .sort((first, second) => second.value - first.value);

export const topPagesAcrossSites = ({ sites: shown, period }: Overview): ListRow[] =>
    shown
        .flatMap((site) =>
            ranked(PAGES[site.key], site.key, period, (day) => pageViewsOn(site.key, day)).map((page) => ({
                label: page.label,
                detail: `${LABELS[site.key]} · ${page.path}`,
                value: Math.round(page.total),
                change: page.change,
            }))
        )
        .sort((first, second) => second.value - first.value)
        .slice(0, 7);

/**
 * Orders from visitors who read the article first, in kroner.
 */
export const contentThatSold = ({ period }: Overview): ListRow[] =>
    SHOPS.flatMap((shop) =>
        ranked(ARTICLES[shop], shop, period, (day) => visitorsOn(shop, day) * RATE[shop] * 1.4).map((article) => ({
            label: article.label,
            detail: `${LABELS[shop]} · ${count.format(Math.round(article.total))} orders`,
            value: kronerOf(shop, article.total * BASKET[shop]),
            formatted: kroner(kronerOf(shop, article.total * BASKET[shop])),
            change: article.change,
        }))
    )
        .sort((first, second) => second.value - first.value)
        .slice(0, 6);

/**
 * Each site's dashboard. The group's site sells nothing, so its dashboard
 * counts visits alone.
 */
export const dashboard: DashboardWidget<typeof sites>[] = [
    {
        type: 'stat',
        label: 'Visitors',
        value: visitors,
    },
    {
        type: 'stat',
        label: 'Sessions',
        value: sessions,
    },
    {
        type: 'stat',
        label: 'Bounce rate',
        value: bounceRate,
    },
    {
        type: 'stat',
        label: 'Time on page',
        value: timeOnPage,
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
        label: 'Conversion',
        value: conversion,
        sites: ['uk', 'norway'],
    },
    {
        type: 'stat',
        label: 'Newsletter signups',
        value: newsletterSignups,
        sites: ['uk', 'norway'],
    },
    {
        type: 'chart',
        label: 'Visitors per day',
        data: visitorsPerDay,
    },
    {
        type: 'chart',
        label: 'Revenue per day',
        style: 'line',
        data: revenuePerDay,
        sites: ['uk', 'norway'],
    },
    {
        type: 'funnel',
        label: 'Checkout',
        columns: {
            label: 'Step',
            value: 'Sessions',
        },
        data: checkout,
        sites: ['uk', 'norway'],
    },
    {
        type: 'list',
        label: 'Top products',
        columns: {
            label: 'Product',
            value: 'Revenue',
        },
        data: topProducts,
        sites: ['uk', 'norway'],
    },
    {
        type: 'list',
        label: 'Top pages',
        columns: {
            label: 'Page',
            value: 'Views',
        },
        data: topPages,
    },
    {
        type: 'list',
        label: 'Referrers',
        columns: {
            label: 'Site',
            value: 'Sessions',
        },
        data: referrers,
    },
    {
        type: 'list',
        label: 'Searches',
        columns: {
            label: 'Term',
            value: 'Searches',
        },
        data: searchTerms,
        sites: ['uk', 'norway'],
    },
    {
        type: 'list',
        label: 'Searches that found nothing',
        columns: {
            label: 'Term',
            value: 'Searches',
        },
        data: searchesWithoutResults,
        sites: ['uk', 'norway'],
    },
    {
        type: 'list',
        label: 'Articles that brought visitors',
        columns: {
            label: 'Article',
            value: 'Visitors',
        },
        data: articles,
        sites: ['uk', 'norway'],
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
        type: 'list',
        label: 'Devices',
        columns: {
            label: 'Device',
            value: 'Share',
        },
        data: devices,
    },
    {
        type: 'reviews',
    },
    {
        type: 'collections',
    },
];

/**
 * What an admin over every site opens: the group's numbers, the sites
 * compared on one scale, then what the CMS records across them.
 */
export const overview: OverviewWidget<typeof sites>[] = [
    {
        type: 'stat',
        label: 'Visitors',
        value: visitorsAcrossSites,
    },
    {
        type: 'stat',
        label: 'Revenue across shops',
        value: revenueAcrossShops,
    },
    {
        type: 'stat',
        label: 'Conversion',
        value: conversionAcrossShops,
    },
    {
        type: 'stat',
        label: 'Newsletter signups',
        value: signupsAcrossShops,
    },
    {
        type: 'sites',
        stats: [
            {
                label: 'Visitors',
                value: visitors,
            },
            {
                label: 'Revenue',
                value: revenueInKroner,
                sites: ['uk', 'norway'],
            },
            {
                label: 'Conversion',
                value: conversion,
                sites: ['uk', 'norway'],
            },
            {
                label: 'Returning',
                value: returningVisitors,
            },
            {
                label: 'Page load',
                value: pageLoad,
            },
        ],
        chart: {
            label: 'Visitors per day',
            data: dailyVisitors,
        },
    },
    {
        type: 'chart',
        label: 'Revenue per day',
        description: 'Both shops, in kr',
        style: 'line',
        data: revenueAcrossShopsPerDay,
    },
    {
        type: 'list',
        label: 'Traffic by channel',
        columns: {
            label: 'Channel',
            value: 'Sessions',
        },
        data: channels,
    },
    {
        type: 'list',
        label: 'Top pages',
        columns: {
            label: 'Page',
            value: 'Views',
        },
        data: topPagesAcrossSites,
    },
    {
        type: 'list',
        label: 'Content that drove sales',
        columns: {
            label: 'Article',
            value: 'Revenue',
        },
        data: contentThatSold,
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
