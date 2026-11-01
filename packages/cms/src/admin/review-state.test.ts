import { describe, expect, it } from 'vitest';
import type { ReviewState } from '../view/schema.js';
import type { VersionSummary } from './history.js';
import {
    approvalOf,
    askAgainOf,
    askedLineOf,
    changeQuestionOf,
    commenterOf,
    commentsOn,
    dottedFieldsOf,
    gateNoteOf,
    mayUndoApproval,
    mayWithdraw,
    reviewStatusOf,
    reviewsIt,
    sendBackLabelOf,
    sentBackOf,
    takesPart,
    unchangedLineOf,
    waitsForMe,
} from './review-state.js';

const kari = {
    id: 'kari@example.com',
    name: 'Kari Nordmann',
};

const grace = {
    id: 'grace@example.com',
    name: 'Grace Hopper',
};

const ola = {
    id: 'ola@example.com',
    name: 'Ola Berg',
};

const review = (extra: Partial<ReviewState> = {}): ReviewState => ({
    id: 'review-1',
    status: 'open',
    version: 4,
    reviewers: [kari],
    requestedBy: grace,
    note: 'New spring hero.',
    createdAt: '2026-10-29T10:00:00.000Z',
    decidedBy: null,
    decisionNote: null,
    decidedAt: null,
    comments: [],
    ...extra,
});

describe('where a review stands', () => {
    it('says who it waits for, or that it waits for you', () => {
        expect(reviewStatusOf(review(), grace.id)).toBe('Waiting for review by Kari Nordmann');
        expect(
            reviewStatusOf(
                review({
                    reviewers: [kari, ola],
                }),
                grace.id
            )
        ).toBe('Waiting for review by Kari Nordmann and Ola Berg');
        expect(reviewStatusOf(review(), kari.id)).toBe('Waiting for your review');
        expect(waitsForMe(review(), kari.id)).toBe(true);
        expect(waitsForMe(review(), grace.id)).toBe(false);
    });

    it('says who answered', () => {
        const approved = review({
            status: 'approved',
            decidedBy: kari,
        });
        expect(reviewStatusOf(approved, grace.id)).toBe('Approved by Kari Nordmann');
        expect(reviewStatusOf(approved, kari.id)).toBe('Approved by you');
        const sentBack = review({
            status: 'changes',
            decidedBy: kari,
        });
        expect(reviewStatusOf(sentBack, grace.id)).toBe('Sent back by Kari Nordmann');
        expect(reviewStatusOf(sentBack, kari.id)).toBe('Sent back by you');
    });

    it('asks again whoever sent the draft back, unless it was you', () => {
        const sentBack = review({
            status: 'changes',
            decidedBy: kari,
        });
        expect(askAgainOf(sentBack, grace.id)).toEqual(kari);
        expect(askAgainOf(sentBack, kari.id)).toBeUndefined();
        expect(askAgainOf(review(), grace.id)).toBeUndefined();
    });

    it('says why Publish waits on a page that requires a review', () => {
        expect(gateNoteOf(false, review())).toBeUndefined();
        expect(gateNoteOf(true, null)).toBe('Publishing needs an approval');
        expect(gateNoteOf(true, review())).toBe('Publishing needs Kari’s approval');
        expect(
            gateNoteOf(
                true,
                review({
                    reviewers: [kari, ola],
                })
            )
        ).toBe('Publishing needs an approval from Kari or Ola');
        expect(
            gateNoteOf(
                true,
                review({
                    status: 'approved',
                    decidedBy: kari,
                })
            )
        ).toBeUndefined();
    });

    it('asks the reviewer what the person who asked should change, by their full name', () => {
        expect(changeQuestionOf(review())).toBe('What should Grace Hopper change?');
        expect(sendBackLabelOf(review())).toBe('Send to Grace Hopper');
    });

    it('opens the changes for whoever was asked or answered', () => {
        expect(reviewsIt(review(), kari.id)).toBe(true);
        expect(reviewsIt(review(), grace.id)).toBe(false);
        expect(
            reviewsIt(
                review({
                    status: 'approved',
                    decidedBy: ola,
                }),
                ola.id
            )
        ).toBe(true);
        expect(reviewsIt(null, kari.id)).toBe(false);
    });
});

describe('the changes on the Edit tab', () => {
    const changes = [
        {
            path: 'heading',
        },
        {
            path: 'intro',
        },
    ];

    it('marks the changed fields while a review is under way', () => {
        expect([...dottedFieldsOf(review(), changes)]).toEqual(['heading', 'intro']);
        expect(dottedFieldsOf(null, changes).size).toBe(0);
        expect(dottedFieldsOf(review(), undefined).size).toBe(0);
    });

    it('folds the fields the draft leaves alone into one line', () => {
        expect(unchangedLineOf(['Button'])).toBe('Button, unchanged');
        expect(unchangedLineOf(['Button', 'Delivery note'])).toBe('Button and Delivery note, unchanged');
    });
});

describe('the person who asked', () => {
    it('hears who was asked', () => {
        expect(askedLineOf(['Nils Aas'])).toBe('Asked Nils Aas to review');
        expect(askedLineOf(['Nils Aas', 'Kari Nordmann'])).toBe('Asked Nils Aas and Kari Nordmann to review');
        expect(askedLineOf([])).toBe('Asked for review');
    });

    it('reads what the reviewer sent back, with the open comments, once', () => {
        const comment = {
            id: 'comment-1',
            path: 'intro',
            text: 'Say all three towns once Trondheim opens',
            by: kari,
            createdAt: '2026-10-29T10:05:00.000Z',
            resolvedBy: null,
            resolvedAt: null,
            via: null,
            replyTo: null,
            review: 'review-1',
            anchor: null,
            mentions: [],
            assignee: null,
        };
        const sentBack = review({
            status: 'changes',
            decidedBy: kari,
            decisionNote: 'The intro promises delivery too early.',
            decidedAt: '2026-10-29T10:06:00.000Z',
            comments: [
                comment,
                {
                    ...comment,
                    id: 'comment-2',
                    resolvedBy: grace,
                    resolvedAt: '2026-10-29T10:10:00.000Z',
                    via: null,
                    replyTo: null,
                    review: 'review-1',
                    anchor: null,
                    mentions: [],
                    assignee: null,
                },
            ],
        });
        expect(sentBackOf(sentBack, grace.id)).toEqual({
            by: kari,
            at: '2026-10-29T10:06:00.000Z',
            note: 'The intro promises delivery too early.',
            comments: [comment],
        });
        expect(sentBackOf(sentBack, kari.id)).toBeUndefined();
        expect(sentBackOf(review(), grace.id)).toBeUndefined();
    });

    it('says who approved the version that went live', () => {
        const versions: VersionSummary[] = [
            {
                version: 2,
                summary: null,
                createdAt: '2026-10-29T10:00:00.000Z',
                createdBy: grace.id,
                published: true,
                review: {
                    status: 'approved',
                    by: kari,
                    at: '2026-10-29T10:20:00.000Z',
                },
            },
            {
                version: 1,
                summary: null,
                createdAt: '2026-10-28T10:00:00.000Z',
                createdBy: grace.id,
                published: false,
                review: null,
            },
        ];
        expect(approvalOf('published', versions)).toEqual({
            by: kari,
            at: '2026-10-29T10:20:00.000Z',
        });
        expect(approvalOf('changed', versions)).toBeUndefined();
        expect(
            approvalOf('published', [
                {
                    ...versions[0]!,
                    review: {
                        status: 'published-past-review',
                        by: grace,
                        at: '2026-10-29T10:20:00.000Z',
                    },
                },
            ])
        ).toBeUndefined();
        expect(approvalOf('published', undefined)).toBeUndefined();
    });
});

describe('changing a review', () => {
    it('lets the person who asked withdraw it while it waits', () => {
        expect(mayWithdraw(review(), grace.id)).toBe(true);
        expect(mayWithdraw(review(), kari.id)).toBe(false);
        expect(
            mayWithdraw(
                review({
                    status: 'changes',
                    decidedBy: kari,
                }),
                grace.id
            )
        ).toBe(false);
    });

    it('lets the reviewer undo their own approval, outdated or not', () => {
        const approved = review({
            status: 'approved',
            decidedBy: kari,
        });
        expect(mayUndoApproval(approved, kari.id)).toBe(true);
        expect(mayUndoApproval(approved, grace.id)).toBe(false);
        expect(
            mayUndoApproval(
                review({
                    status: 'outdated',
                    decidedBy: kari,
                }),
                kari.id
            )
        ).toBe(true);
    });

    it('says who published past the review', () => {
        const past = review({
            status: 'published-past-review',
            decidedBy: kari,
        });
        expect(reviewStatusOf(past, grace.id)).toBe('Published past the review by Kari Nordmann');
        expect(reviewStatusOf(past, kari.id)).toBe('Published past the review by you');
    });
});

describe('comments on a field', () => {
    it('splits the comments on one field into open and resolved', () => {
        const commented = review({
            comments: [
                {
                    id: 'comment-1',
                    path: 'heading',
                    text: 'Say which spring',
                    by: kari,
                    createdAt: '2026-10-29T10:05:00.000Z',
                    resolvedBy: null,
                    resolvedAt: null,
                    via: null,
                    replyTo: null,
                    review: 'review-1',
                    anchor: null,
                    mentions: [],
                    assignee: null,
                },
                {
                    id: 'comment-2',
                    path: 'heading',
                    text: 'Shorter, please',
                    by: kari,
                    createdAt: '2026-10-29T10:06:00.000Z',
                    resolvedBy: grace,
                    resolvedAt: '2026-10-29T10:10:00.000Z',
                    via: null,
                    replyTo: null,
                    review: 'review-1',
                    anchor: null,
                    mentions: [],
                    assignee: null,
                },
                {
                    id: 'comment-3',
                    path: 'products',
                    text: 'Keep the olive tree',
                    by: kari,
                    createdAt: '2026-10-29T10:07:00.000Z',
                    resolvedBy: null,
                    resolvedAt: null,
                    via: null,
                    replyTo: null,
                    review: 'review-1',
                    anchor: null,
                    mentions: [],
                    assignee: null,
                },
            ],
        });
        const onHeading = commentsOn(commented, 'heading');
        expect(onHeading.open.map((comment) => comment.id)).toEqual(['comment-1']);
        expect(onHeading.resolved.map((comment) => comment.id)).toEqual(['comment-2']);
        expect(commentsOn(null, 'heading').open).toEqual([]);
    });

    it('lets the people in the review comment', () => {
        expect(takesPart(review(), grace.id)).toBe(true);
        expect(takesPart(review(), kari.id)).toBe(true);
        expect(takesPart(review(), ola.id)).toBe(false);
    });

    it('names the person who wrote a comment, or you', () => {
        const [comment] = review({
            comments: [
                {
                    id: 'comment-1',
                    path: 'heading',
                    text: 'Say which spring',
                    by: kari,
                    createdAt: '2026-10-29T10:05:00.000Z',
                    resolvedBy: null,
                    resolvedAt: null,
                    via: null,
                    replyTo: null,
                    review: 'review-1',
                    anchor: null,
                    mentions: [],
                    assignee: null,
                },
            ],
        }).comments;
        expect(commenterOf(comment!, kari.id)).toBe('You');
        expect(commenterOf(comment!, grace.id)).toBe('Kari Nordmann');
        expect(
            commenterOf(
                {
                    ...comment!,
                    via: 'Claude',
                },
                grace.id
            )
        ).toBe('Kari Nordmann via Claude');
    });
});
