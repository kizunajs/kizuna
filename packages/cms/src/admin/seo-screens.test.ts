import { describe, expect, it } from 'vitest';
import { bandOf, competeAdviceOf, competeBandOf, pageNamerOf, siteStatsOf, type SiteSeoAnswer } from './seo-screens.js';

const ANSWER: SiteSeoAnswer = {
    checkedAt: '2026-11-21T08:00:00.000Z',
    label: 'Search data',
    scores: {
        search: 71,
        answers: 54,
    },
    pages: 41,
    mostToFix: [
        {
            ref: 'page:uk:tasksPage',
            title: 'Tasks',
            path: '/tasks',
            checks: 4,
            score: 58,
        },
    ],
    keywords: [
        {
            keyword: 'task list',
            position: 4,
            volume: 1800,
            url: 'https://uk.example.com/tasks',
        },
        {
            keyword: 'shared tasks',
            position: 31,
            volume: 400,
        },
    ],
    citations: [
        {
            question: 'How do I share a task list?',
            engines: ['An engine'],
        },
        {
            question: 'Which task app works offline?',
            engines: [],
        },
    ],
    backlinkDomains: [
        {
            domain: 'one.example.org',
            links: 12,
        },
        {
            domain: 'two.example.org',
            links: 3,
        },
    ],
};

describe('bandOf', () => {
    it('reads 80 and over as good, 50 and over as fair, and less as poor', () => {
        expect(bandOf(80)).toBe('good');
        expect(bandOf(79)).toBe('fair');
        expect(bandOf(50)).toBe('fair');
        expect(bandOf(49)).toBe('poor');
    });
});

describe('siteStatsOf', () => {
    it('gives the four numbers with their detail', () => {
        expect(siteStatsOf(ANSWER)).toEqual([
            {
                label: 'SEO',
                value: '71',
                detail: 'Across 41 pages and items',
            },
            {
                label: 'AI answers',
                value: '54',
                detail: 'Cited in 1 of 2 questions',
            },
            {
                label: 'First page of results',
                value: '1',
                detail: 'Of 2 keywords',
            },
            {
                label: 'Other sites that link here',
                value: '15',
                detail: 'From 2 sites',
            },
        ]);
    });

    it('leaves out what there is no data for', () => {
        expect(
            siteStatsOf({
                checkedAt: ANSWER.checkedAt,
                label: null,
                scores: null,
                mostToFix: [],
            })
        ).toEqual([]);
    });
});

describe('pageNamerOf', () => {
    it('names a URL by the page at its path, or by the path', () => {
        const nameOf = pageNamerOf(ANSWER.mostToFix);
        expect(nameOf('https://uk.example.com/tasks')).toEqual({
            title: 'Tasks',
            ref: 'page:uk:tasksPage',
        });
        expect(nameOf('https://uk.example.com/events')).toEqual({
            title: '/events',
        });
    });
});

describe('competeAdviceOf', () => {
    const nameOf = pageNamerOf(ANSWER.mostToFix);

    it('merges pages that say the same into the one that ranks best', () => {
        expect(
            competeAdviceOf(
                {
                    keyword: 'task list',
                    volume: 1800,
                    urls: [
                        {
                            url: 'https://uk.example.com/events',
                            position: 12,
                            similarity: 0.9,
                        },
                        {
                            url: 'https://uk.example.com/tasks',
                            position: 4,
                        },
                    ],
                },
                nameOf
            )
        ).toBe('Merge into Tasks');
    });

    it('points the rest at it when they differ', () => {
        expect(
            competeAdviceOf(
                {
                    keyword: 'task list',
                    volume: 1800,
                    urls: [
                        {
                            url: 'https://uk.example.com/tasks',
                            position: 4,
                        },
                        {
                            url: 'https://uk.example.com/events',
                            position: 12,
                            similarity: 0.4,
                        },
                    ],
                },
                nameOf
            )
        ).toBe('Point to Tasks');
    });

    it('reads three pages or more as poor and two as fair', () => {
        expect(competeBandOf(3)).toBe('poor');
        expect(competeBandOf(2)).toBe('fair');
    });
});
