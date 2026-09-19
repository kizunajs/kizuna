import { KizunaClient } from '@ts-kizuna/fetch';
import kizuna from '../../kizuna.config';

export const apiClient = new KizunaClient(kizuna.api, {
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3030/api',
    requestContext: {
        'x-posthog-session-id': process.env.POSTHOG_SESSION_ID,
    },
});
