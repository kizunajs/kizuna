import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { betterAuth } from 'better-auth';
import { emailOTP, magicLink, phoneNumber, twoFactor } from 'better-auth/plugins';
import { organization } from 'better-auth/plugins/organization';
import { createAuthClient } from 'better-auth/client';
import { organizationClient } from 'better-auth/client/plugins';
import { Kizuna } from 'kizunajs';
import { betterAuthApp, defineBetterAuthPlugin } from './plugin.js';
import { defineBetterAuthEvents } from './webhooks.js';
import { kizuna } from './client.js';

const kizunaApi = kizuna({
    url: 'https://api.example.com/better-auth/webhooks',
});

/**
 * The Better Auth app, as its own repository would hold it.
 */
const auth = betterAuth({
    emailAndPassword: {
        enabled: true,
    },
    user: {
        additionalFields: {
            plan: {
                type: 'string',
            },
        },
    },
    plugins: [
        magicLink({
            sendMagicLink: kizunaApi.forward(),
        }),
        organization({
            teams: {
                enabled: true,
            },
            sendInvitationEmail: kizunaApi.forward(),
        }),
        emailOTP({
            sendVerificationOTP: kizunaApi.forward(),
        }),
        phoneNumber({
            sendOTP: kizunaApi.forward(),
            sendPasswordResetOTP: kizunaApi.forward(),
        }),
        twoFactor({
            otpOptions: {
                sendOTP: kizunaApi.forward(),
            },
        }),
        kizunaApi,
    ],
});

test('forward() fits a callback that reports, and nothing that has to return a value', () => {
    magicLink({
        sendMagicLink: kizunaApi.forward(),
        // @ts-expect-error generateToken returns the token, which forward() cannot
        generateToken: kizunaApi.forward(),
    });
});

const authClient = createAuthClient({
    baseURL: 'https://auth.example.com',
    plugins: [organizationClient()],
});

const betterAuthPlugin = defineBetterAuthPlugin({
    client: authClient,
    app: betterAuthApp<typeof auth>(),
});

const k = new Kizuna();

const jobs = k.jobs({
    recordReset: k.job({
        input: z.object({
            userId: z.string(),
        }),
    }),
});

interface Config {
    jobs: typeof jobs;
    plugins: [ReturnType<typeof betterAuthPlugin>];
}

test("types every event from the Better Auth app's own type, named by where it sits", () => {
    defineBetterAuthEvents<Config>({
        'magic-link.sendMagicLink': ({ event, data }) => {
            expectTypeOf(event).toEqualTypeOf<'magic-link.sendMagicLink'>();
            expectTypeOf(data.email).toEqualTypeOf<string>();
            expectTypeOf(data.url).toEqualTypeOf<string>();
        },
        'organization.sendInvitationEmail': ({ data }) => {
            expectTypeOf(data.invitation.expiresAt).toEqualTypeOf<string>();
            expectTypeOf(data.inviter.user.email).toEqualTypeOf<string>();
        },
        'email-otp.sendVerificationOTP': ({ data }) => {
            expectTypeOf(data.type).toEqualTypeOf<'sign-in' | 'email-verification' | 'forget-password' | 'change-email'>();
        },
        'phone-number.sendOTP': ({ data }) => {
            expectTypeOf(data.phoneNumber).toEqualTypeOf<string>();
        },
        'two-factor.otpOptions.sendOTP': ({ data }) => {
            expectTypeOf(data.otp).toEqualTypeOf<string>();
        },
        'emailAndPassword.sendResetPassword': ({ data, jobs: appJobs }) => {
            expectTypeOf(data.url).toEqualTypeOf<string>();
            expectTypeOf(data.user.plan).toEqualTypeOf<string>();
            expectTypeOf(appJobs.recordReset.queue).toBeFunction();
        },
        'databaseHooks.user.create.after': ({ data }) => {
            expectTypeOf(data.plan).toEqualTypeOf<string>();
            expectTypeOf(data.createdAt).toEqualTypeOf<string>();
        },
        'databaseHooks.session.create.after': ({ data }) => {
            expectTypeOf(data.userId).toEqualTypeOf<string>();
            expectTypeOf(data).not.toHaveProperty('token');
        },
    });
});

const plainPlugin = defineBetterAuthPlugin({
    client: createAuthClient({
        baseURL: 'https://auth.example.com',
    }),
});

interface PlainConfig {
    plugins: [ReturnType<typeof plainPlugin>];
}

test("types the core events without the app's type, and hands any other event to '*'", () => {
    defineBetterAuthEvents<PlainConfig>({
        'emailAndPassword.sendResetPassword': ({ data }) => {
            expectTypeOf(data.url).toEqualTypeOf<string>();
        },
        '*': ({ event, data }) => {
            expectTypeOf(event).toEqualTypeOf<string>();
            expectTypeOf(data).toEqualTypeOf<Record<string, unknown>>();
        },
    });

    defineBetterAuthEvents<PlainConfig>({
        // @ts-expect-error the types don't know this event without the app's type
        'magic-link.sendMagicLink': () => undefined,
    });
});

test("hands handlers the API's Better Auth client, every endpoint typed", () => {
    defineBetterAuthEvents<Config>({
        'emailAndPassword.sendResetPassword': async ({ plugins }) => {
            expectTypeOf(plugins.betterAuth.changeEmail).toBeFunction();
            expectTypeOf(plugins.betterAuth.organization.inviteMember).toBeFunction();
            // @ts-expect-error not a Better Auth endpoint
            void plugins.betterAuth.notAnEndpoint;
        },
    });
});

test('fits the plugin options', () => {
    betterAuthPlugin({
        auth: 'betterAuthApp',
        on: defineBetterAuthEvents<Config>({
            'emailVerification.sendVerificationEmail': ({ data }) => {
                expectTypeOf(data.url).toEqualTypeOf<string>();
            },
        }),
    });
});

test('types the core events without a Config, and gives no jobs', () => {
    defineBetterAuthEvents({
        'emailAndPassword.sendResetPassword': (context) => {
            expectTypeOf(context.data.token).toEqualTypeOf<string>();
            // @ts-expect-error jobs needs a Config
            void context.jobs;
        },
    });
});
