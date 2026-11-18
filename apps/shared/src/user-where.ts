import { Kizuna } from 'kizunajs';
import { z } from 'zod';
import type { User } from './types';

/**
 * A condition on a text field.
 */
export const TextFilterSchema = Kizuna.model({
    title: 'TextFilter',
    schema: z.object({
        equals: z.string().optional(),
        contains: z.string().optional(),
    }),
});

/**
 * Which users to list. Every field in one filter must match. `and` needs all of its filters and `or` any of them.
 */
export const UserWhereSchema = Kizuna.model({
    title: 'UserWhere',
    schema: z.object({
        name: TextFilterSchema.optional(),
        email: TextFilterSchema.optional(),
        get and() {
            return z.array(UserWhereSchema).optional();
        },
        get or() {
            return z.array(UserWhereSchema).optional();
        },
    }),
});

export type UserWhere = z.output<typeof UserWhereSchema>;
type TextFilter = z.output<typeof TextFilterSchema>;

const matchesText = (value: string, filter: TextFilter): boolean => {
    if (filter.equals !== undefined && value !== filter.equals) return false;
    if (filter.contains !== undefined && !value.toLowerCase().includes(filter.contains.toLowerCase())) return false;
    return true;
};

export const matchesUserWhere = (user: User, where: UserWhere): boolean => {
    if (where.name !== undefined && !matchesText(user.name, where.name)) return false;
    if (where.email !== undefined && !matchesText(user.email, where.email)) return false;
    if (where.and !== undefined && !where.and.every((filter) => matchesUserWhere(user, filter))) return false;
    if (where.or !== undefined && !where.or.some((filter) => matchesUserWhere(user, filter))) return false;
    return true;
};
