'use server';

import { draftMode, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../../auth';

export const signOut = async (): Promise<void> => {
    await auth.api.signOut({
        headers: await headers(),
    });
    (await draftMode()).disable();
    redirect('/admin/login?next=/cms');
};
