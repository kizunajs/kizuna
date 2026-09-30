import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import type { PluginExportsOf } from 'kizunajs/plugin';
import { createResend } from './client.js';
import { resendPlugin } from './plugin.js';
import { defineResendEvents } from './webhooks.js';
import type { ResendEmail } from './requests.js';

const k = new Kizuna();

const jobs = k.jobs({
    markUndeliverable: k.job({
        input: z.object({
            email: z.string(),
        }),
    }),
});

interface Config {
    jobs: typeof jobs;
    plugins: [ReturnType<typeof resendPlugin>];
}

test('types an event function from the Config it is given', () => {
    defineResendEvents<Config>({
        'email.bounced': async ({ event, jobs: appJobs, plugins }) => {
            expectTypeOf(event.type).toEqualTypeOf<'email.bounced'>();
            expectTypeOf(event.data.to).toEqualTypeOf<string[]>();
            expectTypeOf(appJobs.markUndeliverable.queue).toBeFunction();
            expectTypeOf(plugins.resend.subscribe).toBeFunction();
        },
    });
});

test('fits the plugin options', () => {
    resendPlugin({
        apiKey: 're_test',
        from: 'Kizuna <hello@example.com>',
        webhookSecret: 'whsec_test',
        on: defineResendEvents<Config>({
            'contact.updated': ({ event }) => {
                expectTypeOf(event.data.email).toEqualTypeOf<string>();
            },
        }),
    });
});

test('types the event without a Config, and gives no jobs', () => {
    defineResendEvents({
        'email.bounced': (context) => {
            expectTypeOf(context.event.data.to).toEqualTypeOf<string[]>();
            // @ts-expect-error jobs needs a Config
            void context.jobs;
        },
    });
});

test('createResend returns what handlers reach at plugins.resend', () => {
    expectTypeOf<ReturnType<typeof createResend>>().toEqualTypeOf<PluginExportsOf<ReturnType<typeof resendPlugin>>>();
});

test('takes no API key when dryRun is set', () => {
    resendPlugin({
        from: 'Kizuna <hello@example.com>',
        dryRun: (email) => {
            expectTypeOf(email).toEqualTypeOf<ResendEmail>();
        },
    });
    createResend({
        apiKey: process.env.RESEND_API_KEY,
        from: 'Kizuna <hello@example.com>',
        dryRun: true,
    });
});
