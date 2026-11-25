import { Resend } from 'resend';
import { definePlugin, type PluginRoutes } from 'kizunajs/plugin';
import { ResendPluginOptionsSchema } from './options.js';
import { resendExports } from './requests.js';
import { webhookRoute } from './webhooks.js';

/**
 * Send email, run newsletters and broadcasts, and receive webhooks through
 * Resend. Handlers reach it at `plugins.resend`.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *     routes,
 *     plugins: [
 *         resendPlugin({
 *             apiKey: process.env.RESEND_API_KEY,
 *             from: 'Kizuna <hello@example.com>',
 *         }),
 *     ],
 * });
 * ```
 */
export const resendPlugin = definePlugin({
    slug: 'resend',
    basePath: '/resend',
    options: ResendPluginOptionsSchema,
    setup: ({ options }) => {
        const { apiKey } = options;
        let client: Resend | undefined;
        // Made on first use, since `new Resend` throws without a key.
        const getClient = (): Resend => {
            if (apiKey === undefined) throw new Error('[kizuna/resend] apiKey is required');
            client ??= new Resend(apiKey, options.resend);
            return client;
        };
        const routes: PluginRoutes = {};
        if (options.webhookSecret !== undefined) {
            routes.webhook = webhookRoute(getClient, options.webhookSecret, options.on ?? {});
        }

        return {
            exports: resendExports(getClient, options),
            routes,
            start: () => {
                if (apiKey === undefined) throw new Error('apiKey is required');
            },
        };
    },
});
