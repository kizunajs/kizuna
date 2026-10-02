'use server';

import { redirect } from 'next/navigation';
import { apiClient } from '../../lib/api-client';

export const sendContactMessage = async (formData: FormData): Promise<void> => {
    await apiClient.contact.send({
        body: {
            name: String(formData.get('name') ?? ''),
            email: String(formData.get('email') ?? ''),
            message: String(formData.get('message') ?? ''),
        },
    });
    redirect('/contact?sent=1');
};
