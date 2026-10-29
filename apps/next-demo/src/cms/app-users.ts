import { z } from 'zod';
import { and, asc, count, desc, eq, ilike, ne, or } from 'drizzle-orm';
import { defineView } from '@kizunajs/cms';
import { db } from '../db';
import { session, user } from '../auth/schema';

/**
 * What editors see for each role.
 */
const roles = {
    editor: 'Editor',
    admin: 'Admin',
};

/**
 * The column each field of `sorts` reads.
 */
const sortColumns = {
    name: user.name,
    signedUpAt: user.createdAt,
};

/**
 * A row of better-auth's table as the view's fields name it.
 */
const recordOf = (row: typeof user.$inferSelect) => ({
    ...row,
    signedUpAt: row.createdAt,
});

/**
 * Everyone who signs in, read from better-auth's own table. Any editor may
 * rename someone, and only an admin changes who is an admin. The list
 * filters by role and sorts by name or sign-up date in the database, one
 * page at a time.
 */
export const AppUsers = defineView({
    name: 'appUsers',
    label: 'App users',
    group: 'People',
    title: 'name',
    columns: ['name', 'email', 'role', 'signedUpAt'],
    search: ['name', 'email'],
    filters: ['role'],
    sorts: ['name', 'signedUpAt'],
    fields: [
        {
            name: 'name',
            schema: z.string().min(1).max(60),
        },
        {
            name: 'email',
            schema: z.email(),
            readOnly: true,
        },
        {
            name: 'role',
            schema: z.enum(['editor', 'admin']),
            options: roles,
            position: 'sidebar',
            auth: {
                roles: 'admin',
            },
        },
        {
            name: 'signedUpAt',
            label: 'Signed up',
            schema: z.iso.datetime(),
            readOnly: true,
            position: 'sidebar',
        },
    ],
    list: async ({ query, filters, orderBy, direction, limit, offset }) => {
        const pattern = `%${query}%`;
        const where = and(
            or(ilike(user.name, pattern), ilike(user.email, pattern)),
            or(
                ...filters.map((conditions) =>
                    and(
                        ...conditions.map((condition) =>
                            condition.operator === 'is'
                                ? eq(user[condition.field], condition.value)
                                : ne(user[condition.field], condition.value)
                        )
                    )
                )
            )
        );
        const column = sortColumns[orderBy ?? 'name'];
        const [counted] = await db
            .select({
                total: count(),
            })
            .from(user)
            .where(where);
        const page = db
            .select()
            .from(user)
            .where(where)
            .orderBy(direction === 'desc' ? desc(column) : asc(column))
            .offset(offset)
            .$dynamic();
        const rows = await (limit === undefined ? page : page.limit(limit));
        return {
            items: rows.map(recordOf),
            total: counted?.total ?? 0,
        };
    },
    get: async ({ id }) => {
        const [found] = await db.select().from(user).where(eq(user.id, id));
        return found === undefined ? null : recordOf(found);
    },
    actions: {
        save: async ({ id, data }) => {
            await db
                .update(user)
                .set({
                    name: data.name,
                    role: data.role,
                    updatedAt: new Date(),
                })
                .where(eq(user.id, id));
        },
        signOutEverywhere: {
            auth: {
                roles: 'admin',
            },
            confirm: 'Sign this person out on every device? They sign in again with their password.',
            handler: async ({ id }) => {
                await db.delete(session).where(eq(session.userId, id));
            },
        },
    },
});
