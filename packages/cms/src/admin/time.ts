const DAY = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
});

const DAY_OF_YEAR = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
});

/**
 * When something last changed, as a day, with the year once it is not this
 * one.
 */
export const dayOf = (iso: string | null, now: Date = new Date()): string => {
    if (iso === null) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return (date.getFullYear() === now.getFullYear() ? DAY : DAY_OF_YEAR).format(date);
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY_LENGTH = 24 * HOUR;

/**
 * How long ago something happened, as a document's header says it: "just
 * now", "4 min ago", "2 hours ago", "yesterday", "3 days ago", and the day
 * itself after a week.
 */
export const relativeTimeOf = (iso: string, now: Date = new Date()): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const elapsed = Math.max(0, now.getTime() - date.getTime());
    if (elapsed < 45_000) return 'just now';
    const minutes = Math.max(1, Math.round(elapsed / MINUTE));
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(elapsed / HOUR);
    if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    const days = Math.round(elapsed / DAY_LENGTH);
    if (days <= 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    return `on ${dayOf(iso, now)}`;
};
