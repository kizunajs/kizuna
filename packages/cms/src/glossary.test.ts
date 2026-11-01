import { describe, expect, it } from 'vitest';
import { glossaryIssues, occurs, termsFor, termsIn, type GlossaryTerm } from './glossary.js';

const group: GlossaryTerm[] = [
    {
        forms: ['Hagen Club'],
        rule: 'keep',
    },
    {
        forms: ['cheap'],
        rule: 'avoid',
        language: 'en',
        use: 'affordable',
    },
];

const norway: GlossaryTerm[] = [
    {
        forms: ['Plantedoktoren'],
        rule: 'keep',
    },
    {
        forms: ['billig', 'billige', 'billigste'],
        rule: 'avoid',
        language: 'nb',
        use: 'rimelig',
    },
    {
        forms: ['Hagen Club'],
        rule: 'translate',
        language: 'nb',
        use: 'Hagen-klubben',
    },
];

const labelOf = (field: string): string =>
    ({
        intro: 'Intro',
        summary: 'Summary',
    })[field] ?? field;

describe('occurs()', () => {
    it('matches whole words in any case', () => {
        expect(occurs('Billige planter til balkongen', 'billige')).toBe(true);
        expect(occurs('Vi er billigere enn før', 'billig')).toBe(false);
        expect(occurs('Bli med i Hagen-klubben', 'Hagen')).toBe(true);
    });

    it('matches a kept term only as written', () => {
        expect(occurs('Spør Plantedoktoren', 'Plantedoktoren', true)).toBe(true);
        expect(occurs('Spør plantedoktoren', 'Plantedoktoren', true)).toBe(false);
    });
});

describe('termsFor()', () => {
    it("joins the site's terms to the group's, and replaces the group's for the same form", () => {
        const terms = termsFor(group, norway, 'nb');
        expect(terms.map((term) => `${term.from} ${term.rule} ${term.forms[0]}`)).toEqual([
            'site keep Plantedoktoren',
            'site avoid billig',
            'site translate Hagen Club',
        ]);
    });

    it('keeps only the terms that hold in the language', () => {
        expect(termsFor(group, norway, 'en').map((term) => term.forms[0])).toEqual(['Hagen Club', 'cheap', 'Plantedoktoren']);
        expect(termsFor(group, [], 'nb-NO').map((term) => term.forms[0])).toEqual(['Hagen Club']);
    });
});

describe('glossaryIssues()', () => {
    it('flags an avoided form with the word to write instead', () => {
        const issues = glossaryIssues({
            texts: [
                {
                    field: 'summary',
                    text: 'Vi har billige planter til balkongen',
                },
            ],
            terms: termsFor(group, norway, 'nb'),
            locale: 'nb',
            writer: 'Hagen Norge',
            labelOf,
        });
        expect(issues).toEqual([
            {
                path: 'summary',
                locale: 'nb',
                form: 'billige',
                rule: 'avoid',
                use: 'rimelig',
                detail: 'The summary says billige. Hagen Norge writes rimelig.',
            },
        ]);
    });

    it('flags a banned word that names nothing to write instead', () => {
        const issues = glossaryIssues({
            texts: [
                {
                    field: 'intro',
                    text: 'Guaranteed to grow.',
                },
            ],
            terms: termsFor(
                [
                    {
                        forms: ['guaranteed'],
                        rule: 'avoid',
                    },
                ],
                [],
                'en'
            ),
            locale: 'en',
            writer: 'Hagen',
            labelOf,
        });
        expect(issues.map((issue) => issue.detail)).toEqual(['The intro says Guaranteed, which Hagen never writes.']);
    });

    it('flags a translated form written as it is in the source language', () => {
        const issues = glossaryIssues({
            texts: [
                {
                    field: 'intro',
                    text: 'Bli med i Hagen Club i dag.',
                },
            ],
            terms: termsFor(group, norway, 'nb'),
            locale: 'nb',
            writer: 'Hagen Norge',
            labelOf,
        });
        expect(issues.map((issue) => issue.detail)).toEqual(['The intro says Hagen Club. Hagen Norge writes Hagen-klubben.']);
    });

    it('compares a translation with its source: a kept name stays, and a translated one reads as its `use`', () => {
        const issues = glossaryIssues({
            texts: [
                {
                    field: 'intro',
                    text: 'Spør plantelegen, og bli med i klubben.',
                },
            ],
            source: [
                {
                    field: 'intro',
                    text: 'Ask Plantedoktoren, and join Hagen Club.',
                },
            ],
            terms: termsFor(group, norway, 'nb'),
            locale: 'nb',
            writer: 'Hagen Norge',
            labelOf,
        });
        expect(issues.map((issue) => issue.detail)).toEqual([
            'The intro leaves out Plantedoktoren, which its source says and every language keeps as written.',
            'The intro leaves out Hagen-klubben. Its source says Hagen Club, which Hagen Norge writes as Hagen-klubben.',
        ]);
    });

    it('finds nothing in a translation that follows the glossary', () => {
        expect(
            glossaryIssues({
                texts: [
                    {
                        field: 'intro',
                        text: 'Spør Plantedoktoren, og bli med i Hagen-klubben. Rimelige planter.',
                    },
                ],
                source: [
                    {
                        field: 'intro',
                        text: 'Ask Plantedoktoren, and join Hagen Club. Affordable plants.',
                    },
                ],
                terms: termsFor(group, norway, 'nb'),
                locale: 'nb',
                writer: 'Hagen Norge',
                labelOf,
            })
        ).toEqual([]);
    });
});

describe('termsIn()', () => {
    it('lists the terms a text holds, by a form or by `use`', () => {
        const terms = termsFor(group, norway, 'nb');
        expect(termsIn(['Ask Plantedoktoren today'], terms).map((term) => term.forms[0])).toEqual(['Plantedoktoren']);
        expect(termsIn(['Rimelig og godt'], terms).map((term) => term.forms[0])).toEqual(['billig']);
    });
});
