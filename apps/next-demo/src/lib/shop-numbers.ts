/**
 * The shop's numbers, made up. The demo keeps no orders, so each day's figures
 * come from its date: the same day always gives the same numbers, and a
 * reload never changes them.
 */

const DAY = 24 * 60 * 60 * 1000;

/**
 * The first day the shop counts subscribers from.
 */
const OPENING = Date.UTC(2025, 0, 1);

const AVERAGE_ORDER = 420;

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

const keyOf = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * The days before `date`, oldest first, ending with `date` itself.
 */
export const daysUpTo = (date: Date, count: number): Date[] => {
    const end = startOfDay(date).getTime();
    return Array.from(
        {
            length: count,
        },
        (_, index) => new Date(end - (count - 1 - index) * DAY)
    );
};

/**
 * A whole day's orders. Weekends sell more, and every day varies a little.
 */
export const ordersOn = (date: Date): number => {
    const weekday = startOfDay(date).getUTCDay();
    const base = weekday === 0 || weekday === 6 ? 46 : 34;
    return Math.round(base + fractionOf(`orders:${keyOf(date)}`) * 14);
};

/**
 * Orders so far today, growing through the day toward the whole day's count.
 */
export const ordersToday = (now: Date): number => {
    const elapsed = (now.getTime() - startOfDay(now).getTime()) / DAY;
    return Math.round(ordersOn(now) * elapsed);
};

export const revenueOn = (date: Date): number =>
    Math.round(ordersOn(date) * AVERAGE_ORDER * (0.85 + fractionOf(`basket:${keyOf(date)}`) * 0.3));

/**
 * Revenue over the seven days that end with `date`.
 */
export const revenueForWeek = (date: Date): number => daysUpTo(date, 7).reduce((total, day) => total + revenueOn(day), 0);

export const visitorsOn = (date: Date): number => Math.round(ordersOn(date) * 31 + fractionOf(`visitors:${keyOf(date)}`) * 240);

export const subscribersOn = (date: Date): number => {
    const days = Math.max(0, Math.floor((startOfDay(date).getTime() - OPENING) / DAY));
    return 1180 + Math.floor(days * 3.2 + fractionOf(`subscribers:${keyOf(date)}`) * 6);
};

export const daysBefore = (date: Date, count: number): Date => new Date(startOfDay(date).getTime() - count * DAY);
