const kroner = new Intl.NumberFormat('nb-NO', {
    style: 'currency',
    currency: 'NOK',
    maximumFractionDigits: 0,
});

const longDate = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
});

export const formatKroner = (amount: number): string => kroner.format(amount);

/**
 * A date the CMS stores as `2026-10-20`, written out as 20 October 2026.
 */
export const formatDate = (isoDate: string): string => longDate.format(new Date(`${isoDate}T00:00:00Z`));
