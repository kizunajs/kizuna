'use server';

import { redirect } from 'next/navigation';
import { apiClient } from '../../lib/api-client';

export const sendContactMessage = async (formData: FormData): Promise<void> => {
    const subject = String(formData.get('subject') ?? '');
    const message = String(formData.get('message') ?? '');
    await apiClient.contact.send({
        body: {
            name: String(formData.get('name') ?? ''),
            email: String(formData.get('email') ?? ''),
            message: subject === '' ? message : `${subject}\n\n${message}`,
        },
    });
    redirect('/contact?sent=1');
};
