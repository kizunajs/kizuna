import { createClient } from './api-client.generated';

export const apiClient = createClient({
    baseUrl: process.env.BASE_URL ?? 'http://localhost:8001',
    requestContext: {
        'x-posthog-session-id': process.env.POSTHOG_SESSION_ID,
    },
});
