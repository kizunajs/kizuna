import { describe, expect, it } from 'vitest';
import { lockReasonOf, readOnlyTextOf, readsAsText } from './read-only.js';

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

    it('writes a date and time as a list cell does', () => {
        expect(
            readOnlyTextOf(
                {
                    type: 'string',
                    format: 'date-time',
                },
                new Date(2026, 9, 30, 9, 41).toISOString(),
                undefined
            )
        ).toBe('30 Oct 2026, 09:41');
    });
});

describe('lockReasonOf', () => {
    it('names the roles that may change a field', () => {
        expect(
            lockReasonOf(
                {
                    readOnly: false,
                    roles: ['admin'],
                },
                false
            )
        ).toBe('Only admins can change this');
        expect(
            lockReasonOf(
                {
                    readOnly: false,
                    roles: ['admin', 'editor'],
                },
                false
            )
        ).toBe('Only admins or editors can change this');
    });

    it('says read only when nobody may change it, or no role is known', () => {
        expect(
            lockReasonOf(
                {
                    readOnly: true,
                    roles: ['admin'],
                },
                false
            )
        ).toBe('Read only');
        expect(
            lockReasonOf(
                {
                    readOnly: false,
                    roles: ['admin'],
                },
                true
            )
        ).toBe('Read only');
        expect(
            lockReasonOf(
                {
                    readOnly: false,
                },
                false
            )
        ).toBe('Read only');
    });
});
