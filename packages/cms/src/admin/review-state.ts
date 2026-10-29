import type { PersonView, ReviewState } from '../view/schema.js';
import { sentenceOf } from './sections.js';

const firstNameOf = (person: PersonView): string => person.name.split(' ')[0] ?? person.name;

/**
 * Where a review stands, as the header's Status says it: "Waiting for review
 * by Kari Nordmann", "Waiting for your review", "Changes requested by Kari
 * Nordmann".
 */
export const reviewStatusOf = (review: ReviewState, me: string | undefined): string => {
    const decider = review.decidedBy;
    const byMe = decider !== null && decider.id === me;
    if (review.status === 'open') {
        if (review.reviewers.some((reviewer) => reviewer.id === me)) return 'Waiting for your review';
        return review.reviewers.length === 0
            ? 'Waiting for review'
            : `Waiting for review by ${sentenceOf(review.reviewers.map((reviewer) => reviewer.name))}`;
    }
    if (review.status === 'approved') return byMe ? 'Approved by you' : `Approved by ${decider?.name ?? 'a reviewer'}`;
    if (review.status === 'changes') return byMe ? 'Changes requested' : `Changes requested by ${decider?.name ?? 'a reviewer'}`;
    return byMe ? 'Changed since you approved it' : `Changed since ${decider?.name ?? 'the reviewer'} approved it`;
};

/**
 * Whether the person was asked for this review and it still waits for them.
 */
export const waitsForMe = (review: ReviewState | null, me: string | undefined): review is ReviewState =>
    review !== null && review.status === 'open' && review.reviewers.some((reviewer) => reviewer.id === me);

/**
 * Each reviewer with their answer, and whoever answered without being asked.
 */
export const verdictsOf = (
    review: ReviewState,
    me: string | undefined
): Array<{
    person: PersonView;
    you: boolean;
    verdict: string;
}> => {
    const decider = review.decidedBy;
    const people = [...review.reviewers];
    if (decider !== null && !people.some((person) => person.id === decider.id)) people.push(decider);
    return people.map((person) => ({
        person,
        you: person.id === me,
        verdict:
            decider !== null && decider.id === person.id
                ? review.status === 'changes'
                    ? 'Asked for changes'
                    : 'Approved'
                : review.status === 'open'
                  ? 'Not reviewed'
                  : '',
    }));
};

/**
 * Who sent the draft back, to ask once the changes are made, or undefined
 * when nobody did or it was the person themselves.
 */
export const askAgainOf = (review: ReviewState | null, me: string | undefined): PersonView | undefined => {
    if (review?.status !== 'changes' || review.decidedBy === null || review.decidedBy.id === me) return undefined;
    return review.decidedBy;
};

/**
 * What the button that asks again says: "Ask Kari again".
 */
export const askAgainLabelOf = (person: PersonView): string => `Ask ${firstNameOf(person)} again`;

/**
 * Why Publish waits on a document that requires a review, beside the header's
 * buttons, or undefined when it does not wait.
 */
export const gateNoteOf = (requireReview: boolean, review: ReviewState | null): string | undefined => {
    if (!requireReview || review?.status === 'approved') return undefined;
    const waitingFor =
        review === null ? [] : review.status === 'open' ? review.reviewers : review.decidedBy === null ? [] : [review.decidedBy];
    if (waitingFor.length === 0) return 'Publishing needs an approval';
    if (waitingFor.length === 1) return `Publishing needs ${firstNameOf(waitingFor[0]!)}’s approval`;
    return `Publishing needs an approval from ${sentenceOf(waitingFor.map(firstNameOf), 'or')}`;
};

/**
 * Whose draft the review shows, over its column: "Kari's draft", or "Your
 * draft" for the person who asked.
 */
export const draftOwnerOf = (review: ReviewState, me: string | undefined): string =>
    review.requestedBy.id === me ? 'Your draft' : `${firstNameOf(review.requestedBy)}’s draft`;

/**
 * What the reviewer is asked when they send a draft back: "What should Kari
 * change?"
 */
export const changeQuestionOf = (review: ReviewState): string => `What should ${firstNameOf(review.requestedBy)} change?`;

/**
 * The button that sends the draft back: "Send to Kari".
 */
export const sendBackLabelOf = (review: ReviewState): string => `Send to ${firstNameOf(review.requestedBy)}`;
