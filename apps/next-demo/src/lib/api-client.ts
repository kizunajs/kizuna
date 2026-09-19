import { createClient } from './api-client.generated';

export const apiClient = createClient({
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3030/api',
    requestContext: {
        'x-posthog-session-id': process.env.POSTHOG_SESSION_ID,
    },
});
