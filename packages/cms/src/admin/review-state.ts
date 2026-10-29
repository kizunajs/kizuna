import type { PersonView, ReviewComment, ReviewState } from '../view/schema.js';
import { sentenceOf } from './sections.js';

const firstNameOf = (person: PersonView): string => person.name.split(' ')[0] ?? person.name;

/**
 * Where a review stands, as the header's Status says it, in the words before
 * the people it names, so their faces can sit between: "Waiting for review
 * by" and Kari, or "Waiting for your review" alone.
 */
export const reviewStatusPartsOf = (review: ReviewState, me: string | undefined): { lead: string; people: PersonView[] } => {
    const decider = review.decidedBy;
    const byMe = decider !== null && decider.id === me;
    const deciders = decider === null ? [] : [decider];
    if (review.status === 'open') {
        if (review.reviewers.some((reviewer) => reviewer.id === me)) {
            return {
                lead: 'Waiting for your review',
                people: [],
            };
        }
        return {
            lead: review.reviewers.length === 0 ? 'Waiting for review' : 'Waiting for review by',
            people: review.reviewers,
        };
    }
    if (review.status === 'approved') {
        return byMe
            ? {
                  lead: 'Approved by you',
                  people: [],
              }
            : {
                  lead: 'Approved by',
                  people: deciders,
              };
    }
    if (review.status === 'changes') {
        return byMe
            ? {
                  lead: 'Changes requested',
                  people: [],
              }
            : {
                  lead: 'Changes requested by',
                  people: deciders,
              };
    }
    if (review.status === 'published-past-review') {
        return byMe
            ? {
                  lead: 'Published past the review by you',
                  people: [],
              }
            : {
                  lead: 'Published past the review by',
                  people: deciders,
              };
    }
    if (review.status === 'withdrawn') {
        return {
            lead: 'Review request withdrawn',
            people: [],
        };
    }
    return byMe
        ? {
              lead: 'Changed since you approved it',
              people: [],
          }
        : {
              lead: 'Changed since the approval by',
              people: deciders,
          };
};

/**
 * Where a review stands in one line: "Waiting for review by Kari Nordmann",
 * "Waiting for your review", "Changes requested by Kari Nordmann".
 */
export const reviewStatusOf = (review: ReviewState, me: string | undefined): string => {
    const { lead, people } = reviewStatusPartsOf(review, me);
    return people.length === 0 ? lead : `${lead} ${sentenceOf(people.map((person) => person.name))}`;
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
                    : review.status === 'published-past-review'
                      ? 'Published past review'
                      : review.status === 'withdrawn'
                        ? 'Withdrew the request'
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

/**
 * Whether the person asked for this review and it still waits, so they can
 * withdraw it.
 */
export const mayWithdraw = (review: ReviewState | null, me: string | undefined): review is ReviewState =>
    review !== null && review.status === 'open' && review.requestedBy.id === me;

/**
 * Whether the person approved this review, so they can undo the approval
 * while the draft is unpublished. An outdated approval is still theirs.
 */
export const mayUndoApproval = (review: ReviewState | null, me: string | undefined): review is ReviewState =>
    review !== null && (review.status === 'approved' || review.status === 'outdated') && review.decidedBy?.id === me;

/**
 * Whether the person takes part in the review, so they may comment on its
 * fields: they asked, were asked, or answered.
 */
export const takesPart = (review: ReviewState | null, me: string | undefined): review is ReviewState =>
    review !== null &&
    me !== undefined &&
    (review.requestedBy.id === me || review.decidedBy?.id === me || review.reviewers.some((reviewer) => reviewer.id === me));

/**
 * The comments on one field, open and resolved, oldest first.
 */
export const commentsOn = (
    review: ReviewState | null,
    path: string
): {
    open: ReviewComment[];
    resolved: ReviewComment[];
} => {
    const comments = review?.comments.filter((comment) => comment.path === path) ?? [];
    return {
        open: comments.filter((comment) => comment.resolvedAt === null),
        resolved: comments.filter((comment) => comment.resolvedAt !== null),
    };
};

/**
 * What a comment's head says: "Kari Nordmann on Products", or "You on
 * Products".
 */
export const commentTitleOf = (comment: ReviewComment, label: string, me: string | undefined): string =>
    `${comment.by.id === me ? 'You' : comment.by.name} on ${label}`;

/**
 * What the composer under a change hints: "Felix sees this beside the
 * field", or a plainer line for the person who asked.
 */
export const commentHintOf = (review: ReviewState, me: string | undefined): string =>
    review.requestedBy.id === me ? 'Reviewers see this under the change' : `${firstNameOf(review.requestedBy)} sees this under the field`;
