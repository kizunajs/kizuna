import { z } from 'zod';
import { asc, eq, ilike, or } from 'drizzle-orm';
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
 * Everyone who signs in, read from better-auth's own table. Any editor may
 * rename someone, and only an admin changes who is an admin.
 */
export const AppUsers = defineView({
    name: 'appUsers',
    label: 'App users',
    group: 'People',
    title: 'name',
    columns: ['name', 'email', 'role'],
    search: ['name', 'email'],
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
    ],
    list: async ({ query }) => {
        const pattern = `%${query}%`;
        return db
            .select()
            .from(user)
            .where(or(ilike(user.name, pattern), ilike(user.email, pattern)))
            .orderBy(asc(user.name));
    },
    get: async ({ id }) => {
        const [found] = await db.select().from(user).where(eq(user.id, id));
        return found ?? null;
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
