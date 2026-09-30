import { z } from 'zod';
import type { RouteDefinition } from 'kizunajs';
import { route, type ApiContext } from 'kizunajs/plugin';
import type { BetterAuthEvent, BetterAuthEventPayloads, BetterAuthUser, Jsonify } from './events.js';
import type { BetterAuthRouteAuth } from './options.js';

/**
 * The Better Auth client the app built its plugin around, read from `Config`.
 */
type BetterAuthClientOf<Config> = Config extends {
    plugins: infer Plugins extends readonly unknown[];
}
    ? Extract<
          Plugins[number],
          {
              slug: 'betterAuth';
          }
      > extends {
          setupType?: infer Setup;
      }
        ? NonNullable<Setup> extends {
              exports: infer Client;
          }
            ? Client
            : never
        : never
    : never;

/**
 * The user as the app's client knows it, `additionalFields` included, or
 * Better Auth's own without a `Config`.
 */
type AppUserOf<Config> = [BetterAuthClientOf<Config>] extends [never]
    ? BetterAuthUser
    : BetterAuthClientOf<Config> extends {
            $Infer: {
                Session: {
                    user: infer AppUser;
                };
            };
        }
      ? Jsonify<AppUser>
      : BetterAuthUser;

/**
 * What an event's function receives.
 */
export type BetterAuthEventContext<Event extends BetterAuthEvent, Config = unknown> = ApiContext<Config> & {
    event: Event;
    data: BetterAuthEventPayloads<AppUserOf<Config>>[Event];
};

/**
 * A method, so a function typed from the app's `Config` still fits `on`.
 */
type EventHandler<Context> = {
    handle(context: Context): Promise<void> | void;
}['handle'];

/**
 * What runs for each event, keyed by its name.
 */
export type BetterAuthEventHandlers<Config = unknown> = {
    [Event in BetterAuthEvent]?: EventHandler<BetterAuthEventContext<Event, Config>>;
};

/**
 * The event functions, with `jobs`, `plugins` and the user typed from
 * `Config`. The user carries the fields the app's Better Auth client knows,
 * like those from `inferAdditionalFields`.
 *
 * @example
 * export const betterAuthEvents = defineBetterAuthEvents<Config>({
 *     sendResetPassword: async ({ data, plugins }) => {
 *         await plugins.resend.sendEmail({
 *             to: data.user.email,
 *             subject: 'Reset your password',
 *             html: `<a href="${data.url}">Reset your password</a>`,
 *         });
 *     },
 * });
 */
export const defineBetterAuthEvents = <Config = unknown>(handlers: BetterAuthEventHandlers<Config>): BetterAuthEventHandlers<Config> =>
    handlers;

/**
 * The payload is what Better Auth handed the callback, sent by the app's own
 * Better Auth app behind `auth`, so only its envelope is checked.
 */
const EventBodySchema = z.object({
    event: z.string(),
    data: z.record(z.string(), z.unknown()),
});

/**
 * Receives a forwarded callback and runs the function for its event.
 */
export const webhookRoute = (auth: BetterAuthRouteAuth, on: BetterAuthEventHandlers): RouteDefinition =>
    route({
        method: 'POST',
        path: '/webhooks',
        auth,
        summary: 'Receive Better Auth events',
        body: EventBodySchema,
        responses: {
            204: z.void(),
        },
    }).handler(async (args) => {
        const { body } = args;
        const handle = (on as Record<string, ((context: Record<string, unknown>) => Promise<void> | void) | undefined>)[body.event];
        const { jobs, plugins } = args as unknown as Record<string, unknown>;
        await handle?.({
            event: body.event,
            data: body.data,
            jobs,
            plugins,
        });

        return {
            status: 204,
            body: undefined,
        };
    });
