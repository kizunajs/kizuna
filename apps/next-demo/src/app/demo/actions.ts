'use server';

import { revalidatePath } from 'next/cache';
import { apiClient } from '../../lib/api-client';
import { toUserId } from '../../lib/api-client.generated';

export const createUserAction = async (formData: FormData) => {
    const name = String(formData.get('name') ?? '');
    const email = String(formData.get('email') ?? '');
    await apiClient.users.createUser({
        body: {
            name,
            email,
        },
    });
    revalidatePath('/demo');
};

export const deleteUserAction = async (formData: FormData) => {
    const id = String(formData.get('id') ?? '');
    if (!id) return;
    await apiClient.users.deleteUser({
        params: {
            id: toUserId(id),
        },
    });
    revalidatePath('/demo');
};
