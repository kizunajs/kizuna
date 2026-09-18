import { k } from '@ts-kizuna-demo/shared';

export const captureAnalytics = k.requestContext('analytics', ({ headers }) => ({
    sessionId: headers['x-posthog-session-id'] ?? null,
    distinctId: headers['x-posthog-distinct-id'] ?? null,
}));
