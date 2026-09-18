import { getHeaderValue } from '@ts-kizuna/core';
import { k } from '@ts-kizuna-demo/shared';

export const captureAnalytics = k.requestContext('analytics', ({ headers }) => ({
    sessionId: getHeaderValue(headers['x-posthog-session-id']) ?? null,
    distinctId: getHeaderValue(headers['x-posthog-distinct-id']) ?? null,
}));
