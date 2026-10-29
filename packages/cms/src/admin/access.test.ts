import { describe, expect, it } from 'vitest';
import type { DescribedField } from '../view/schema.js';
import { documentNounOf, documentStateOf, roleSubjectOf, titleOfRef } from './access.js';

const field = (name: string, writable: boolean, readOnly = false): DescribedField => ({
    path: name,
    name,
    readOnly,
    required: false,
    writable,
    schema: {
        type: 'string',
    },
});

const labels = (name: string): string | undefined =>
    ({
        articles: 'Articles',
        employees: 'Employees',
    })[name];

describe('documentStateOf', () => {
    it('finds no item where none was ever created', () => {
        expect(
            documentStateOf({
                kind: 'item',
                version: 0,
                draft: null,
                fields: [field('title', true)],
            })
        ).toBe('not-found');
    });

    it('opens a global that has never been saved', () => {
        expect(
            documentStateOf({
                kind: 'global',
                version: 0,
                draft: null,
                fields: [field('email', true)],
            })
        ).toBe('open');
    });

    it('says the editor cannot edit a document when no field is theirs to change', () => {
        expect(
            documentStateOf({
                kind: 'global',
                version: 3,
                draft: {},
                fields: [field('email', false), field('copyright', true, true)],
            })
        ).toBe('no-access');
        expect(
            documentStateOf({
                kind: 'global',
                version: 3,
                draft: {},
                fields: [field('email', false), field('phone', true)],
            })
        ).toBe('open');
    });
});

describe('documentNounOf', () => {
    it('names an item after its collection, and its list', () => {
        expect(documentNounOf('item:articles:k3j9x2', labels)).toEqual({
            noun: 'article',
            list: {
                label: 'Articles',
                collection: 'articles',
            },
        });
    });

    it('names a page and a global', () => {
        expect(documentNounOf('page:frontPage', labels).noun).toBe('page');
        expect(documentNounOf('global:footer', labels)).toEqual({
            noun: 'document',
            list: undefined,
        });
    });
});

describe('the words of a no-access screen', () => {
    it('names the role, or the account without one', () => {
        expect(roleSubjectOf('editor')).toBe('Your role, Editor,');
        expect(roleSubjectOf(null)).toBe('Your account');
    });

    it('titles a document from its ref before it loads', () => {
        expect(titleOfRef('global:footer')).toBe('Footer');
    });
});
