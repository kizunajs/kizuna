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
        const resend = new Resend(options.apiKey, options.resend);
        const routes: PluginRoutes = {};
        if (options.webhookSecret !== undefined) {
            routes.webhook = webhookRoute(resend, options.webhookSecret, options.on ?? {});
        }

        return {
            exports: resendExports(resend, options),
            routes,
        };
    },
});
