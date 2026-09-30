import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HandlerValidationError, toValidationIssue, toValidationIssues } from './validation-error.js';
import { addCodedIssue } from './coded-issue.js';

const issuesOf = (schema: z.ZodType, input: unknown) => {
    const result = schema.safeParse(input, {
        reportInput: true,
    });
    if (result.success) throw new Error('expected the input to fail');
    return toValidationIssues(result.error.issues);
};

describe('toValidationIssue', () => {
    it('maps a missing field to required', () => {
        expect(issuesOf(z.object({ name: z.string() }), {})).toEqual([
            {
                code: 'required',
                path: ['name'],
                message: expect.any(String),
            },
        ]);
    });

    it('maps a wrong type to invalid_type with what was expected', () => {
        expect(issuesOf(z.object({ age: z.int() }), { age: 17.5 })).toEqual([
            {
                code: 'invalid_type',
                path: ['age'],
                message: expect.any(String),
                expected: 'int',
            },
        ]);
    });

    it('maps string length rules to too_short, too_long and wrong_length', () => {
        expect(issuesOf(z.string().min(3), 'ab')).toEqual([
            {
                code: 'too_short',
                path: [],
                message: expect.any(String),
                minimum: 3,
            },
        ]);
        expect(issuesOf(z.string().max(2), 'abc')).toEqual([
            {
                code: 'too_long',
                path: [],
                message: expect.any(String),
                maximum: 2,
            },
        ]);
        expect(issuesOf(z.string().length(4), '12')).toEqual([
            {
                code: 'wrong_length',
                path: [],
                message: expect.any(String),
                length: 4,
            },
        ]);
    });

    it('maps number bounds to too_small and too_big, with inclusive', () => {
        expect(issuesOf(z.number().gte(18), 17)).toEqual([
            {
                code: 'too_small',
                path: [],
                message: expect.any(String),
                minimum: 18,
                inclusive: true,
            },
        ]);
        expect(issuesOf(z.number().lt(10), 10)).toEqual([
            {
                code: 'too_big',
                path: [],
                message: expect.any(String),
                maximum: 10,
                inclusive: false,
            },
        ]);
    });

    it('maps array length rules to too_few and too_many', () => {
        expect(issuesOf(z.array(z.string()).min(1), [])).toEqual([
            {
                code: 'too_few',
                path: [],
                message: expect.any(String),
                minimum: 1,
            },
        ]);
        expect(issuesOf(z.array(z.string()).max(1), ['a', 'b'])).toEqual([
            {
                code: 'too_many',
                path: [],
                message: expect.any(String),
                maximum: 1,
            },
        ]);
    });

    it('maps a format to invalid_format and a regex to pattern_mismatch with its source', () => {
        expect(issuesOf(z.email(), 'nope')).toEqual([
            {
                code: 'invalid_format',
                path: [],
                message: expect.any(String),
                format: 'email',
            },
        ]);
        expect(issuesOf(z.string().regex(/^\d{4}$/, 'Four digits'), 'ab')).toEqual([
            {
                code: 'pattern_mismatch',
                path: [],
                message: 'Four digits',
                pattern: '^\\d{4}$',
            },
        ]);
    });

    it('maps enums, multiples and strict objects', () => {
        expect(issuesOf(z.enum(['admin', 'member']), 'guest')).toEqual([
            {
                code: 'not_one_of',
                path: [],
                message: expect.any(String),
                values: ['admin', 'member'],
            },
        ]);
        expect(issuesOf(z.number().multipleOf(0.5), 0.3)).toEqual([
            {
                code: 'not_multiple_of',
                path: [],
                message: expect.any(String),
                divisor: 0.5,
            },
        ]);
        expect(issuesOf(z.strictObject({ zip: z.string() }), { zip: '1', extra: 1 })).toEqual([
            {
                code: 'unknown_key',
                path: [],
                message: expect.any(String),
                keys: ['extra'],
            },
        ]);
    });

    it('sends array indexes as strings', () => {
        expect(issuesOf(z.object({ tags: z.array(z.string().min(1)) }), { tags: ['a', ''] })).toEqual([
            {
                code: 'too_short',
                path: ['tags', '1'],
                message: expect.any(String),
                minimum: 1,
            },
        ]);
    });

    it('maps a refine without a code to invalid', () => {
        expect(
            issuesOf(
                z.string().refine(() => false, 'nope'),
                'x'
            )
        ).toEqual([
            {
                code: 'invalid',
                path: [],
                message: 'nope',
            },
        ]);
    });

    it('passes a declared code through with its params flat', () => {
        const schema = z.string().superRefine((value, ctx) => {
            addCodedIssue(ctx, {
                code: 'invalid_phone_number',
                message: 'Not a valid number',
                input: value,
                params: {
                    country: 'NO',
                    code: 'ignored',
                },
            });
        });
        expect(issuesOf(schema, 'x')).toEqual([
            {
                code: 'invalid_phone_number',
                path: [],
                message: 'Not a valid number',
                country: 'NO',
            },
        ]);
    });

    it('keeps the message a rule was given', () => {
        expect(toValidationIssue(issuesOfRaw(z.string().min(1, 'Name is required'), ''))).toMatchObject({
            code: 'too_short',
            message: 'Name is required',
        });
    });
});

const issuesOfRaw = (schema: z.ZodType, input: unknown) => {
    const result = schema.safeParse(input);
    if (result.success) throw new Error('expected the input to fail');
    return result.error.issues[0]!;
};

describe('HandlerValidationError', () => {
    it('flattens params beside code, path and message, and takes its message from the first issue', () => {
        const error = new HandlerValidationError([
            {
                code: 'not_found',
                path: ['categoryId'],
                message: 'Category does not exist',
                params: {
                    categoryId: '9',
                    path: 'ignored',
                },
            },
        ]);
        expect(error.message).toBe('Category does not exist');
        expect(error.issues).toEqual([
            {
                code: 'not_found',
                path: ['categoryId'],
                message: 'Category does not exist',
                categoryId: '9',
            },
        ]);
    });
});
