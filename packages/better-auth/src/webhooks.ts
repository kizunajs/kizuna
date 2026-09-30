import { z } from 'zod';
import type { RouteDefinition } from 'kizunajs';
import { route, type ApiContext } from 'kizunajs/plugin';
import type { AppUserOf, BetterAuthAppType, BetterAuthEventPayloads, BetterAuthUser, Jsonify } from './events.js';
import type { BetterAuthRouteAuth } from './options.js';

/**
 * What the app's plugin was built with, read from `Config`.
 */
type SetupOf<Config> = Config extends {
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
        ? NonNullable<Setup>
        : never
    : never;

/**
 * The Better Auth app's type, when the plugin names it with `betterAuthApp`.
 */
type AppOf<Config> =
    SetupOf<Config> extends {
        app?: BetterAuthAppType<infer App>;
    }
        ? App
        : undefined;

/**
 * The user as the Better Auth app knows it, or as the API's client does, or
 * Better Auth's own.
 */
type UserOf<Config> = [AppOf<Config>] extends [undefined]
    ? SetupOf<Config> extends {
          exports: {
              $Infer: {
                  Session: {
                      user: infer ClientUser;
                  };
              };
          };
      }
        ? Jsonify<ClientUser>
        : BetterAuthUser
    : AppUserOf<AppOf<Config>>;

/**
 * Every event the app can receive, typed.
 */
export type BetterAuthEventsOf<Config> = BetterAuthEventPayloads<AppOf<Config>, UserOf<Config>>;

/**
 * What an event's function receives.
 */
export type BetterAuthEventContext<Event extends string, Data, Config = unknown> = ApiContext<Config> & {
    event: Event;
    data: Data;
};

/**
 * A method, so a function typed from the app's `Config` still fits `on`.
 */
type EventHandler<Context> = {
    handle(context: Context): Promise<void> | void;
}['handle'];

/**
 * What runs for each event, keyed by where it sits in Better Auth's options.
 * `'*'` runs for an event the types don't know, like one from a plugin in a
 * Better Auth app whose type the API can't see.
 */
export type BetterAuthEventHandlers<Config = unknown> = {
    [Event in keyof BetterAuthEventsOf<Config> & string]?: EventHandler<
        BetterAuthEventContext<Event, BetterAuthEventsOf<Config>[Event], Config>
    >;
} & {
    '*'?: EventHandler<BetterAuthEventContext<string, Record<string, unknown>, Config>>;
};

/**
 * The event functions, with `jobs`, `plugins`, every event and the user typed
 * from `Config`.
 *
 * @example
 * export const betterAuthEvents = defineBetterAuthEvents<Config>({
 *     'emailAndPassword.sendResetPassword': async ({ data, plugins }) => {
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
        const handlers = on as Record<string, ((context: Record<string, unknown>) => Promise<void> | void) | undefined>;
        const handle = handlers[body.event] ?? handlers['*'];
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
