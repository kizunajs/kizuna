import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import { defineConfig } from './define-config.js';
import { definePlugin, route } from './plugin.js';
import { defineClient, defineGenerator, walkApi } from './generator.js';

const k = new Kizuna();

const AddressSchema = Kizuna.model({
    title: 'Address',
    schema: z.object({
        city: z.string(),
    }),
});

const UserSchema = Kizuna.model({
    title: 'User',
    schema: z.object({
        id: z.string(),
        addresses: z.array(AddressSchema),
    }),
});

const DeliverySchema = Kizuna.model({
    title: 'Delivery',
    schema: z.object({
        id: z.string(),
    }),
});

const HealthSchema = Kizuna.model({
    title: 'Health',
    schema: z.object({
        ok: z.boolean(),
    }),
});

const webhooksPlugin = definePlugin({
    slug: 'webhooks',
    setup: () => ({
        routes: {
            receiveDelivery: route({
                method: 'POST',
                path: '/webhooks/delivery',
                auth: false,
                body: DeliverySchema,
                responses: {
                    204: z.void(),
                },
            }).handler(() => ({
                status: 204,
                body: undefined,
            })),
        },
    }),
});

const { api } = defineConfig({
    routes: [
        {
            users: k.routes({
                getUser: k.route({
                    method: 'GET',
                    path: '/users/:id',
                    responses: {
                        200: UserSchema,
                    },
                }),
            }),
            health: k.route({
                method: 'GET',
                path: '/health',
                hidden: true,
                responses: {
                    200: HealthSchema,
                },
            }),
        },
    ],
    plugins: [webhooksPlugin()],
});

describe('walkApi', () => {
    it('walks the models, then every served route with its plugin and hidden flag', () => {
        const visited: string[] = [];
        walkApi(api, {
            processModel: ({ name, plugin }) => visited.push(`model ${name}${plugin ? ` from ${plugin.slug}` : ''}`),
            processRoute: ({ routeKey, hidden, plugin }) =>
                visited.push(`route ${routeKey}${hidden ? ' hidden' : ''}${plugin ? ` from ${plugin.slug}` : ''}`),
            finalize: () => undefined,
        });

        expect(visited).toEqual([
            'model Address',
            'model Delivery from webhooks',
            'model Health',
            'model User',
            'route users.getUser',
            'route health hidden',
            'route webhooks.receiveDelivery hidden from webhooks',
        ]);
    });

    it('leaves out hidden routes, plugin routes included, and the models only they use', () => {
        const visited: string[] = [];
        walkApi(
            api,
            {
                processModel: ({ name }) => visited.push(name),
                processRoute: ({ routeKey }) => visited.push(routeKey),
                finalize: () => undefined,
            },
            {
                skipHidden: true,
            }
        );

        expect(visited).toEqual(['Address', 'User', 'users.getUser']);
    });
});

const routeListClient = defineClient({
    target: 'text',
    options: z.object({
        prefix: z.string().default('-'),
    }),
    generate: ({ options }) => {
        const lines: string[] = [];
        return {
            processRoute: ({ routeKey }) => lines.push(`${options.prefix} ${routeKey}`),
            finalize: () => lines.join('\n'),
        };
    },
});

describe('defineClient', () => {
    it('renders the file from the walk, skipping hidden routes', () => {
        const client = routeListClient({
            output: './routes.txt',
        });

        expect(client.target).toBe('text');
        expect(client.output).toBe('./routes.txt');
        expect(client.render(api)).toBe('- users.getUser');
    });

    it('passes the options the app gave, validated', () => {
        const client = routeListClient({
            output: './routes.txt',
            prefix: '*',
        });

        expect(client.render(api)).toBe('* users.getUser');
    });

    it('throws naming the client and the field when the options are invalid', () => {
        expect(() =>
            routeListClient({
                output: './routes.txt',
                prefix: 1 as never,
            })
        ).toThrow(/\[kizuna\] Client 'text' has invalid options: prefix/);
    });
});

describe('defineGenerator', () => {
    const manifest = defineGenerator({
        generate: () => {
            const lines: string[] = [];
            return {
                processRoute: ({ route, hidden }) => lines.push(`${route.method} ${route.path}${hidden ? ' hidden' : ''}`),
                finalize: () => lines.join('\n'),
            };
        },
    });

    it('sees every served route, hidden ones included', () => {
        expect(
            manifest({
                output: './routes.txt',
            }).render(api)
        ).toBe('GET /users/:id\nGET /health hidden\nPOST /webhooks/delivery hidden');
    });

    it('is installed through a plugin, and defineConfig returns it', () => {
        const manifestPlugin = definePlugin({
            slug: 'manifest',
            setup: () => ({
                generators: [
                    manifest({
                        output: './routes.txt',
                    }),
                ],
            }),
        });

        const { generators } = defineConfig({
            routes: [],
            plugins: [manifestPlugin()],
        });

        expect(generators.map((file) => file.output)).toEqual(['./routes.txt']);
    });
});
