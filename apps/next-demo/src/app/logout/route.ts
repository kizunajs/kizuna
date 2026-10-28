import { draftMode, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../../auth';

/**
 * `/logout`, the CMS admin's Sign out link. A link sends GET, and better-auth
 * signs out on POST alone, so this ends the session through its server API.
 * `nextCookies()` clears the session cookies on the redirect.
 */
export async function GET(): Promise<never> {
    await auth.api.signOut({
        headers: await headers(),
    });
    (await draftMode()).disable();
    redirect('/login');
}
