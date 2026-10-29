import { describe, expect, it } from 'vitest';
import { readOnlyTextOf, readsAsText } from './read-only.js';

describe('readsAsText', () => {
    it('reads text, numbers, choices and lists of them as text', () => {
        expect(
            readsAsText({
                type: 'string',
                format: 'email',
            })
        ).toBe(true);
        expect(
            readsAsText({
                type: 'string',
                enum: ['editor', 'admin'],
            })
        ).toBe(true);
        expect(
            readsAsText({
                type: 'array',
                items: {
                    type: 'integer',
                },
            })
        ).toBe(true);
    });

    it('keeps the control of an id, an image and rich text', () => {
        expect(
            readsAsText({
                type: 'string',
                brand: 'EmployeeId',
            })
        ).toBe(false);
        expect(
            readsAsText({
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                    },
                    alt: {
                        type: 'string',
                    },
                },
            })
        ).toBe(false);
        expect(
            readsAsText({
                type: 'array',
                'x-kizuna': 'rich-text',
            })
        ).toBe(false);
    });
});

describe('readOnlyTextOf', () => {
    it('shows a choice by its label and yes or no in words', () => {
        expect(
            readOnlyTextOf(
                {
                    type: 'string',
                    enum: ['editor', 'admin'],
                },
                'admin',
                {
                    editor: 'Editor',
                    admin: 'Admin',
                }
            )
        ).toBe('Admin');
        expect(
            readOnlyTextOf(
                {
                    type: 'boolean',
                },
                false,
                undefined
            )
        ).toBe('No');
    });

    it('joins a list, and holds nothing for an empty value', () => {
        expect(
            readOnlyTextOf(
                {
                    type: 'array',
                    items: {
                        type: 'string',
                    },
                },
                ['ferns', 'trees'],
                undefined
            )
        ).toBe('ferns, trees');
        expect(
            readOnlyTextOf(
                {
                    type: 'string',
                },
                '',
                undefined
            )
        ).toBeUndefined();
    });

    it('writes a date in the reader’s words', () => {
        expect(
            readOnlyTextOf(
                {
                    type: 'string',
                    format: 'date',
                },
                '2026-03-03',
                undefined,
                'en-GB'
            )
        ).toBe('3 Mar 2026');
    });
});
