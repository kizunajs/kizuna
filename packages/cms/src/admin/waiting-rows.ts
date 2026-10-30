import { parseRef } from '../refs.js';
import { humanize, type PersonView } from '../view/schema.js';

/**
 * A review that waits for an answer, as the reviews route lists it.
 */
export interface OpenReview {
    id: string;
    ref: string;
    label: string;
    reviewers: PersonView[];
    requestedBy: PersonView;
    note: string | null;
    createdAt: string;
}

/**
 * A translation that waits on someone, as the translations route lists it.
 */
export interface OpenTranslation {
    ref: string;
    source: string;
    locale: string;
    label: string;
    changed: string[];
    missing: string[];
}

/**
 * One row of Waiting: a review to answer, or a translation to update.
 */
export interface WaitingRow {
    kind: 'review' | 'translation';
    /**
     * The document the row opens: the reviewed one, or the translation.
     */
    ref: string;
    label: string;
    /**
     * What the document is, under its label, like "Events" or "Pages".
     */
    detail: string;
    /**
     * The site the document belongs to, or `undefined` for shared content.
     */
    site: string | undefined;
    /**
     * What changed: the reviewer's note, or the fields to update.
     */
    change: string;
    from?: PersonView;
    /**
     * When the review was asked for.
     */
    since?: string;
    /**
     * The translation's language, like `nb`.
     */
    locale?: string;
    /**
     * In a site, whether the review was asked of the editor or by them.
     */
    group?: 'asked' | 'mine';
}

/**
 * What a document is, by its ref: its collection's label, Pages or Settings.
 */
const detailOf = (ref: string, collectionLabel: (name: string) => string | undefined): string => {
    const parsed = parseRef(ref);
    if (parsed?.type === 'item') return collectionLabel(parsed.collection) ?? humanize(parsed.collection);
    if (parsed?.type === 'page') return 'Pages';
    return 'Settings';
};

/**
 * Every review and translation that waits, longest first, as Waiting lists
 * them. In a site, only the site's own and shared content, with each review
 * asked of the editor or by them.
 */
export const waitingRowsOf = (
    reviews: readonly OpenReview[],
    translations: readonly OpenTranslation[],
    options: {
        collectionLabel: (name: string) => string | undefined;
        /**
         * The site shown, or `undefined` for every site the editor may open.
         */
        site?: string | undefined;
        me?: string | undefined;
    }
): WaitingRow[] => {
    const inPlace = (site: string | undefined): boolean => options.site === undefined || site === undefined || site === options.site;
    const reviewRows = [...reviews]
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .flatMap((review): WaitingRow[] => {
            const site = parseRef(review.ref)?.site;
            if (!inPlace(site)) return [];
            const group: WaitingRow['group'] =
                options.site === undefined
                    ? undefined
                    : review.reviewers.some((person) => person.id === options.me)
                      ? 'asked'
                      : review.requestedBy.id === options.me
                        ? 'mine'
                        : undefined;
            if (options.site !== undefined && group === undefined) return [];
            return [
                {
                    kind: 'review',
                    ref: review.ref,
                    label: review.label,
                    detail: detailOf(review.ref, options.collectionLabel),
                    site,
                    change: review.note ?? '',
                    from: review.requestedBy,
                    since: review.createdAt,
                    ...(group === undefined
                        ? {}
                        : {
                              group,
                          }),
                },
            ];
        });
    // In a site, a translation waits on its editors.
    const translationGroup: WaitingRow['group'] = options.site === undefined ? undefined : 'asked';
    const translationRows = translations.flatMap((translation): WaitingRow[] => {
        const site = parseRef(translation.source)?.site;
        if (!inPlace(site)) return [];
        return [
            {
                kind: 'translation',
                ref: translation.ref,
                label: translation.label,
                detail: detailOf(translation.source, options.collectionLabel),
                site,
                change: [...translation.changed, ...translation.missing].map(humanize).join(', '),
                locale: translation.locale,
                ...(translationGroup === undefined
                    ? {}
                    : {
                          group: translationGroup,
                      }),
            },
        ];
    });
    return [...reviewRows, ...translationRows];
};
