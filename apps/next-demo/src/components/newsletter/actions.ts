'use server';

export interface NewsletterState {
    subscribed: boolean;
}

/**
 * Signs someone up for the newsletter. The demo keeps no list, so the
 * sign-up goes to the server log.
 */
export const subscribe = async (_state: NewsletterState, formData: FormData): Promise<NewsletterState> => {
    console.log(`[demo] ${String(formData.get('email') ?? '')} subscribed to the newsletter`);
    return {
        subscribed: true,
    };
};
