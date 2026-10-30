import { describe, expect, it } from 'vitest';
import { waitingRowsOf, type OpenReview, type OpenTranslation } from './waiting-rows.js';

const SAM = {
    id: 'sam',
    name: 'Sam Patel',
};

const INGRID = {
    id: 'ingrid',
    name: 'Ingrid Hagen',
};

const review = (ref: string, createdAt: string, requestedBy = SAM, reviewers = [INGRID]): OpenReview => ({
    id: `review-${ref}`,
    ref,
    label: ref,
    reviewers,
    requestedBy,
    note: null,
    createdAt,
});

const REVIEWS = [
    review('item:offices:k3', '2026-10-30T10:00:00.000Z'),
    review('item:uk:events:e1', '2026-10-29T10:00:00.000Z'),
    review('page:norway:frontPage', '2026-10-28T10:00:00.000Z', INGRID, [SAM]),
];

const TRANSLATIONS: OpenTranslation[] = [
    {
        ref: 'page:norway:frontPage@en',
        source: 'page:norway:frontPage',
        locale: 'en',
        label: 'Forsiden',
        changed: ['heading'],
        missing: ['openingBanner'],
    },
];

const collectionLabel = (name: string): string | undefined => (name === 'offices' ? 'Offices' : undefined);

describe('Waiting', () => {
    it('lists every review, longest waiting first, then the translations to update', () => {
        const rows = waitingRowsOf(REVIEWS, TRANSLATIONS, {
            collectionLabel,
        });
        expect(rows.map((row) => [row.kind, row.ref, row.site, row.detail])).toEqual([
            ['review', 'page:norway:frontPage', 'norway', 'Pages'],
            ['review', 'item:uk:events:e1', 'uk', 'Events'],
            ['review', 'item:offices:k3', undefined, 'Offices'],
            ['translation', 'page:norway:frontPage@en', 'norway', 'Pages'],
        ]);
        expect(rows.at(-1)!.change).toBe('Heading, Opening banner');
    });

    it("lists a site's own and the shared reviews asked of the editor or by them", () => {
        const rows = waitingRowsOf(REVIEWS, TRANSLATIONS, {
            collectionLabel,
            site: 'uk',
            me: 'sam',
        });
        expect(rows.map((row) => [row.ref, row.group])).toEqual([
            ['item:uk:events:e1', 'mine'],
            ['item:offices:k3', 'mine'],
        ]);
    });
});
