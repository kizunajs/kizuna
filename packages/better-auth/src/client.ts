import type { BetterAuthOptions, BetterAuthPlugin } from 'better-auth';
import type { CoreCallbacks } from './events.js';

export type {
    BetterAuthEventBody,
    BetterAuthEventPayloads,
    BetterAuthUser,
    CoreCallbacks,
    CoreEventPayloads,
    PluginEventPayloads,
} from './events.js';

/**
 * Where the events go, and what travels with them.
 */
export interface KizunaOptions {
    /**
     * The plugin's webhook route, `{basePath}/webhooks`.
     *
     * @example
     * url: 'https://api.example.com/better-auth/webhooks',
     */
    url: string | URL;
    /**
     * Sent with every event, so the API knows the caller. A function runs
     * before each event, for a credential that changes.
     *
     * @example
     * headers: {
     *     authorization: `Bearer ${process.env.KIZUNA_API_TOKEN}`,
     * },
     */
    headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
}

/**
 * The `kizuna` plugin, and `forward` for the callbacks other plugins take.
 */
export type KizunaPlugin = Omit<BetterAuthPlugin, 'id'> & {
    id: 'kizuna';
    /**
     * Stands in for any Better Auth callback, and sends what it's handed to
     * the API. Its type comes from the option it's placed in, and `kizuna`
     * names it by where it sits, like `magic-link.sendMagicLink`.
     */
    forward: <Callback extends (...args: never[]) => void | Promise<void>>() => Callback;
};

const NAME: unique symbol = Symbol.for('kizuna.better-auth.forward') as never;

interface Forwarded {
    (argument: Record<string, unknown>): Promise<void>;
    [NAME]: {
        event?: string;
    };
}

const isForwarded = (value: unknown): value is Forwarded => typeof value === 'function' && NAME in value;

const isWalkable = (value: unknown): value is Record<string, unknown> => {
    if (value === null || typeof value !== 'object') return false;
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

/**
 * Names every `forward()` under an options object by its path.
 */
const nameForwarded = (value: unknown, path: string, seen: Set<unknown>): void => {
    if (isForwarded(value)) {
        value[NAME].event ??= path;
        return;
    }
    if (!isWalkable(value) || seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
        nameForwarded(child, path === '' ? key : `${path}.${key}`, seen);
    }
};

/**
 * A session's token is its credential, and never leaves Better Auth.
 */
const withoutToken = ({ token: _token, ...session }: Record<string, unknown>) => session;

/**
 * Sends a Better Auth app's events to a Kizuna API, where the plugin from
 * `defineBetterAuthPlugin` runs them.
 *
 * It fills Better Auth's core callbacks and hooks itself: password resets,
 * email verification, changing email, deleting accounts, and when a user is
 * created, updated or deleted, verifies their email, resets their password or
 * signs in. It turns on changing email and deleting accounts, which the API
 * starts. What the app sets itself wins, `enabled: false` included.
 *
 * Other plugins take their callbacks when they're created, so place
 * `forward()` in each one.
 *
 * @example
 * const kizunaApi = kizuna({
 *     url: 'https://api.example.com/better-auth/webhooks',
 *     headers: {
 *         authorization: `Bearer ${process.env.KIZUNA_API_TOKEN}`,
 *     },
 * });
 *
 * export const auth = betterAuth({
 *     emailAndPassword: {
 *         enabled: true,
 *     },
 *     plugins: [
 *         magicLink({
 *             sendMagicLink: kizunaApi.forward(),
 *         }),
 *         kizunaApi,
 *     ],
 * });
 */
export const kizuna = (options: KizunaOptions): KizunaPlugin => {
    const send = async (event: string, argument: Record<string, unknown>): Promise<void> => {
        const headers = new Headers(typeof options.headers === 'function' ? await options.headers() : options.headers);
        headers.set('content-type', 'application/json');
        const response = await fetch(options.url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                event,
                data: event === 'databaseHooks.session.create.after' ? withoutToken(argument) : argument,
            }),
        });
        if (!response.ok) {
            throw new Error(`[kizuna/better-auth] Sending ${event} failed: the API answered ${response.status}.`);
        }
    };

    const forwarded = (event?: string): Forwarded => {
        const slot: Forwarded[typeof NAME] =
            event === undefined
                ? {}
                : {
                      event,
                  };
        const callback = (async (argument: Record<string, unknown>) => {
            if (slot.event === undefined) {
                throw new Error('[kizuna/better-auth] A forward() was never named. Add the kizuna plugin to the same Better Auth app.');
            }
            await send(slot.event, argument);
        }) as Forwarded;
        callback[NAME] = slot;
        return callback;
    };

    const core = <Event extends keyof CoreCallbacks>(event: Event): CoreCallbacks[Event] =>
        forwarded(event) as unknown as CoreCallbacks[Event];

    return {
        id: 'kizuna',
        forward: <Callback extends (...args: never[]) => void | Promise<void>>() => forwarded() as unknown as Callback,
        init: (context) => {
            nameForwarded(context.options, '', new Set());
            for (const plugin of context.options.plugins ?? []) {
                nameForwarded((plugin as { options?: unknown }).options, plugin.id, new Set());
            }

            // What happened is reported after Better Auth has done it, so a
            // failed delivery is logged rather than failing the user's request.
            const report = <Event extends keyof CoreCallbacks>(event: Event): CoreCallbacks[Event] => {
                const callback = forwarded(event);
                return (async (argument: Record<string, unknown>) => {
                    try {
                        await callback(argument);
                    } catch (error) {
                        context.logger.error(`[kizuna/better-auth] ${event} did not reach the API.`, error);
                    }
                }) as unknown as CoreCallbacks[Event];
            };

            return {
                // Better Auth merges these under the app's own options, so
                // what the app sets wins. Its database hooks run beside the
                // app's own.
                options: {
                    emailAndPassword: {
                        sendResetPassword: core('emailAndPassword.sendResetPassword'),
                        onPasswordReset: report('emailAndPassword.onPasswordReset'),
                    },
                    emailVerification: {
                        sendVerificationEmail: core('emailVerification.sendVerificationEmail'),
                        afterEmailVerification: report('emailVerification.afterEmailVerification'),
                    },
                    user: {
                        changeEmail: {
                            enabled: true,
                            sendChangeEmailConfirmation: core('user.changeEmail.sendChangeEmailConfirmation'),
                        },
                        deleteUser: {
                            enabled: true,
                            sendDeleteAccountVerification: core('user.deleteUser.sendDeleteAccountVerification'),
                        },
                    },
                    databaseHooks: {
                        user: {
                            create: {
                                after: report('databaseHooks.user.create.after'),
                            },
                            update: {
                                after: report('databaseHooks.user.update.after'),
                            },
                            delete: {
                                after: report('databaseHooks.user.delete.after'),
                            },
                        },
                        session: {
                            create: {
                                after: report('databaseHooks.session.create.after'),
                            },
                        },
                    },
                } as Partial<BetterAuthOptions>,
            };
        },
    };
};
