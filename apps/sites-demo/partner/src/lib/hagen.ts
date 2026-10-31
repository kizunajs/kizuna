import { createClient } from '@hagen/uk-content';

/**
 * Hagen UK's content, read with the token Hagen's authorization server issued
 * the agency.
 */
const hagen = createClient({
    baseUrl: process.env.HAGEN_UK_API_URL ?? 'http://uk.localhost:3041/api',
    onRequest: ({ headers }) => {
        headers.set('authorization', `Bearer ${process.env.HAGEN_READ_TOKEN ?? 'demo-travel-agency-read-token'}`);
    },
});

/**
 * Keeps a read until Hagen names its brand in a call to `/api/invalidate`.
 */
const cachedUnder = (brand: string): RequestInit => ({
    cache: 'force-cache',
    next: {
        tags: [brand],
    },
});

/**
 * Hagen UK's shops, with the numbers the UK answers.
 */
export const offices = async () => {
    const result = await hagen.content.sites.uk.collections.offices.list({
        query: {
            orderBy: 'order',
            direction: 'asc',
        },
        fetchOptions: cachedUnder('OfficeId'),
    });
    if (result.status !== 200) throw new Error(`Hagen answered ${result.status}: ${result.body.detail}`);
    return result.body.items;
};

/**
 * Hagen UK's workshops and open days, soonest first.
 */
export const events = async () => {
    const result = await hagen.content.sites.uk.collections.events.list({
        query: {
            orderBy: 'date',
            direction: 'asc',
        },
        fetchOptions: cachedUnder('EventId'),
    });
    if (result.status !== 200) throw new Error(`Hagen answered ${result.status}: ${result.body.detail}`);
    return result.body.items;
};
