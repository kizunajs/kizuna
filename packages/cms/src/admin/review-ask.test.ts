import { describe, expect, it } from 'vitest';
import { reviewerDetailOf } from './review-ask.js';

const nils = {
    id: 'nils@hagen.example.no',
    name: 'Nils Aas',
    roles: ['editor'],
    sites: {
        norway: ['admin'],
    },
};

describe('reviewerDetailOf', () => {
    it("names the person's role on the document's site", () => {
        expect(reviewerDetailOf(nils, null, 'norway')).toBe('Admin');
    });

    it('falls back to their role over every site', () => {
        expect(reviewerDetailOf(nils, null, 'uk')).toBe('Editor');
        expect(reviewerDetailOf(nils, null, undefined)).toBe('Editor');
    });

    it('adds that they own the page', () => {
        expect(reviewerDetailOf(nils, nils.id, 'norway')).toBe('Admin · Owner of this page');
    });
});
