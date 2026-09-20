import { KizunaTanstackQuery } from '@kizunajs/tanstack-query';
import { createClient } from './api-client.generated';

export const apiClient = createClient({
    baseUrl: '/api',
    requestContext: {
        'x-posthog-session-id': 'tanstack-query-demo',
    },
});

export const api = new KizunaTanstackQuery(apiClient);
