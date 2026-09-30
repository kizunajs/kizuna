import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readRequestRules, readSchemaRules, validatesRequest } from './request-rules.js';
import type { RouteDefinition } from './types.js';

describe('readSchemaRules', () => {
    it('reads an object with string, number, boolean, enum and array fields', () => {
        const rules = readSchemaRules(
            z.object({
                name: z.string().min(1, 'Name is required').max(80),
                mail: z.email('Enter a valid mail address'),
                postalCode: z.string().regex(/^\d{4}$/, 'Four digits'),
                age: z.int().gte(18),
                price: z.number().gt(0).multipleOf(0.5).optional(),
                newsletter: z.boolean().default(false),
                role: z.enum(['admin', 'member']),
                tags: z.array(z.string().min(1)).min(1).max(5),
                nickname: z.string().nullable(),
            })
        );
        expect(rules).toMatchObject({
            kind: 'object',
            required: true,
            strict: false,
            fields: {
                name: {
                    kind: 'string',
                    required: true,
                    minLength: 1,
                    maxLength: 80,
                    messages: {
                        too_short: 'Name is required',
                    },
                },
                mail: {
                    kind: 'string',
                    format: 'email',
                    messages: {
                        invalid_format: 'Enter a valid mail address',
                    },
                },
                postalCode: {
                    kind: 'string',
                    pattern: '^\\d{4}$',
                    messages: {
                        pattern_mismatch: 'Four digits',
                    },
                },
                age: {
                    kind: 'number',
                    integer: true,
                    minimum: 18,
                },
                price: {
                    kind: 'number',
                    integer: false,
                    required: false,
                    exclusiveMinimum: 0,
                    multipleOf: 0.5,
                },
                newsletter: {
                    kind: 'boolean',
                    required: false,
                },
                role: {
                    kind: 'enum',
                    values: ['admin', 'member'],
                },
                tags: {
                    kind: 'array',
                    minItems: 1,
                    maxItems: 5,
                    items: {
                        kind: 'string',
                        minLength: 1,
                    },
                },
                nickname: {
                    kind: 'string',
                    nullable: true,
                },
            },
        });
        expect((rules as { fields: Record<string, { maximum?: number }> }).fields.age?.maximum).toBeUndefined();
    });

    it('reads a fixed length, a strict object and a nested object', () => {
        const rules = readSchemaRules(
            z.strictObject({
                address: z.object({
                    zip: z.string().length(4, 'Four characters'),
                }),
            })
        );
        expect(rules).toMatchObject({
            kind: 'object',
            strict: true,
            fields: {
                address: {
                    kind: 'object',
                    fields: {
                        zip: {
                            kind: 'string',
                            length: 4,
                            messages: {
                                wrong_length: 'Four characters',
                            },
                        },
                    },
                },
            },
        });
    });

    it('leaves what the clients cannot check as unknown', () => {
        const rules = readSchemaRules(
            z.object({
                either: z.union([z.string(), z.number()]),
                map: z.record(z.string(), z.number()),
                refined: z.string().refine((value) => value !== 'x'),
            })
        );
        expect(rules).toMatchObject({
            fields: {
                either: {
                    kind: 'unknown',
                },
                map: {
                    kind: 'unknown',
                },
                refined: {
                    kind: 'string',
                },
            },
        });
    });

    it('keeps the message a type was given for required and invalid_type', () => {
        const rules = readSchemaRules(
            z.object({
                phone: z.string({
                    error: 'Phone must be text',
                }),
            })
        );
        expect(rules).toMatchObject({
            fields: {
                phone: {
                    messages: {
                        required: 'Phone must be text',
                        invalid_type: 'Phone must be text',
                    },
                },
            },
        });
    });
});

describe('readRequestRules and validatesRequest', () => {
    const route = (definition: Partial<RouteDefinition>): RouteDefinition =>
        ({
            method: 'POST',
            path: '/things',
            responses: {},
            ...definition,
        }) as RouteDefinition;

    it('reads every declared part and nothing else', () => {
        const rules = readRequestRules(
            route({
                query: z.object({
                    page: z.number().optional(),
                }),
                body: z.object({
                    name: z.string(),
                }),
            })
        );
        expect(Object.keys(rules)).toEqual(['query', 'body']);
    });

    it('answers whether a request can fail validation', () => {
        expect(validatesRequest(route({}))).toBe(false);
        expect(validatesRequest(route({ body: z.void() }))).toBe(false);
        expect(validatesRequest(route({ headers: z.object({ 'x-trace': z.string() }) }))).toBe(true);
        expect(validatesRequest(route({ pathParams: z.object({ id: z.string() }) }))).toBe(true);
    });
});
