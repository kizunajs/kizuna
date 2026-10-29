import { describe, expect, it } from 'vitest';
import type { ReviewState } from '../view/schema.js';
import { askAgainOf, draftOwnerOf, gateNoteOf, reviewStatusOf, verdictsOf, waitsForMe } from './review-state.js';

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
        expect(reviewStatusOf(sentBack, grace.id)).toBe('Changes requested by Kari Nordmann');
        expect(reviewStatusOf(sentBack, kari.id)).toBe('Changes requested');
    });

    it('lists each reviewer with their answer', () => {
        expect(verdictsOf(review(), kari.id)).toEqual([
            {
                person: kari,
                you: true,
                verdict: 'Not reviewed',
            },
        ]);
        expect(
            verdictsOf(
                review({
                    status: 'changes',
                    decidedBy: ola,
                }),
                grace.id
            ).map((entry) => [entry.person.name, entry.verdict])
        ).toEqual([
            ['Kari Nordmann', ''],
            ['Ola Berg', 'Asked for changes'],
        ]);
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

    it('names whose draft it is', () => {
        expect(draftOwnerOf(review(), kari.id)).toBe('Grace’s draft');
        expect(draftOwnerOf(review(), grace.id)).toBe('Your draft');
    });
});
