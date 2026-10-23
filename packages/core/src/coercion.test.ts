import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { applyCoercion, coercionPlanFor, resolveCoercionPlans } from './coercion.js';
import { groupRoutes } from './routes.js';
import { readDef } from './zod-internals.js';
import type { RouteDefinition } from './types.js';

describe('coercion plans', () => {
    it('is null when no field can be coerced', () => {
        const schema = z.object({
            name: z.string(),
            status: z.enum(['open', 'closed']),
            id: z.uuid(),
        });
        expect(coercionPlanFor(schema)).toBeNull();
    });

    it('is null for a schema that is not an object', () => {
        expect(coercionPlanFor(z.string())).toBeNull();
    });

    it('lists only the fields that can be coerced', () => {
        const schema = z.object({
            name: z.string(),
            page: z.number(),
            limit: z.int(),
            active: z.boolean(),
            since: z.date(),
            cursor: z.bigint(),
        });
        expect(coercionPlanFor(schema)).toEqual([
            {
                key: 'page',
                type: 'number',
                array: false,
            },
            {
                key: 'limit',
                type: 'number',
                array: false,
            },
            {
                key: 'active',
                type: 'boolean',
                array: false,
            },
            {
                key: 'since',
                type: 'date',
                array: false,
            },
            {
                key: 'cursor',
                type: 'bigint',
                array: false,
            },
        ]);
    });

    it('plans every array field, typed by its element when that coerces', () => {
        const schema = z.object({
            ids: z.array(z.int()),
            tags: z.array(z.string()),
        });
        expect(coercionPlanFor(schema)).toEqual([
            {
                key: 'ids',
                type: 'number',
                array: true,
            },
            {
                key: 'tags',
                type: undefined,
                array: true,
            },
        ]);
    });

    it('looks through optional, default, and transform wrappers', () => {
        const schema = z.object({
            page: z.number().optional(),
            limit: z.number().default(10),
            offset: z.number().transform((value) => value + 1),
        });
        expect(coercionPlanFor(schema)?.map((field) => field.key)).toEqual(['page', 'limit', 'offset']);
    });

    it('reuses the plan it resolved for a schema', () => {
        const schema = z.object({
            page: z.number(),
        });
        expect(coercionPlanFor(schema)).toBe(coercionPlanFor(schema));
    });
});

describe('applyCoercion', () => {
    it('returns the input itself when the plan is null', () => {
        const input = {
            name: 'ada',
        };
        expect(applyCoercion(input, null)).toBe(input);
    });

    it('returns the input itself when no field changed', () => {
        const plan = coercionPlanFor(
            z.object({
                page: z.number(),
            })
        );
        const input = {
            page: 3,
        };
        expect(applyCoercion(input, plan)).toBe(input);
    });

    it('keeps keys the schema does not declare', () => {
        const plan = coercionPlanFor(
            z.object({
                page: z.number(),
            })
        );
        expect(
            applyCoercion(
                {
                    page: '3',
                    unknown: 'kept',
                },
                plan
            )
        ).toEqual({
            page: 3,
            unknown: 'kept',
        });
    });

    it('never invents a key the input does not carry', () => {
        const plan = coercionPlanFor(
            z.object({
                page: z.number(),
            })
        );
        expect(applyCoercion({}, plan)).toEqual({});
    });

    it.each([[''], [' '], ['\t']])('leaves a blank %j uncoerced for a number, an int and a bigint, so Zod rejects it', (blank) => {
        const schema = z.object({
            page: z.number(),
            limit: z.int(),
            cursor: z.bigint(),
        });
        const input = {
            page: blank,
            limit: blank,
            cursor: blank,
        };
        expect(applyCoercion(input, coercionPlanFor(schema))).toBe(input);
        expect(schema.safeParse(applyCoercion(input, coercionPlanFor(schema))).success).toBe(false);
    });

    it('leaves a blank item of a number list uncoerced', () => {
        const plan = coercionPlanFor(
            z.object({
                pages: z.array(z.number()),
            })
        );
        expect(
            applyCoercion(
                {
                    pages: ['1', ''],
                },
                plan
            )
        ).toEqual({
            pages: [1, ''],
        });
    });

    it('leaves values Zod should reject alone', () => {
        const plan = coercionPlanFor(
            z.object({
                page: z.number(),
                since: z.date(),
                cursor: z.bigint(),
            })
        );
        expect(
            applyCoercion(
                {
                    page: 'abc',
                    since: 'not-a-date',
                    cursor: 'not-a-bigint',
                },
                plan
            )
        ).toEqual({
            page: 'abc',
            since: 'not-a-date',
            cursor: 'not-a-bigint',
        });
    });

    it('coerces array elements', () => {
        const plan = coercionPlanFor(
            z.object({
                ids: z.array(z.int()),
            })
        );
        expect(
            applyCoercion(
                {
                    ids: ['3', '5'],
                },
                plan
            )
        ).toEqual({
            ids: [3, 5],
        });
    });

    it('reads a single value as a one-item list', () => {
        const plan = coercionPlanFor(
            z.object({
                ids: z.array(z.int()),
                tags: z.array(z.string()),
            })
        );
        expect(
            applyCoercion(
                {
                    ids: '3',
                    tags: 'work',
                },
                plan
            )
        ).toEqual({
            ids: [3],
            tags: ['work'],
        });
    });

    it('returns the input itself when every array field is already a list', () => {
        const plan = coercionPlanFor(
            z.object({
                tags: z.array(z.string()),
            })
        );
        const input = {
            tags: ['work', 'urgent'],
        };
        expect(applyCoercion(input, plan)).toBe(input);
    });
});

describe('startup resolution', () => {
    const swapShapeField = (schema: z.ZodType, key: string, replacement: z.ZodType): void => {
        readDef(schema).shape![key] = replacement;
    };

    it("resolves a route's plans before any request", () => {
        const query = z.object({
            page: z.number(),
        });
        const route: RouteDefinition = {
            method: 'GET',
            path: '/events',
            query,
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        };
        resolveCoercionPlans(route);
        swapShapeField(query, 'page', z.string());
        expect(coercionPlanFor(query)).toEqual([
            {
                key: 'page',
                type: 'number',
                array: false,
            },
        ]);
    });

    it('resolves plans when the routes are declared', () => {
        const query = z.object({
            page: z.number(),
        });
        groupRoutes({
            listEvents: {
                method: 'GET',
                path: '/events',
                query,
                responses: {
                    200: z.object({
                        ok: z.boolean(),
                    }),
                },
            },
        });
        swapShapeField(query, 'page', z.string());
        expect(coercionPlanFor(query)).toEqual([
            {
                key: 'page',
                type: 'number',
                array: false,
            },
        ]);
    });
});
