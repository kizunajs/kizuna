import { z } from 'zod';
import { getHeaderValue } from '@ts-kizuna/core';
import { k } from './k';

/**
 * PostHog ids clients send once, on the client initializer; every handler
 * receives them resolved.
 */
export const analytics = k
    .requestContext({
        headers: z.object({
            'x-posthog-session-id': z.string().optional(),
            'x-posthog-distinct-id': z.string().optional(),
        }),
        context: z.object({
            sessionId: z.string().nullable(),
            distinctId: z.string().nullable(),
        }),
    })
    .handler(({ headers }) => ({
        sessionId: getHeaderValue(headers['x-posthog-session-id']) ?? null,
        distinctId: getHeaderValue(headers['x-posthog-distinct-id']) ?? null,
    }));
