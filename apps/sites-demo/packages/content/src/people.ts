import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import type { Invitation, InvitationResult, Person, SitesChange } from '@kizunajs/cms';
import { db } from './db';
import { user } from './auth/schema';
import { auth, signInLinks } from './auth';
import { readSites } from './identities';

/**
 * Everyone who may edit, read from better-auth's users. The id is the email,
 * which is what the editor identity names its caller by.
 */
export const editors = async (): Promise<Person[]> => {
    const rows = await db
        .select()
        .from(user)
        .where(inArray(user.role, ['editor', 'admin']));
    return rows.map((row) => ({
        id: row.email,
        name: row.name,
        email: row.email,
        roles: [row.role],
        sites: readSites(row.sites),
        ...(row.image === null
            ? {}
            : {
                  image: row.image,
              }),
    }));
};

/**
 * Adds an editor with no password, and hands back the link that signs them
 * in, since the demo sends no email.
 */
export const inviteEditor = async ({ email, sites }: Invitation): Promise<InvitationResult> => {
    await db.insert(user).values({
        id: randomUUID(),
        name: email.split('@')[0]!,
        email,
        role: 'editor',
        sites: JSON.stringify(sites),
    });
    await auth.api.signInMagicLink({
        body: {
            email,
            callbackURL: '/admin',
        },
        headers: new Headers(),
    });
    const link = signInLinks.get(email);
    signInLinks.delete(email);
    return {
        id: email,
        ...(link === undefined
            ? {}
            : {
                  link,
              }),
    };
};

/**
 * Stores an editor's role on each site.
 */
export const setEditorSites = async ({ id, sites }: SitesChange): Promise<void> => {
    await db
        .update(user)
        .set({
            sites: JSON.stringify(sites),
            updatedAt: new Date(),
        })
        .where(eq(user.email, id));
};
