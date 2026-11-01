import { creditOf } from '../credit.js';
import type { PersonView, CommentView, ReviewState } from '../view/schema.js';
import type { VersionSummary } from './history.js';
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
                  lead: 'Sent back by you',
                  people: [],
              }
            : {
                  lead: 'Sent back by',
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
 * "Waiting for your review", "Sent back by Kari Nordmann".
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
 * Who makes the changes a review is sent back with: the agent that asked,
 * like Claude, or the person.
 */
const askerOf = (review: ReviewState): string => review.requestedVia ?? review.requestedBy.name;

/**
 * What the reviewer is asked when they send a draft back: "What should Kari
 * Nordmann change?"
 */
export const changeQuestionOf = (review: ReviewState): string => `What should ${askerOf(review)} change?`;

/**
 * The button that sends the draft back: "Send to Kari Nordmann".
 */
export const sendBackLabelOf = (review: ReviewState): string => `Send to ${askerOf(review)}`;

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
    open: CommentView[];
    resolved: CommentView[];
} => {
    const comments = review?.comments.filter((comment) => comment.path === path) ?? [];
    return {
        open: comments.filter((comment) => comment.resolvedAt === null),
        resolved: comments.filter((comment) => comment.resolvedAt !== null),
    };
};

/**
 * Who wrote a comment, as its head says it: "Kari Nordmann", "You", or
 * "Mia Holm via Claude" for one an agent wrote for them.
 */
export const commenterOf = (comment: CommentView, me: string | undefined): string =>
    creditOf(comment.by.id === me ? 'You' : comment.by.name, comment.via);

/**
 * Whether the person reviews the draft: they were asked, or they answered.
 * They read it on the Changes tab.
 */
export const reviewsIt = (review: ReviewState | null, me: string | undefined): review is ReviewState =>
    review !== null && (review.reviewers.some((reviewer) => reviewer.id === me) || review.decidedBy?.id === me);

/**
 * The fields marked with a dot on the Edit tab while a review is under
 * way: the ones the draft changes.
 */
export const dottedFieldsOf = (review: ReviewState | null, changes: readonly { path: string }[] | undefined): ReadonlySet<string> =>
    new Set(review === null || changes === undefined ? [] : changes.map((change) => change.path));

/**
 * What the toast says once the review is asked for: "Asked Nils Aas to
 * review".
 */
export const askedLineOf = (names: readonly string[]): string =>
    names.length === 0 ? 'Asked for review' : `Asked ${sentenceOf(names)} to review`;

/**
 * The one line the fields a draft leaves alone fold into: "Button and
 * Delivery note, unchanged".
 */
export const unchangedLineOf = (labels: readonly string[]): string => `${sentenceOf(labels)}, unchanged`;

/**
 * What the reviewer said when they sent the draft back, shown once at the
 * top of the form for the person who asked: their note and their open
 * comments. Undefined while nothing was sent back to the person.
 */
export const sentBackOf = (
    review: ReviewState | null,
    me: string | undefined
):
    | {
          by: PersonView;
          at: string | null;
          note: string | null;
          comments: CommentView[];
      }
    | undefined => {
    const by = askAgainOf(review, me);
    if (by === undefined || review === null) return undefined;
    return {
        by,
        at: review.decidedAt,
        note: review.decisionNote,
        comments: review.comments.filter((comment) => comment.resolvedAt === null),
    };
};

/**
 * Who approved the version that is live, and when, for the header of a
 * document published with nothing changed since. Undefined when it went
 * live without an approval.
 */
export const approvalOf = (
    status: string,
    versions: readonly VersionSummary[] | undefined
):
    | {
          by: PersonView;
          at: string;
      }
    | undefined => {
    if (status !== 'published' || versions === undefined) return undefined;
    const live = versions.find((version) => version.published);
    if (live?.review?.status !== 'approved') return undefined;
    return {
        by: live.review.by,
        at: live.review.at,
    };
};
