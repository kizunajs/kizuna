import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { diffSchemas as diffSchemaNodes } from './diff-schemas.js';
import { toSchemaNode } from './snapshot.js';

const diffSchemas = (before: z.ZodType | undefined, after: z.ZodType | undefined, direction: 'request' | 'response', path?: string) =>
    diffSchemaNodes(before && toSchemaNode(before), after && toSchemaNode(after), direction, path);

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

describe('a field becoming nullable', () => {
    const before = z.object({
        nickname: z.string(),
    });
    const after = z.object({
        nickname: z.string().nullable(),
    });

    it('breaks a response, because callers decode a value that was never null', () => {
        expect(summaries(before, after, 'response')).toEqual(['BREAKING nickname can now be null']);
    });

    it('does not break a request, because callers may keep sending a string', () => {
        expect(summaries(before, after, 'request')).toEqual(['changed  nickname can now be null']);
    });

    it('reads a union with null the same as .nullable()', () => {
        expect(
            summaries(
                before,
                z.object({
                    nickname: z.union([z.string(), z.null()]),
                }),
                'response'
            )
        ).toEqual(['BREAKING nickname can now be null']);
    });

    it('reports an array element that can now be null', () => {
        expect(
            summaries(
                z.object({
                    tags: z.array(z.string()),
                }),
                z.object({
                    tags: z.array(z.string().nullable()),
                }),
                'response'
            )
        ).toEqual(['BREAKING tags[] can now be null']);
    });
});

describe('a field no longer nullable', () => {
    const before = z.object({
        nickname: z.string().nullable(),
    });
    const after = z.object({
        nickname: z.string(),
    });

    it('breaks a request, because callers sending null are rejected', () => {
        expect(summaries(before, after, 'request')).toEqual(['BREAKING nickname can no longer be null']);
    });

    it('does not break a response, because callers already handle a string', () => {
        expect(summaries(before, after, 'response')).toEqual(['changed  nickname can no longer be null']);
    });
});

describe('a field becoming optional', () => {
    const before = z.object({
        email: z.string(),
    });
    const after = z.object({
        email: z.string().optional(),
    });

    it('breaks a response, because callers read a key that may now be missing', () => {
        expect(summaries(before, after, 'response')).toEqual(['BREAKING email may now be left out']);
    });

    it('does not break a request, because callers may keep sending it', () => {
        expect(summaries(before, after, 'request')).toEqual(['changed  email is now optional']);
    });

    it('reports both halves of .nullish()', () => {
        expect(
            summaries(
                before,
                z.object({
                    email: z.string().nullish(),
                }),
                'response'
            )
        ).toEqual(['BREAKING email may now be left out', 'BREAKING email can now be null']);
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

describe('extensible enums and unions, whose clients take members they do not know', () => {
    const statusOf = (values: [string, ...string[]]) =>
        z.object({
            status: z.enum(values).meta({
                extensible: true,
            }),
        });

    it('do not break a response when a value is added', () => {
        expect(summaries(statusOf(['open', 'shipped']), statusOf(['open', 'shipped', 'returned']), 'response')).toEqual([
            'changed  status can now be returned',
        ]);
    });

    it('still break either direction when a value is removed', () => {
        expect(summaries(statusOf(['open', 'shipped']), statusOf(['open']), 'response')).toEqual([
            'BREAKING status no longer accepts shipped',
        ]);
    });

    const TaskCreated = z.object({
        kind: z.literal('taskCreated'),
        title: z.string(),
    });
    const CommentAdded = z.object({
        kind: z.literal('commentAdded'),
        body: z.string(),
    });
    const TaskDeleted = z.object({
        kind: z.literal('taskDeleted'),
    });
    const feedOf = (options: [z.ZodObject, ...z.ZodObject[]], extensible: boolean) =>
        z.object({
            activity: z.discriminatedUnion('kind', options).meta({
                extensible,
            }),
        });

    it('do not break a response when a union gains a member', () => {
        const changes = summaries(
            feedOf([TaskCreated, CommentAdded], true),
            feedOf([TaskCreated, CommentAdded, TaskDeleted], true),
            'response'
        );
        expect(changes).toHaveLength(1);
        expect(changes[0]).toMatch(/^changed /);
    });

    it('break a response when a union that is not extensible gains a member', () => {
        const changes = summaries(
            feedOf([TaskCreated, CommentAdded], false),
            feedOf([TaskCreated, CommentAdded, TaskDeleted], false),
            'response'
        );
        expect(changes[0]).toMatch(/^BREAKING /);
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

describe('a model that holds itself', () => {
    const before = Kizuna.model({
        title: 'EventFilter',
        schema: z.object({
            city: z.string().optional(),
            get or() {
                return z.array(before).optional();
            },
        }),
    });
    const after = Kizuna.model({
        title: 'EventFilter',
        schema: z.object({
            city: z.string().optional(),
            country: z.string(),
            get or() {
                return z.array(after).optional();
            },
        }),
    });

    it('is quiet when nothing changed', () => {
        expect(summaries(before, before, 'request')).toEqual([]);
    });

    it('reports a field it gains once, not once per level', () => {
        expect(summaries(before, after, 'request')).toEqual(['BREAKING country is now required']);
    });
});

describe('a field inside an object in a query', () => {
    const before = z.object({
        filter: z.object({
            city: z.string(),
        }),
    });
    const after = z.object({
        filter: z.object({
            city: z.string(),
            country: z.string(),
        }),
    });

    it('breaks a request when it becomes required, like any nested field', () => {
        expect(summaries(before, after, 'request')).toEqual(['BREAKING filter.country is now required']);
    });
});

describe('a type that widens to a union', () => {
    const before = z.object({
        city: z.string(),
    });
    const after = z.object({
        city: z.union([
            z.string(),
            z.object({
                contains: z.string(),
            }),
        ]),
    });

    it('does not break a request, because the server still takes what callers send', () => {
        expect(summaries(before, after, 'request')).toEqual(['changed  city widens from string to string | object']);
    });

    it('says the clients change and the HTTP surface does not', () => {
        expect(diffSchemas(before, after, 'request')[0]?.detail).toBe('the generated client type changes, the HTTP surface does not');
    });

    it('breaks a response, because callers may read what they never handled', () => {
        expect(summaries(before, after, 'response')).toEqual(['BREAKING city is string | object instead of string']);
    });
});

describe('a union that narrows to one of its options', () => {
    const before = z.object({
        city: z.union([z.string(), z.number()]),
    });
    const after = z.object({
        city: z.string(),
    });

    it('does not break a response, because callers already handle that option', () => {
        expect(summaries(before, after, 'response')).toEqual(['changed  city narrows from string | number to string']);
    });

    it('breaks a request, because callers may send the option that left', () => {
        expect(summaries(before, after, 'request')).toEqual(['BREAKING city is string instead of string | number']);
    });
});

describe('a union that changes its options', () => {
    const before = z.object({
        city: z.union([z.string(), z.number()]),
    });

    it('is quiet when only the order changes', () => {
        const after = z.object({
            city: z.union([z.number(), z.string()]),
        });
        expect(summaries(before, after, 'request')).toEqual([]);
        expect(summaries(before, after, 'response')).toEqual([]);
    });

    it('widens a request and breaks a response when an option arrives', () => {
        const after = z.object({
            city: z.union([z.string(), z.number(), z.boolean()]),
        });
        expect(summaries(before, after, 'request')).toEqual(['changed  city widens from string | number to string | number | boolean']);
        expect(summaries(before, after, 'response')).toEqual(['BREAKING city is string | number | boolean instead of string | number']);
    });
});

describe('a type that changes to an unrelated one', () => {
    it('breaks both ways', () => {
        const before = z.object({
            count: z.string(),
        });
        const after = z.object({
            count: z.number(),
        });
        expect(summaries(before, after, 'request')).toEqual(['BREAKING count is number instead of string']);
        expect(summaries(before, after, 'response')).toEqual(['BREAKING count is number instead of string']);
    });
});
