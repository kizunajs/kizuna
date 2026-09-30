import { definePlugin } from 'kizunajs/plugin';
import { BetterAuthPluginOptionsSchema } from './options.js';
import { webhookRoute } from './webhooks.js';
import type { BetterAuthAppType } from './events.js';

/**
 * Names the Better Auth app's type for the API, so every event it can send is
 * typed. Import the type only, so none of the app runs in the API.
 *
 * @example
 * import type { auth } from '../../auth/src/auth';
 *
 * app: betterAuthApp<typeof auth>(),
 */
export const betterAuthApp = <App>(): BetterAuthAppType<App> => ({});

/**
 * Builds the plugin around the API's Better Auth client, so handlers call any
 * Better Auth endpoint at `plugins.betterAuth`, typed from that client. The
 * events Better Auth sends come back to the functions under `on`, typed from
 * the Better Auth app's own type when `app` names it.
 *
 * Define it in a module of its own, so `kizuna generate` can type
 * `plugins.betterAuth` from it.
 *
 * @example
 * ```ts
 * // src/better-auth.ts
 * import type { auth } from '../../auth/src/auth';
 *
 * export const authClient = createAuthClient({
 *     baseURL: 'https://auth.example.com',
 * });
 *
 * export const betterAuthPlugin = defineBetterAuthPlugin({
 *     client: authClient,
 *     app: betterAuthApp<typeof auth>(),
 * });
 *
 * // kizuna.config.ts
 * export default defineConfig({
 *     routes,
 *     plugins: [
 *         betterAuthPlugin({
 *             auth: 'service',
 *             on: betterAuthEvents,
 *         }),
 *     ],
 * });
 * ```
 */
export const defineBetterAuthPlugin = <Client extends object, App = undefined>(definition: {
    client: Client;
    app?: BetterAuthAppType<App>;
}) =>
    definePlugin({
        slug: 'betterAuth',
        basePath: '/better-auth',
        options: BetterAuthPluginOptionsSchema,
        setup: ({ options }) => ({
            exports: definition.client,
            routes: {
                webhook: webhookRoute(options.auth, options.on),
            },
            app: definition.app,
        }),
    });
