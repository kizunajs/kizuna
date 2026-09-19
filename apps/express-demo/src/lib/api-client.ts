import { KizunaClient } from '@ts-kizuna/fetch';
import kizuna from '../../kizuna.config';

export const apiClient = new KizunaClient(kizuna.api, {
    baseUrl: process.env.BASE_URL ?? 'http://localhost:8000',
    requestContext: {
        'x-posthog-session-id': process.env.POSTHOG_SESSION_ID,
    },
});
