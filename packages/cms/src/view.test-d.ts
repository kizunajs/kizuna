import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { defineView, type View } from './view-definition.js';

test('list receives conditions typed by the fields of `filters`, and `orderBy` from `sorts`', () => {
    defineView({
        name: 'appUsers',
        fields: [
            {
                name: 'name',
                schema: z.string(),
            },
            {
                name: 'role',
                schema: z.enum(['editor', 'admin']),
            },
            {
                name: 'tags',
                schema: z.array(z.enum(['beta', 'staff'])).optional(),
            },
            {
                name: 'signedUpAt',
                schema: z.iso.datetime(),
            },
        ],
        filters: ['role', 'tags'],
        sorts: ['name', 'signedUpAt'],
        list: ({ filters, orderBy, direction, limit, offset }) => {
            const condition = filters[0]![0]!;
            if (condition.field === 'role') expectTypeOf(condition.value).toEqualTypeOf<'editor' | 'admin'>();
            if (condition.field === 'tags') expectTypeOf(condition.value).toEqualTypeOf<'beta' | 'staff'>();
            expectTypeOf(condition.operator).toEqualTypeOf<'is' | 'isNot'>();
            expectTypeOf(orderBy).toEqualTypeOf<'name' | 'signedUpAt' | undefined>();
            expectTypeOf(direction).toEqualTypeOf<'asc' | 'desc'>();
            expectTypeOf(limit).toEqualTypeOf<number | undefined>();
            expectTypeOf(offset).toEqualTypeOf<number>();
            return {
                items: [],
                total: 0,
            };
        },
        get: () => undefined,
    });
});

test('a view that names no filters or sorts receives no conditions and no sort, and still returns a plain array', () => {
    const AppUsers = defineView({
        name: 'appUsers',
        fields: [
            {
                name: 'name',
                schema: z.string(),
            },
            {
                name: 'role',
                schema: z.enum(['editor', 'admin']),
            },
            {
                name: 'tags',
                schema: z.array(z.enum(['beta', 'staff'])).optional(),
            },
            {
                name: 'signedUpAt',
                schema: z.iso.datetime(),
            },
        ],
        list: ({ filters, orderBy }) => {
            expectTypeOf(filters).toEqualTypeOf<ReadonlyArray<ReadonlyArray<never>>>();
            expectTypeOf(orderBy).toEqualTypeOf<undefined>();
            return [];
        },
        get: () => undefined,
    });
    expectTypeOf(AppUsers).toExtend<View>();
});

test('a view filters and sorts only by its own fields', () => {
    defineView({
        name: 'appUsers',
        fields: [
            {
                name: 'name',
                schema: z.string(),
            },
        ],
        // @ts-expect-error 'plan' is not one of its fields.
        filters: ['plan'],
        list: () => [],
        get: () => undefined,
    });
    defineView({
        name: 'appUsers',
        fields: [
            {
                name: 'name',
                schema: z.string(),
            },
        ],
        // @ts-expect-error 'plan' is not one of its fields.
        sorts: ['plan'],
        list: () => [],
        get: () => undefined,
    });
});
