import { KizunaClient } from '@ts-kizuna/fetch';
import config from '../../kizuna.config';

export const apiClient = new KizunaClient(config.api, {
    baseUrl: process.env.BASE_URL ?? 'http://localhost:8001',
    requestContext: {
        'x-posthog-session-id': process.env.POSTHOG_SESSION_ID,
    },
});
