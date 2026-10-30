import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { bearer, magicLink } from 'better-auth/plugins';
import { db } from '../db';
import { sites } from '../sites';
import { account, session, user, verification } from './schema';

/**
 * The sign-in link better-auth last made for each email, which `invite` reads
 * back for the admin to copy, since the demo sends no email.
 */
export const signInLinks = new Map<string, string>();

/**
 * Editors sign in with email and password, on any of the three sites, or
 * with the link People hands someone it invites. Each site's address keeps
 * its own session cookie, over the one table of users.
 */
export const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? sites.values.group.url,
    secret: process.env.BETTER_AUTH_SECRET ?? 'kizuna-demo-secret-set-BETTER_AUTH_SECRET-anywhere-real',
    trustedOrigins: Object.values(sites.values).map((site) => site.url),
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
            sites: {
                type: 'string',
                defaultValue: '{}',
                input: false,
            },
        },
    },
    plugins: [
        bearer(),
        magicLink({
            expiresIn: 60 * 60 * 24 * 7,
            disableSignUp: true,
            sendMagicLink: ({ email, url }) => {
                signInLinks.set(email, url);
            },
        }),
        nextCookies(),
    ],
});
