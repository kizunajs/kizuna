import { defineBetterAuthEvents } from '@kizunajs/better-auth';
import type { Config } from '../kizuna.types';

/**
 * What the demo does with the Better Auth app's callbacks.
 */
export const betterAuthEvents = defineBetterAuthEvents<Config>({
    'emailAndPassword.sendResetPassword': async ({ data, plugins }) => {
        await plugins.resend.sendEmail({
            to: data.user.email,
            subject: 'Reset your password',
            html: `<p>Hi ${data.user.name},</p><a href="${data.url}">Reset your password</a>`,
        });
    },
});
