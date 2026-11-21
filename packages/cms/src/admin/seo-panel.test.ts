import { describe, expect, it } from 'vitest';
import { answersLineOf, bandOf, checksInOrder, fixCountOf, linkCountsOf, searchLineOf, type SeoCheck } from './seo-panel.js';

const checks: SeoCheck[] = [
    {
        level: 'suggested',
        text: 'The heading leaves out “plant care”.',
        field: 'heading',
    },
    {
        level: 'urgent',
        text: 'A link goes to Winter watering, which is in the trash.',
        field: 'body',
    },
    {
        level: 'urgent',
        text: 'The search title is 64 characters.',
        field: 'seo',
    },
];

describe('bandOf', () => {
    it('reads 80 and over as good, 50 to 79 as fair, and under 50 as poor', () => {
        expect([100, 80, 79, 50, 49, 0].map(bandOf)).toEqual(['good', 'good', 'fair', 'fair', 'poor', 'poor']);
    });
});

describe('the checks', () => {
    it('put the urgent ones first, each level in the order it came', () => {
        expect(checksInOrder(checks).map((check) => check.field)).toEqual(['body', 'seo', 'heading']);
    });

    it('count each level', () => {
        expect(fixCountOf(checks)).toBe('2 urgent, 1 suggested');
        expect(fixCountOf(checks.slice(0, 1))).toBe('1 suggested');
        expect(fixCountOf([])).toBe('');
    });

    it('say where to start under the search score', () => {
        expect(searchLineOf(checks)).toBe('Start with the 2 urgent fixes below');
        expect(searchLineOf(checks.slice(0, 1))).toBe('1 suggested fix below');
        expect(searchLineOf([])).toBe('Nothing to fix on this page');
    });
});

describe('answersLineOf', () => {
    it('counts the questions that cite the page', () => {
        expect(
            answersLineOf(
                [
                    {
                        question: 'Do plant shops give care advice after you buy?',
                        engines: ['Search'],
                    },
                    {
                        question: 'How do I look after a monstera in winter?',
                        engines: [],
                    },
                ],
                'Fake'
            )
        ).toBe('Cited in 1 of 2 questions people ask');
    });

    it('credits the provider without questions', () => {
        expect(answersLineOf(undefined, 'Fake')).toBe('From Fake');
        expect(answersLineOf([], null)).toBe('');
    });
});

describe('linkCountsOf', () => {
    it('counts pages and other sites linking in, each site once, and broken links out', () => {
        expect(
            linkCountsOf({
                in: [
                    {
                        kind: 'page',
                        ref: 'page:uk:frontPage',
                        title: 'Front page',
                    },
                    {
                        kind: 'external',
                        title: 'plantclub.example.com',
                        domain: 'plantclub.example.com',
                    },
                    {
                        kind: 'external',
                        title: 'plantclub.example.com',
                        domain: 'plantclub.example.com',
                    },
                ],
                out: [
                    {
                        kind: 'broken',
                        title: 'Winter watering',
                        reason: 'trash',
                    },
                    {
                        kind: 'page',
                        ref: 'page:uk:deliveryPage',
                        title: 'Delivery',
                    },
                ],
            })
        ).toEqual({
            pagesIn: 1,
            sitesIn: 1,
            brokenOut: 1,
        });
        expect(linkCountsOf(undefined)).toEqual({
            pagesIn: 0,
            sitesIn: 0,
            brokenOut: 0,
        });
    });
});
