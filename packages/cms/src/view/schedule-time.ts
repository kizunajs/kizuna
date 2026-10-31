/**
 * Times as an editor picks and reads them: stored in UTC, shown in the
 * browser's own time zone with the zone named beside them.
 */

const two = (value: number): string => String(value).padStart(2, '0');

/**
 * A time's date and clock in the browser's zone, as a date and a time input
 * hold them: `2026-11-14` and `09:00`.
 */
export const localPartsOf = (iso: string): { date: string; time: string } => {
    const at = new Date(iso);
    return {
        date: `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`,
        time: `${two(at.getHours())}:${two(at.getMinutes())}`,
    };
};

/**
 * The UTC time a date and a clock picked in the browser's zone name, or
 * `undefined` while either is incomplete.
 */
export const isoOf = (date: string, time: string): string | undefined => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return undefined;
    const at = new Date(`${date}T${time}`);
    return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
};

/**
 * The browser's time zone as a short name on that date, like CET or BST.
 */
export const zoneNameOf = (iso: string): string =>
    new Intl.DateTimeFormat('en-GB', {
        timeZoneName: 'short',
    })
        .formatToParts(new Date(iso))
        .find((part) => part.type === 'timeZoneName')?.value ?? '';

/**
 * A time as the admin writes it, with its zone: `14 Nov 2026, 09:00 CET`.
 */
export const whenOf = (iso: string): string => {
    const at = new Date(iso);
    const date = new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(at);
    const time = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(at);
    return `${date}, ${time} ${zoneNameOf(iso)}`.trim();
};

/**
 * A day as Scheduled heads its rows: `Sat 14 Nov`, with the year when it is
 * not this one.
 */
export const dayOf = (iso: string, now = new Date()): string => {
    const at = new Date(iso);
    return new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        ...(at.getFullYear() === now.getFullYear()
            ? {}
            : {
                  year: 'numeric',
              }),
    })
        .format(at)
        .replace(',', '');
};

/**
 * A time of day with its zone: `09:00 CET`.
 */
export const clockOf = (iso: string): string =>
    `${new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(new Date(iso))} ${zoneNameOf(iso)}`.trim();

/**
 * Tomorrow at nine in the browser's zone, which Later starts on.
 */
export const defaultLaterOf = (now = new Date()): { date: string; time: string } => {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
    return localPartsOf(tomorrow.toISOString());
};
