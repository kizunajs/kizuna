import { defineResendEvents } from '@kizunajs/resend';
import { db } from '@kizunajs-demo/shared';
import type { Config } from '../kizuna.types';

/**
 * What the demo does with Resend's webhook events.
 */
export const resendEvents = defineResendEvents<Config>({
    'contact.updated': async ({ event, jobs }) => {
        if (!event.data.unsubscribed) return;

        const user = await db.users.findByEmail(event.data.email);
        if (user === null) return;

        await jobs.users.indexUser.queue({
            input: {
                userId: user.id,
            },
        });
    },
});
