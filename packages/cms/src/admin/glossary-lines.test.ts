import { describe, expect, it } from 'vitest';
import { glossaryAfter, glossaryUnder } from './glossary-lines.js';
import type { DescribedField, GlossaryIssue } from '../view/schema.js';

const issue = (path: string, form: string): GlossaryIssue => ({
    path,
    locale: 'nb',
    form,
    rule: 'avoid',
    use: 'rimelig',
    detail: `The ${path} says ${form}. Hagen Norge writes rimelig.`,
});

const field = (path: string): DescribedField =>
    ({
        path,
        name: path.split('.').at(-1)!,
    }) as DescribedField;

describe('glossaryAfter()', () => {
    it('replaces the issues in the fields a save wrote, and keeps the rest', () => {
        expect(glossaryAfter([issue('heading', 'billig'), issue('intro', 'billige')], [], ['heading'])).toEqual([
            issue('intro', 'billige'),
        ]);
        expect(glossaryAfter([issue('intro', 'billige')], [issue('heading', 'billigste')], ['heading'])).toEqual([
            issue('intro', 'billige'),
            issue('heading', 'billigste'),
        ]);
    });

    it('keeps the issues as they were when the server answers none', () => {
        expect(glossaryAfter([issue('intro', 'billige')], undefined, ['intro'])).toEqual([issue('intro', 'billige')]);
    });
});

describe('glossaryUnder()', () => {
    it('shows an issue under the deepest field the form shows for it', () => {
        const fields = [field('seo'), field('seo.title'), field('sections')];
        const issues = [issue('seo.title', 'billig'), issue('sections.0.heading', 'billige')];
        expect(glossaryUnder(issues, fields, fields[0]!)).toEqual([]);
        expect(glossaryUnder(issues, fields, fields[1]!)).toEqual([issue('seo.title', 'billig')]);
        expect(glossaryUnder(issues, fields, fields[2]!)).toEqual([issue('sections.0.heading', 'billige')]);
    });
});
