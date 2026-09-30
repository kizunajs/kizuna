import { z } from 'zod';
import type { ResendOptions } from 'resend';
import type { ResendEmail } from './requests.js';

/**
 * A list an app sends to: the Resend segment its contacts sit in, and the topic
 * they opt in and out of.
 */
export const ResendListSchema = z.object({
    /**
     * The segment the list's contacts are added to, and broadcasts go to.
     */
    segmentId: z.string(),
    /**
     * The topic a contact opts in and out of, so unsubscribing from one list
     * leaves the others alone.
     */
    topicId: z.string().optional(),
});

/**
 * The loosest of Zod's email patterns, so the plugin never refuses an address
 * Resend would accept.
 */
const EmailSchema = z.email({
    pattern: z.regexes.unicodeEmail,
});

/**
 * A sender as Resend takes it: an address, or a name and an address in angle
 * brackets.
 */
const isSender = (value: string): boolean => {
    const named = /^[^<>]+<([^<>]+)>$/.exec(value.trim());
    return EmailSchema.safeParse(named === null ? value.trim() : named[1]).success;
};

export const SenderSchema = z.string().refine(isSender, {
    error: 'must be an address, or a name and an address like `Kizuna <hello@example.com>`',
});

/**
 * The options `createResend` takes, and the plugin's own apart from its webhook.
 */
export const ResendClientOptionsSchema = z
    .object({
        /**
         * The Resend API key. Required unless `dryRun` is set.
         */
        apiKey: z.string().optional(),
        /**
         * The sender every email and broadcast uses unless it names its own.
         *
         * @example
         * from: 'Kizuna <hello@example.com>',
         */
        from: SenderSchema,
        /**
         * The lists `subscribe`, `unsubscribe` and `broadcast` name, keyed by
         * the name handlers use.
         *
         * @example
         * lists: {
         *     weekly: {
         *         segmentId: 'seg_123',
         *         topicId: 'top_456',
         *     },
         * },
         */
        lists: z.record(z.string(), ResendListSchema).optional(),
        /**
         * Catch every email outside production and forward it to `forwardTo`
         * instead of its real recipients.
         *
         * @example
         * intercept: {
         *     enabled: process.env.NODE_ENV !== 'production',
         *     forwardTo: process.env.EMAIL_FORWARD_TO,
         *     deliverTo: ['@example.com'],
         * },
         */
        intercept: z
            .object({
                /**
                 * Whether emails are intercepted.
                 */
                enabled: z.boolean(),
                /**
                 * Where every email is forwarded, one address or several.
                 * Required when `enabled` is true.
                 */
                forwardTo: z.union([EmailSchema, z.array(EmailSchema).min(1)]).optional(),
                /**
                 * Addresses, or whole domains like `@example.com`, whose emails are
                 * delivered as normal, with `forwardTo` in bcc.
                 */
                deliverTo: z.array(z.string()).optional(),
                /**
                 * Put in front of every intercepted email's subject.
                 *
                 * @example
                 * subjectPrefix: '[dev]',
                 */
                subjectPrefix: z.string().optional(),
            })
            .refine((intercept) => !intercept.enabled || intercept.forwardTo !== undefined, {
                error: 'is required when intercept is enabled',
                path: ['forwardTo'],
            })
            .optional(),
        /**
         * Passed to the Resend client as it is.
         */
        resend: z.custom<ResendOptions>().optional(),
        /**
         * Skip Resend and log each email instead, for local development and tests.
         * Pass a function to receive each email yourself, as it would have been sent.
         *
         * @example
         * dryRun: process.env.NODE_ENV !== 'production',
         */
        dryRun: z
            .union([
                z.boolean(),
                z.custom<(email: ResendEmail) => void | Promise<void>>((value) => typeof value === 'function', {
                    error: 'must be a boolean or a function',
                }),
            ])
            .optional(),
    })
    .refine((options) => Boolean(options.dryRun) || (options.apiKey !== undefined && options.apiKey !== ''), {
        error: 'is required unless `dryRun` is set',
        path: ['apiKey'],
    });

export type ResendClientProps = z.output<typeof ResendClientOptionsSchema>;

export type ResendList = z.output<typeof ResendListSchema>;
