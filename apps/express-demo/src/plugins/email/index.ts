import { z } from 'zod';
import { definePlugin } from 'kizunajs/plugin';
import type { Email } from './types';

/**
 * Sends email by logging it, so the demo runs without a provider. A real app
 * would create its provider's client in `setup`.
 */
export const emailPlugin = definePlugin({
    slug: 'email',
    options: z.object({
        from: z.string(),
    }),
    setup: ({ options }) => {
        const outbox: Array<Email & { from: string }> = [];

        return {
            exports: {
                send: (email: Email) => {
                    outbox.push({
                        from: options.from,
                        ...email,
                    });
                    console.log(`[email] ${options.from} to ${email.to}: ${email.subject}`);
                },
                outbox: () => [...outbox],
            },
        };
    },
});
