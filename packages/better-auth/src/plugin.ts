import { definePlugin } from 'kizunajs/plugin';
import { BetterAuthPluginOptionsSchema } from './options.js';
import { webhookRoute } from './webhooks.js';

/**
 * Builds the plugin around the API's Better Auth client, so handlers call any
 * Better Auth endpoint at `plugins.betterAuth`, typed from that client. The
 * callbacks Better Auth fires, like `sendResetPassword`, come back to the
 * functions under `on`, sent by `kizuna` or `createForwarder` from
 * `@kizunajs/better-auth/client`.
 *
 * Define it in a module of its own, so `kizuna generate` can type
 * `plugins.betterAuth` from it.
 *
 * @example
 * ```ts
 * // src/better-auth.ts
 * export const authClient = createAuthClient({
 *     baseURL: 'https://auth.example.com',
 * });
 *
 * export const betterAuthPlugin = defineBetterAuthPlugin({
 *     client: authClient,
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
export const defineBetterAuthPlugin = <Client extends object>(definition: { client: Client }) =>
    definePlugin({
        slug: 'betterAuth',
        basePath: '/better-auth',
        options: BetterAuthPluginOptionsSchema,
        setup: ({ options }) => ({
            exports: definition.client,
            routes: {
                webhook: webhookRoute(options.auth, options.on),
            },
        }),
    });
