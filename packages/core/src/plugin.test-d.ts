import { describe, expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { defineConfig } from './define-config.js';
import { definePlugin, route, type PluginExportsOf } from './plugin.js';
import type { ApiPluginsOf } from './api-definition.js';

const emailPlugin = definePlugin({
    slug: 'email',
    options: z.object({
        apiKey: z.string(),
        from: z.string().default('hello@example.com'),
    }),
    setup: ({ options }) => {
        expectTypeOf(options).toEqualTypeOf<{
            apiKey: string;
            from: string;
        }>();

        return {
            exports: {
                send: (email: { to: string }): string => `${options.from} to ${email.to}`,
            },
        };
    },
});

const statusPlugin = definePlugin({
    slug: 'status',
    setup: () => ({
        routes: {
            check: route({
                method: 'GET',
                path: '/status',
                auth: false,
                responses: {
                    200: z.object({
                        ok: z.boolean(),
                    }),
                },
            }).handler(() => ({
                status: 200,
                body: {
                    ok: true,
                },
            })),
        },
    }),
});

describe('definePlugin', () => {
    test('installs under the slug the plugin declares', () => {
        const contract = defineConfig({
            plugins: [
                emailPlugin({
                    apiKey: 'key',
                }),
                statusPlugin(),
            ],
        }).api;

        expectTypeOf<keyof ApiPluginsOf<typeof contract>>().toEqualTypeOf<'email' | 'status'>();
    });

    test('installs under the slug the app passes', () => {
        const contract = defineConfig({
            plugins: [
                emailPlugin({
                    slug: 'mail',
                    apiKey: 'key',
                }),
            ],
        }).api;

        expectTypeOf<keyof ApiPluginsOf<typeof contract>>().toEqualTypeOf<'mail'>();
    });

    test('types the exports from what setup returns', () => {
        const installed = emailPlugin({
            apiKey: 'key',
        });

        expectTypeOf<PluginExportsOf<typeof installed>>().toEqualTypeOf<{
            send: (email: { to: string }) => string;
        }>();
    });

    test('requires the options its schema requires', () => {
        // @ts-expect-error apiKey is required by the options schema
        emailPlugin({});
        // @ts-expect-error the options are required when the schema requires a field
        emailPlugin();
    });

    test('takes a basePath at install only when the plugin declares one', () => {
        const webhooksPlugin = definePlugin({
            slug: 'webhooks',
            basePath: '/webhooks',
            setup: () => ({}),
        });

        webhooksPlugin({
            basePath: '/integrations',
        });
        statusPlugin({
            // @ts-expect-error statusPlugin declares no basePath
            basePath: '/status',
        });
    });

    test('takes no options when it declares none', () => {
        statusPlugin();
        statusPlugin({
            slug: 'health',
        });
    });
});
