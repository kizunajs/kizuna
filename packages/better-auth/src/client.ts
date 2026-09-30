import type { BetterAuthOptions, BetterAuthPlugin } from 'better-auth';
import type { BetterAuthCallbacks, BetterAuthEvent } from './events.js';

export type {
    BetterAuthCallbacks,
    BetterAuthEvent,
    BetterAuthEventBody,
    BetterAuthEventPayloads,
    BetterAuthUser,
    BetterAuthSessionInfo,
} from './events.js';

/**
 * Where the forwarder posts, and what it sends along.
 */
export interface ForwarderOptions {
    /**
     * The plugin's webhook route, `{basePath}/webhooks`.
     *
     * @example
     * url: 'https://api.example.com/better-auth/webhooks',
     */
    url: string | URL;
    /**
     * Sent with every call, so the API knows the caller. A function runs
     * before each call, for a credential that changes.
     *
     * @example
     * headers: {
     *     authorization: `Bearer ${process.env.KIZUNA_API_TOKEN}`,
     * },
     */
    headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
}

/**
 * Makes the Better Auth callback that sends one event to the API.
 */
export type Forward = <Event extends BetterAuthEvent>(event: Event) => BetterAuthCallbacks[Event];

const reportUser = (user: Record<string, unknown>) => ({
    user,
});

/**
 * The hooks hand over the record itself, so their payload wraps it. A
 * session's token is its credential, and never leaves Better Auth.
 */
const payloadOf: Partial<Record<BetterAuthEvent, (argument: Record<string, unknown>) => unknown>> = {
    userCreated: reportUser,
    userUpdated: reportUser,
    userDeleted: reportUser,
    emailVerified: reportUser,
    sessionCreated: ({ token: _token, ...session }) => ({
        session,
    }),
};

/**
 * Carry Better Auth's callbacks to a Kizuna API, where the plugin from
 * `defineBetterAuthPlugin` runs them. `forward` returns a callback with Better
 * Auth's own signature, which posts its payload as JSON and throws when the API
 * doesn't answer 2xx.
 *
 * @example
 * const forward = createForwarder({
 *     url: 'https://api.example.com/better-auth/webhooks',
 *     headers: {
 *         authorization: `Bearer ${process.env.KIZUNA_API_TOKEN}`,
 *     },
 * });
 *
 * export const auth = betterAuth({
 *     plugins: [
 *         magicLink({
 *             sendMagicLink: forward('sendMagicLink'),
 *         }),
 *     ],
 * });
 */
export const createForwarder = (options: ForwarderOptions): Forward => {
    const send = async (event: BetterAuthEvent, argument: Record<string, unknown>): Promise<void> => {
        const headers = new Headers(typeof options.headers === 'function' ? await options.headers() : options.headers);
        headers.set('content-type', 'application/json');
        const response = await fetch(options.url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                event,
                data: payloadOf[event]?.(argument) ?? argument,
            }),
        });
        if (!response.ok) {
            throw new Error(`[kizuna/better-auth] Forwarding ${event} failed: the API answered ${response.status}.`);
        }
    };

    return ((event: BetterAuthEvent) => (argument: Record<string, unknown>) => send(event, argument)) as Forward;
};

/**
 * A Better Auth plugin that sends a Kizuna API everything Better Auth's core
 * does:
 *
 * - The email callbacks: `sendResetPassword`, `sendVerificationEmail`,
 *   `sendChangeEmailConfirmation` and `sendDeleteAccountVerification`.
 * - What happened: `userCreated`, `userUpdated`, `userDeleted`,
 *   `emailVerified`, `passwordReset` and `sessionCreated`.
 *
 * It turns on changing email and deleting accounts, which the API starts
 * through `plugins.betterAuth`. What the app sets itself wins, `enabled: false`
 * included. Other plugins' callbacks, like `sendMagicLink`, are those plugins'
 * own options, so pass them `forward(...)`.
 *
 * @example
 * export const auth = betterAuth({
 *     emailAndPassword: {
 *         enabled: true,
 *     },
 *     plugins: [
 *         kizuna({
 *             url: 'https://api.example.com/better-auth/webhooks',
 *             headers: {
 *                 authorization: `Bearer ${process.env.KIZUNA_API_TOKEN}`,
 *             },
 *         }),
 *     ],
 * });
 */
export const kizuna = (options: ForwarderOptions): BetterAuthPlugin => {
    const forward = createForwarder(options);

    return {
        id: 'kizuna',
        init: (context) => {
            // What happened is reported after Better Auth has done it, so a
            // failed delivery is logged rather than failing the user's request.
            const report = <Event extends BetterAuthEvent>(event: Event): BetterAuthCallbacks[Event] => {
                const send = forward(event) as unknown as (argument: Record<string, unknown>) => Promise<void>;
                return (async (argument: Record<string, unknown>) => {
                    try {
                        await send(argument);
                    } catch (error) {
                        context.logger.error(`[kizuna/better-auth] ${event} did not reach the API.`, error);
                    }
                }) as unknown as BetterAuthCallbacks[Event];
            };

            return {
                // Better Auth merges these under the app's own options, so
                // what the app sets wins. Its database hooks run beside the
                // app's own.
                options: {
                    emailAndPassword: {
                        sendResetPassword: forward('sendResetPassword'),
                        onPasswordReset: report('passwordReset'),
                    },
                    emailVerification: {
                        sendVerificationEmail: forward('sendVerificationEmail'),
                        afterEmailVerification: report('emailVerified'),
                    },
                    user: {
                        changeEmail: {
                            enabled: true,
                            sendChangeEmailConfirmation: forward('sendChangeEmailConfirmation'),
                        },
                        deleteUser: {
                            enabled: true,
                            sendDeleteAccountVerification: forward('sendDeleteAccountVerification'),
                        },
                    },
                    databaseHooks: {
                        user: {
                            create: {
                                after: report('userCreated'),
                            },
                            update: {
                                after: report('userUpdated'),
                            },
                            delete: {
                                after: report('userDeleted'),
                            },
                        },
                        session: {
                            create: {
                                after: report('sessionCreated'),
                            },
                        },
                    },
                } as Partial<BetterAuthOptions>,
            };
        },
    };
};
