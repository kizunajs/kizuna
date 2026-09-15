import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { diffSchemas } from './diff-schemas.js';

const summaries = (before: z.ZodType, after: z.ZodType, direction: 'request' | 'response') =>
    diffSchemas(before, after, direction).map((change) => `${change.breaking ? 'BREAKING' : 'changed '} ${change.summary}`);

describe('a field arriving', () => {
    const before = z.object({ name: z.string() });
    const after = z.object({ name: z.string(), organisationId: z.string() });

    it('breaks a request, because callers do not send it', () => {
        expect(summaries(before, after, 'request')).toEqual(['BREAKING organisationId is now required']);
    });

    it('does not break a response, because callers ignore it', () => {
        expect(summaries(before, after, 'response')).toEqual(['changed  organisationId is now part of the response']);
    });

    it('is quiet when the new field is optional in a request', () => {
        expect(summaries(before, z.object({ name: z.string(), nickname: z.string().optional() }), 'request')).toEqual([]);
    });
});

describe('a field leaving', () => {
    const before = z.object({ name: z.string(), nickname: z.string() });
    const after = z.object({ name: z.string() });

    it('breaks a response, because callers read it', () => {
        expect(summaries(before, after, 'response')).toEqual(['BREAKING nickname is gone']);
    });

    it('does not break a request, because callers may keep sending it', () => {
        expect(summaries(before, after, 'request')).toEqual(['changed  nickname is gone']);
    });
});

describe('a field tightening', () => {
    it('breaks a request when an optional field becomes required', () => {
        const before = z.object({ email: z.string().optional() });
        const after = z.object({ email: z.string() });

        expect(summaries(before, after, 'request')).toEqual(['BREAKING email is no longer optional']);
    });

    it('breaks either direction when the type changes', () => {
        const before = z.object({ count: z.string() });
        const after = z.object({ count: z.number() });

        expect(summaries(before, after, 'request')).toEqual(['BREAKING count is number instead of string']);
        expect(summaries(before, after, 'response')).toEqual(['BREAKING count is number instead of string']);
    });
});

describe('enums, where direction decides everything', () => {
    const before = z.object({ role: z.enum(['owner', 'member']) });

    it('breaks either direction when a value is removed', () => {
        const after = z.object({ role: z.enum(['owner']) });

        expect(summaries(before, after, 'request')).toEqual(['BREAKING role no longer accepts member']);
        expect(summaries(before, after, 'response')).toEqual(['BREAKING role no longer accepts member']);
    });

    it('breaks a response but not a request when a value is added', () => {
        const after = z.object({ role: z.enum(['owner', 'member', 'guest']) });

        expect(summaries(before, after, 'response')).toEqual(['BREAKING role can now be guest']);
        expect(summaries(before, after, 'request')).toEqual(['changed  role also accepts guest']);
    });
});

describe('nested shapes', () => {
    it('names the field by its path', () => {
        const before = z.object({ address: z.object({ city: z.string() }) });
        const after = z.object({ address: z.object({ city: z.string(), postcode: z.string() }) });

        expect(summaries(before, after, 'request')).toEqual(['BREAKING address.postcode is now required']);
    });

    it('follows into an array element', () => {
        const before = z.object({ items: z.array(z.object({ id: z.string() })) });
        const after = z.object({ items: z.array(z.object({ id: z.number() })) });

        expect(summaries(before, after, 'response')).toEqual(['BREAKING items[].id is number instead of string']);
    });
});

describe('a whole schema appearing or leaving', () => {
    it('breaks a request when a body becomes required', () => {
        expect(diffSchemas(undefined, z.object({ name: z.string() }), 'request')[0]).toMatchObject({
            breaking: true,
            summary: 'a body is now required',
        });
    });

    it('breaks a response when a body is removed', () => {
        expect(diffSchemas(z.object({ name: z.string() }), undefined, 'response')[0]).toMatchObject({
            breaking: true,
            summary: 'the body is gone',
        });
    });
});

describe('nothing changing', () => {
    it('says nothing', () => {
        const schema = z.object({ name: z.string(), tags: z.array(z.string()) });

        expect(diffSchemas(schema, schema, 'request')).toEqual([]);
        expect(diffSchemas(undefined, undefined, 'response')).toEqual([]);
    });
});
