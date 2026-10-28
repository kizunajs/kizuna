import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { JsonSchema } from './schema.js';
import { stringInputOf } from './string-input.js';

const inputFor = (schema: z.ZodType): string => stringInputOf(z.toJSONSchema(schema) as JsonSchema);

describe('stringInputOf', () => {
    it('edits an email on one line, as an email', () => {
        expect(inputFor(z.email())).toBe('email');
    });

    it('edits a URL on one line, as a URL', () => {
        expect(inputFor(z.url())).toBe('url');
    });

    it('edits any other format on one line, as text', () => {
        expect(inputFor(z.uuid())).toBe('text');
        expect(inputFor(z.ipv4())).toBe('text');
    });

    it('keeps a format on one line however long it may be', () => {
        expect(inputFor(z.email().max(500))).toBe('email');
    });

    it('edits a plain string on one line', () => {
        expect(inputFor(z.string())).toBe('text');
        expect(inputFor(z.string().max(80))).toBe('text');
        expect(inputFor(z.string().max(120))).toBe('text');
    });

    it('gives a plain string allowed past 120 characters a textarea', () => {
        expect(inputFor(z.string().max(121))).toBe('textarea');
        expect(inputFor(z.string().max(500))).toBe('textarea');
    });
});
