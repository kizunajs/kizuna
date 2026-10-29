/**
 * One version of a document as its history lists it.
 */
export interface VersionSummary {
    version: number;
    summary: string | null;
    createdAt: string;
    createdBy: string;
    published: boolean;
}

const SAVED_AT = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
});

const SAVED_AT_IN_YEAR = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

/**
 * When a version was saved, as a day and a time, with the year once it is
 * not this one.
 */
export const savedAtOf = (iso: string, today: Date = new Date()): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return (date.getFullYear() === today.getFullYear() ? SAVED_AT : SAVED_AT_IN_YEAR).format(date);
};
