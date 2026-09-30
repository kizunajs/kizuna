import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins/organization';
import { emailOTP, magicLink, phoneNumber, twoFactor } from 'better-auth/plugins';
import { Kizuna } from 'kizunajs';
import { createAuthClient } from 'better-auth/client';
import { inferAdditionalFields, organizationClient } from 'better-auth/client/plugins';
import { defineBetterAuthPlugin } from './plugin.js';
import { defineBetterAuthEvents } from './webhooks.js';
import { createForwarder, kizuna } from './client.js';
import type { BetterAuthEventPayloads } from './events.js';

const forward = createForwarder({
    url: 'https://api.example.com/better-auth/webhooks',
});

test("fits each callback into Better Auth's own options", () => {
    betterAuth({
        emailAndPassword: {
            enabled: true,
            sendResetPassword: forward('sendResetPassword'),
        },
        emailVerification: {
            sendVerificationEmail: forward('sendVerificationEmail'),
        },
        user: {
            additionalFields: {
                plan: {
                    type: 'string',
                },
            },
            changeEmail: {
                enabled: true,
                sendChangeEmailConfirmation: forward('sendChangeEmailConfirmation'),
            },
            deleteUser: {
                enabled: true,
                sendDeleteAccountVerification: forward('sendDeleteAccountVerification'),
            },
        },
        plugins: [
            organization({
                sendInvitationEmail: forward('sendInvitationEmail'),
            }),
            magicLink({
                sendMagicLink: forward('sendMagicLink'),
            }),
            emailOTP({
                sendVerificationOTP: forward('sendVerificationOTP'),
            }),
            phoneNumber({
                sendOTP: forward('sendPhoneNumberOTP'),
                sendPasswordResetOTP: forward('sendPasswordResetOTP'),
            }),
            twoFactor({
                otpOptions: {
                    sendOTP: forward('sendTwoFactorOTP'),
                },
            }),
            kizuna({
                url: 'https://api.example.com/better-auth/webhooks',
            }),
        ],
    });
});

test('refuses a callback in the wrong option, and an event it does not know', () => {
    betterAuth({
        emailAndPassword: {
            enabled: true,
            // @ts-expect-error an invitation callback is not a reset callback
            sendResetPassword: forward('sendInvitationEmail'),
        },
    });

    // @ts-expect-error not a forwarded callback
    forward('sendCarrierPigeon');
});

test("takes each payload from Better Auth's own types, as JSON", () => {
    expectTypeOf<BetterAuthEventPayloads['sendResetPassword']['url']>().toEqualTypeOf<string>();
    expectTypeOf<BetterAuthEventPayloads['sendVerificationOTP']['type']>().toEqualTypeOf<
        'sign-in' | 'email-verification' | 'forget-password' | 'change-email'
    >();
    expectTypeOf<BetterAuthEventPayloads['sendPhoneNumberOTP']>().toEqualTypeOf<{
        phoneNumber: string;
        code: string;
    }>();
    expectTypeOf<BetterAuthEventPayloads['sendInvitationEmail']['invitation']['expiresAt']>().toEqualTypeOf<string>();
    expectTypeOf<BetterAuthEventPayloads['userCreated']['user']['createdAt']>().toEqualTypeOf<string>();
    expectTypeOf<BetterAuthEventPayloads['sessionCreated']['session']>().not.toHaveProperty('token');
});

const authClient = createAuthClient({
    baseURL: 'https://auth.example.com',
    plugins: [organizationClient()],
});

const betterAuthPlugin = defineBetterAuthPlugin({
    client: authClient,
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

test('types an event function from the Config', () => {
    defineBetterAuthEvents<Config>({
        sendResetPassword: async ({ event, data, jobs: appJobs }) => {
            expectTypeOf(event).toEqualTypeOf<'sendResetPassword'>();
            expectTypeOf(data.user.email).toEqualTypeOf<string>();
            expectTypeOf(appJobs.recordReset.queue).toBeFunction();
        },
        sendInvitationEmail: ({ data }) => {
            expectTypeOf(data.invitation.expiresAt).toEqualTypeOf<string>();
        },
    });
});

const clientWithFields = createAuthClient({
    baseURL: 'https://auth.example.com',
    plugins: [
        inferAdditionalFields({
            user: {
                plan: {
                    type: 'string',
                },
            },
        }),
    ],
});

const pluginWithFields = defineBetterAuthPlugin({
    client: clientWithFields,
});

interface ConfigWithFields {
    plugins: [ReturnType<typeof pluginWithFields>];
}

test("types the user from the app's client, its own fields included", () => {
    defineBetterAuthEvents<ConfigWithFields>({
        userCreated: ({ data }) => {
            expectTypeOf(data.user.plan).toEqualTypeOf<string>();
            expectTypeOf(data.user.createdAt).toEqualTypeOf<string>();
        },
        sendResetPassword: ({ data }) => {
            expectTypeOf(data.user.plan).toEqualTypeOf<string>();
        },
    });
});

test("hands handlers the app's Better Auth client, every endpoint typed", () => {
    defineBetterAuthEvents<Config>({
        sendResetPassword: async ({ plugins }) => {
            expectTypeOf(plugins.betterAuth.changeEmail).toBeFunction();
            expectTypeOf(plugins.betterAuth.listSessions).toBeFunction();
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
            sendVerificationEmail: ({ data }) => {
                expectTypeOf(data.url).toEqualTypeOf<string>();
            },
        }),
    });
});

test('types the event without a Config, and gives no jobs', () => {
    defineBetterAuthEvents({
        sendResetPassword: (context) => {
            expectTypeOf(context.data.token).toEqualTypeOf<string>();
            // @ts-expect-error jobs needs a Config
            void context.jobs;
        },
    });
});
