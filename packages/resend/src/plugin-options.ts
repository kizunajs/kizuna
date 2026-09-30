import { z } from 'zod';
import { ResendClientOptionsSchema } from './options.js';
import type { ResendEventHandlers } from './webhooks.js';

export const ResendPluginOptionsSchema = ResendClientOptionsSchema.safeExtend({
    /**
     * The webhook's signing secret. The webhook route is served when it's set.
     */
    webhookSecret: z.string().optional(),
    /**
     * What runs for each webhook event, keyed by its type.
     */
    on: z
        .custom<ResendEventHandlers>((value) => typeof value === 'object' && value !== null, {
            error: 'must map event types to functions',
        })
        .optional(),
}).refine((options) => options.on === undefined || options.webhookSecret !== undefined, {
    error: 'is required when `on` is set',
    path: ['webhookSecret'],
});

export type ResendPluginProps = z.output<typeof ResendPluginOptionsSchema>;
