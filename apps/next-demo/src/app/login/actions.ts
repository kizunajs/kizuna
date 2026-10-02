'use server';

import type { Route } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../../auth';

const safeNext = (value: FormDataEntryValue | null): Route => {
    const next = typeof value === 'string' ? value : '';
    return (next.startsWith('/') && !next.startsWith('//') ? next : '/cms') as Route;
};

export const signIn = async (formData: FormData): Promise<void> => {
    const next = safeNext(formData.get('next'));
    try {
        await auth.api.signInEmail({
            body: {
                email: String(formData.get('email') ?? ''),
                password: String(formData.get('password') ?? ''),
            },
            headers: await headers(),
        });
    } catch {
        redirect(`/login?error=1&next=${encodeURIComponent(next)}` as Route);
    }
    redirect(next);
};

export const signOut = async (): Promise<void> => {
    await auth.api.signOut({
        headers: await headers(),
    });
    redirect('/login');
};
