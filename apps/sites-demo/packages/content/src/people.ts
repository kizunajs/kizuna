import { inArray } from 'drizzle-orm';
import type { Person } from '@kizunajs/cms';
import { db } from './db';
import { user } from './auth/schema';
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
