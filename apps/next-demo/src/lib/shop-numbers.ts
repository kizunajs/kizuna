/**
 * The shop's numbers, made up. The demo keeps no orders, so each day's and
 * each hour's figures come from its date: the same window always gives the
 * same numbers, and a reload never changes them.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const AVERAGE_ORDER = 420;

/**
 * The first day the shop counts subscribers from.
 */
const OPENING = Date.UTC(2025, 0, 1);

/**
 * How the day's orders spread over its hours, quiet at night and busiest in
 * the evening, when people order from the sofa.
 */
const HOURLY_WEIGHTS = [1, 0.5, 0.3, 0.2, 0.2, 0.4, 1, 2, 3, 4, 4.5, 5, 5.5, 5, 4.5, 4.5, 5, 6, 7, 8, 7.5, 6, 4, 2];

const WEIGHT_TOTAL = HOURLY_WEIGHTS.reduce((total, weight) => total + weight, 0);

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

const startOfDay = (date: Date): Date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const startOfHour = (date: Date): Date => new Date(Math.floor(date.getTime() / HOUR) * HOUR);

const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

const hourKey = (date: Date): string => date.toISOString().slice(0, 13);

/**
 * One hour or one day of a window, and how much of it had passed when the
 * window ended: 1 for every bucket but the last.
 */
export interface Bucket {
    start: Date;
    unit: 'hour' | 'day';
    elapsed: number;
}

const bucketsBetween = (from: Date, to: Date, unit: Bucket['unit']): Bucket[] => {
    const length = unit === 'hour' ? HOUR : DAY;
    const last = (unit === 'hour' ? startOfHour(to) : startOfDay(to)).getTime();
    const count = Math.max(1, Math.round((to.getTime() - from.getTime()) / length));
    return Array.from(
        {
            length: count,
        },
        (_, index) => {
            const start = last - (count - 1 - index) * length;
            return {
                start: new Date(start),
                unit,
                elapsed: index === count - 1 ? Math.min(1, (to.getTime() - start) / length) : 1,
            };
        }
    );
};

/**
 * The hours of a window, oldest first, ending with the hour `to` falls in.
 */
export const hoursBetween = (from: Date, to: Date): Bucket[] => bucketsBetween(from, to, 'hour');

/**
 * The days of a window, oldest first, ending with the day `to` falls in.
 */
export const daysBetween = (from: Date, to: Date): Bucket[] => bucketsBetween(from, to, 'day');

/**
 * A whole day's orders. Weekends sell more, and every day varies a little.
 */
const ordersOnDay = (date: Date): number => {
    const weekday = startOfDay(date).getUTCDay();
    const base = weekday === 0 || weekday === 6 ? 46 : 34;
    return base + fractionOf(`orders:${dayKey(date)}`) * 14;
};

const shareOfHour = (date: Date): number =>
    ((HOURLY_WEIGHTS[date.getUTCHours()] ?? 0) / WEIGHT_TOTAL) * (0.85 + fractionOf(`hour:${hourKey(date)}`) * 0.3);

const scaled = (bucket: Bucket, wholeDay: (day: Date) => number): number =>
    (bucket.unit === 'day' ? wholeDay(bucket.start) : wholeDay(bucket.start) * shareOfHour(bucket.start)) * bucket.elapsed;

export const ordersIn = (bucket: Bucket): number => scaled(bucket, ordersOnDay);

export const revenueIn = (bucket: Bucket): number =>
    scaled(bucket, (day) => ordersOnDay(day) * AVERAGE_ORDER * (0.85 + fractionOf(`basket:${dayKey(day)}`) * 0.3));

export const visitorsIn = (bucket: Bucket): number =>
    scaled(bucket, (day) => ordersOnDay(day) * 31 + fractionOf(`visitors:${dayKey(day)}`) * 240);

export const newSubscribersIn = (bucket: Bucket): number => scaled(bucket, (day) => 2 + fractionOf(`subscribers:${dayKey(day)}`) * 5);

/**
 * Everyone on the newsletter list at `date`.
 */
export const subscribersAt = (date: Date): number => {
    const days = Math.max(0, Math.floor((startOfDay(date).getTime() - OPENING) / DAY));
    return 1180 + Math.floor(days * 4.5);
};

/**
 * A metric summed over a window's buckets.
 */
export const total = (buckets: Bucket[], metric: (bucket: Bucket) => number): number =>
    buckets.reduce((sum, bucket) => sum + metric(bucket), 0);

/**
 * A metric's running total over a window's buckets, one value per bucket.
 */
export const runningTotal = (buckets: Bucket[], metric: (bucket: Bucket) => number): number[] => {
    let sum = 0;
    return buckets.map((bucket) => {
        sum += metric(bucket);
        return sum;
    });
};
