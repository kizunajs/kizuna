import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { bearer } from 'better-auth/plugins';
import { db } from '../db';
import { account, session, user, verification } from './schema';

/**
 * Editors sign in with email and password. The browser carries the session as
 * a cookie, and an MCP client or the CLI sends the same session token as a
 * bearer.
 */
export const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3030',
    secret: process.env.BETTER_AUTH_SECRET ?? 'kizuna-demo-secret-set-BETTER_AUTH_SECRET-anywhere-real',
    database: drizzleAdapter(db, {
        provider: 'pg',
        schema: {
            user,
            session,
            account,
            verification,
        },
    }),
    emailAndPassword: {
        enabled: true,
    },
    user: {
        additionalFields: {
            role: {
                type: 'string',
                defaultValue: 'editor',
                input: false,
            },
        },
    },
    plugins: [bearer(), nextCookies()],
});
