import type { z } from 'zod';
import { ResendClientOptionsSchema } from './options.js';
import { resendClientOf, resendExports } from './requests.js';

export { ResendClientOptionsSchema, ResendListSchema, type ResendClientProps, type ResendList } from './options.js';
export {
    ResendRequestError,
    type ResendEmail,
    type ResendBroadcast,
    type ResendSubscriber,
    type ResendUnsubscriber,
    type ResendEmailChange,
} from './requests.js';

/**
 * One issue as the app should read it: the field, and what's wrong with it.
 */
const describeIssue = (issue: z.core.$ZodIssue): string => {
    const field = issue.path.map(String).join('.');
    if (issue.code === 'invalid_type' && issue.message.endsWith('received undefined')) {
        return `${field} is required`;
    }
    return field === '' ? issue.message : `${field}: ${issue.message}`;
};

/**
 * Send email and run newsletters through Resend outside a Kizuna app. Returns
 * what a Kizuna app's handlers reach at `plugins.resend`, and takes the same
 * options as `resendPlugin` apart from the webhook's.
 *
 * @example
 * ```ts
 * import { createResend } from '@kizunajs/resend/client';
 *
 * export const resend = createResend({
 *     apiKey: process.env.RESEND_API_KEY,
 *     from: 'Kizuna <hello@example.com>',
 * });
 * ```
 */
export const createResend = (options: z.input<typeof ResendClientOptionsSchema>) => {
    const parsed = ResendClientOptionsSchema.safeParse(options);
    if (!parsed.success) {
        throw new Error(`[kizuna/resend] invalid options: ${parsed.error.issues.map(describeIssue).join('; ')}`);
    }
    return resendExports(resendClientOf(parsed.data), parsed.data);
};
