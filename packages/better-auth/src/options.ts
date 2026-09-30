import { z } from 'zod';
import { RouteAuthSchema } from 'kizunajs/plugin';
import type { BetterAuthEventHandlers } from './webhooks.js';

/**
 * The webhook route always has a caller: the Better Auth app, signed in as one
 * of the API's own identities.
 */
const WebhookAuthSchema = RouteAuthSchema.refine((auth) => auth !== false, {
    error: 'must name the identity the Better Auth app calls with',
});

export type BetterAuthRouteAuth = z.output<typeof WebhookAuthSchema>;

export const BetterAuthPluginOptionsSchema = z.object({
    /**
     * The identity the Better Auth app calls the webhook route with, written as
     * a route's `auth`.
     *
     * @example
     * auth: 'betterAuthApp',
     */
    auth: WebhookAuthSchema,
    /**
     * What runs for each forwarded callback, keyed by its Better Auth option
     * name.
     */
    on: z.custom<BetterAuthEventHandlers>((value) => typeof value === 'object' && value !== null, {
        error: 'must map event names to functions',
    }),
});

export type BetterAuthPluginProps = z.output<typeof BetterAuthPluginOptionsSchema>;
