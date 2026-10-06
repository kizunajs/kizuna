import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { defineConfig } from 'kizunajs';
import { pluginExportsOf } from 'kizunajs/adapter';
import { expressAdapter } from '@kizunajs/express';
import { resendPlugin } from './plugin.js';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import type { ResendEventHandlers } from './webhooks.js';
import type { ResendPluginProps } from './options.js';

interface RecordedCall {
    method: string;
    path: string;
    body: unknown;
}

let calls: RecordedCall[] = [];
let existingContacts: Set<string>;

beforeEach(() => {
    calls = [];
    existingContacts = new Set();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
        const path = decodeURIComponent(new URL(url).pathname);
        calls.push({
            method: init.method ?? 'GET',
            path,
            body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
        });
        const email = path.startsWith('/contacts/') ? path.split('/')[2]! : '';
        const missing = init.method === 'GET' && path === `/contacts/${email}` && !existingContacts.has(email);
        return new Response(
            JSON.stringify(
                missing
                    ? {
                          name: 'not_found',
                          message: 'Contact not found',
                          statusCode: 404,
                      }
                    : {
                          id: 'resend_1',
                      }
            ),
            {
                status: missing ? 404 : 200,
                headers: {
                    'content-type': 'application/json',
                },
            }
        );
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const webhookSecret = `whsec_${Buffer.from('kizuna-test-secret').toString('base64')}`;

const k = new Kizuna();

const undeliverable: string[] = [];

const jobs = k.jobs({
    markUndeliverable: k
        .job({
            input: z.object({
                email: z.string(),
            }),
        })
        .handler(({ input }) => {
            undeliverable.push(input.email);
        }),
});

const install = (on?: ResendEventHandlers, intercept?: ResendPluginProps['intercept']) =>
    defineConfig({
        adapter: expressAdapter(),
        routes: [],
        jobs,
        jobRunner: {
            mode: 'in-process',
        },
        plugins: [
            resendPlugin({
                apiKey: 're_test',
                from: 'Kizuna <hello@example.com>',
                lists: {
                    weekly: {
                        segmentId: 'seg_weekly',
                        topicId: 'top_weekly',
                    },
                },
                webhookSecret,
                on,
                intercept,
            }),
        ],
    }).api;

const resendOf = (api: unknown) => pluginExportsOf(api).resend as ReturnType<typeof import('./requests.js').resendExports>;

describe('resendPlugin options', () => {
    it('stops the app without an API key, naming the field', () => {
        expect(() =>
            defineConfig({
                routes: [],
                plugins: [
                    resendPlugin({
                        apiKey: undefined as never,
                        from: 'Kizuna <hello@example.com>',
                    }),
                ],
            })
        ).toThrow(/\[kizuna\] Plugin 'resend' has invalid options: apiKey is required/);
    });

    it('stops the app on a sender Resend would refuse', () => {
        expect(() =>
            defineConfig({
                routes: [],
                plugins: [
                    resendPlugin({
                        apiKey: 're_test',
                        from: 'Kizuna hello@example.com',
                    }),
                ],
            })
        ).toThrow(/from: must be an address, or a name and an address/);
    });

    it('takes a bare address or a name and an address as the sender', () => {
        for (const from of ['hello@example.com', 'Kizuna <hello@example.com>', 'Blåbær <post@blåbær.no>']) {
            expect(() =>
                defineConfig({
                    routes: [],
                    plugins: [
                        resendPlugin({
                            apiKey: 're_test',
                            from,
                        }),
                    ],
                })
            ).not.toThrow();
        }
    });

    it('needs a webhook secret when on is set', () => {
        expect(() =>
            defineConfig({
                routes: [],
                plugins: [
                    resendPlugin({
                        apiKey: 're_test',
                        from: 'Kizuna <hello@example.com>',
                        on: {},
                    }),
                ],
            })
        ).toThrow(/webhookSecret: is required when `on` is set/);
    });
});

describe('plugins.resend', () => {
    it('sends an email from the plugin sender', async () => {
        await resendOf(install()).sendEmail({
            to: 'ada@example.com',
            subject: 'Welcome',
            html: '<p>Welcome.</p>',
        });

        expect(calls).toEqual([
            {
                method: 'POST',
                path: '/emails',
                body: expect.objectContaining({
                    from: 'Kizuna <hello@example.com>',
                    to: 'ada@example.com',
                    subject: 'Welcome',
                }),
            },
        ]);
    });

    it('creates a new contact on the list', async () => {
        await resendOf(install()).subscribe({
            email: 'ada@example.com',
            list: 'weekly',
        });

        expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(['GET /contacts/ada@example.com', 'POST /contacts']);
        expect(calls[1]?.body).toMatchObject({
            email: 'ada@example.com',
            segments: [
                {
                    id: 'seg_weekly',
                },
            ],
            topics: [
                {
                    id: 'top_weekly',
                    subscription: 'opt_in',
                },
            ],
        });
    });

    it('resubscribes an existing contact to the list', async () => {
        existingContacts.add('ada@example.com');

        await resendOf(install()).subscribe({
            email: 'ada@example.com',
            list: 'weekly',
        });

        expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            'GET /contacts/ada@example.com',
            'PATCH /contacts/ada@example.com',
            'POST /contacts/ada@example.com/segments/seg_weekly',
            'PATCH /contacts/ada@example.com/topics',
        ]);
        expect(calls[1]?.body).toMatchObject({
            unsubscribed: false,
        });
    });

    it('returns the contact id, for a new contact and an existing one', async () => {
        const resend = resendOf(install());

        const created = await resend.subscribe({
            email: 'ada@example.com',
            list: 'weekly',
        });
        existingContacts.add('grace@example.com');
        const existing = await resend.subscribe({
            email: 'grace@example.com',
            list: 'weekly',
        });

        expect(created).toEqual({
            contactId: 'resend_1',
        });
        expect(existing).toEqual({
            contactId: 'resend_1',
        });
    });

    it('moves a contact to a new address, keeping its lists and topics', async () => {
        const answers: Record<string, unknown> = {
            'GET /contacts/ada@example.com': {
                object: 'contact',
                id: 'contact_old',
                email: 'ada@example.com',
                first_name: 'Ada',
                last_name: 'Lovelace',
                unsubscribed: false,
            },
            'GET /contacts/ada@example.com/segments': {
                object: 'list',
                has_more: false,
                data: [
                    {
                        id: 'seg_weekly',
                        name: 'Weekly',
                    },
                ],
            },
            'GET /contacts/ada@example.com/topics': {
                object: 'list',
                has_more: false,
                data: [
                    {
                        id: 'top_weekly',
                        name: 'Weekly',
                        subscription: 'opt_out',
                    },
                ],
            },
            'POST /contacts': {
                object: 'contact',
                id: 'contact_new',
            },
            'DELETE /contacts/ada@example.com': {
                object: 'contact',
                deleted: true,
            },
        };
        vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
            const route = `${init.method ?? 'GET'} ${decodeURIComponent(new URL(url).pathname)}`;
            calls.push({
                method: init.method ?? 'GET',
                path: route.slice(route.indexOf(' ') + 1),
                body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
            });
            return new Response(JSON.stringify(answers[route] ?? {}), {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                },
            });
        });

        const moved = await resendOf(install()).changeEmail({
            from: 'ada@example.com',
            to: 'ada@lovelace.dev',
        });

        expect(moved).toEqual({
            contactId: 'contact_new',
        });
        expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({
            email: 'ada@lovelace.dev',
            first_name: 'Ada',
            last_name: 'Lovelace',
            unsubscribed: false,
            segments: [
                {
                    id: 'seg_weekly',
                },
            ],
            topics: [
                {
                    id: 'top_weekly',
                    subscription: 'opt_out',
                },
            ],
        });
        expect(calls.at(-1)).toMatchObject({
            method: 'DELETE',
            path: '/contacts/ada@example.com',
        });
    });

    it('opts a contact out of one list, or out of everything', async () => {
        const resend = resendOf(install());

        await resend.unsubscribe({
            email: 'ada@example.com',
            list: 'weekly',
        });
        await resend.unsubscribe({
            email: 'ada@example.com',
        });

        expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            'PATCH /contacts/ada@example.com/topics',
            'PATCH /contacts/ada@example.com',
        ]);
        expect(calls[0]?.body).toEqual([
            {
                id: 'top_weekly',
                subscription: 'opt_out',
            },
        ]);
        expect(calls[1]?.body).toMatchObject({
            unsubscribed: true,
        });
    });

    it('sends a broadcast to the list', async () => {
        await resendOf(install()).sendBroadcast({
            list: 'weekly',
            subject: 'This week',
            html: '<p>News.</p>',
            scheduledAt: 'in 2 days',
        });

        expect(calls[0]).toMatchObject({
            method: 'POST',
            path: '/broadcasts',
            body: {
                from: 'Kizuna <hello@example.com>',
                segment_id: 'seg_weekly',
                topic_id: 'top_weekly',
                send: true,
                scheduled_at: 'in 2 days',
            },
        });
    });

    it('throws when Resend answers with an error', async () => {
        vi.stubGlobal(
            'fetch',
            async () =>
                new Response(
                    JSON.stringify({
                        name: 'validation_error',
                        message: 'Invalid `to` field.',
                        statusCode: 422,
                    }),
                    {
                        status: 422,
                        headers: {
                            'content-type': 'application/json',
                        },
                    }
                )
        );

        await expect(
            resendOf(install()).sendEmail({
                to: 'not-an-email',
                subject: 'Welcome',
                html: '<p>Welcome.</p>',
            })
        ).rejects.toThrow('[kizuna/resend] Sending the email failed: Invalid `to` field.');
    });

    it('forwards an intercepted email, keeping who it was for', async () => {
        await resendOf(
            install(undefined, {
                enabled: true,
                forwardTo: 'dev@example.com',
                subjectPrefix: '[dev]',
            })
        ).sendEmail({
            to: 'ada@example.com',
            cc: 'grace@example.com',
            subject: 'Welcome',
            html: '<p>Welcome.</p>',
        });

        expect(calls[0]?.body).toMatchObject({
            to: ['dev@example.com'],
            cc: [],
            bcc: [],
            subject: '[dev] Welcome',
            headers: {
                'X-Intercepted-To': 'ada@example.com',
                'X-Intercepted-Cc': 'grace@example.com',
            },
        });
    });

    it('delivers to deliverTo addresses and domains as normal, with forwardTo in bcc', async () => {
        await resendOf(
            install(undefined, {
                enabled: true,
                forwardTo: ['dev@example.com', 'qa@example.com'],
                deliverTo: ['grace@example.com', '@kizuna.dev'],
            })
        ).sendEmail({
            to: ['Grace@example.com', 'ada@example.com', 'linus@kizuna.dev'],
            subject: 'Welcome',
            html: '<p>Welcome.</p>',
        });

        expect(calls[0]?.body).toMatchObject({
            to: ['Grace@example.com', 'linus@kizuna.dev'],
            bcc: ['dev@example.com', 'qa@example.com'],
        });
    });

    it('stops the app when interception is enabled without an address', () => {
        expect(() =>
            install(undefined, {
                enabled: true,
                forwardTo: undefined,
            })
        ).toThrow(/intercept\.forwardTo: is required when intercept is enabled/);
    });

    it('sends as usual when interception is disabled', async () => {
        await resendOf(
            install(undefined, {
                enabled: false,
                forwardTo: 'dev@example.com',
                subjectPrefix: '[dev]',
            })
        ).sendEmail({
            to: 'ada@example.com',
            subject: 'Welcome',
            html: '<p>Welcome.</p>',
        });

        expect(calls[0]?.body).toMatchObject({
            to: 'ada@example.com',
            subject: 'Welcome',
        });
    });

    it('tries a rate-limited call again after retry-after', async () => {
        let attempts = 0;
        vi.stubGlobal('fetch', async () => {
            attempts += 1;
            const limited = attempts === 1;
            return new Response(
                JSON.stringify(
                    limited
                        ? {
                              name: 'rate_limit_exceeded',
                              message: 'Too many requests.',
                              statusCode: 429,
                          }
                        : {
                              id: 'email_1',
                          }
                ),
                {
                    status: limited ? 429 : 200,
                    headers: {
                        'content-type': 'application/json',
                        'retry-after': '0',
                    },
                }
            );
        });

        const sent = await resendOf(install()).sendEmail({
            to: 'ada@example.com',
            subject: 'Welcome',
            html: '<p>Welcome.</p>',
        });

        expect(sent).toEqual({
            id: 'email_1',
        });
        expect(attempts).toBe(2);
    });

    it('throws on a list the plugin was not given', async () => {
        await expect(
            resendOf(install()).subscribe({
                email: 'ada@example.com',
                list: 'monthly',
            })
        ).rejects.toThrow("[kizuna/resend] No list is named 'monthly'.");
    });
});

const signedDelivery = (payload: string, secret = webhookSecret) => {
    const id = 'msg_1';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
    const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64');
    return {
        'svix-id': id,
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${signature}`,
    };
};

const bouncedEvent = JSON.stringify({
    type: 'email.bounced',
    created_at: '2026-09-29T10:00:00.000Z',
    data: {
        email_id: 'email_1',
        created_at: '2026-09-29T10:00:00.000Z',
        from: 'Kizuna <hello@example.com>',
        to: ['ada@example.com'],
        subject: 'Welcome',
        bounce: {
            message: 'Mailbox does not exist',
            subType: 'General',
            type: 'Permanent',
        },
    },
});

const post = (app: express.Express, payload: string, headers: Record<string, string>) => {
    let call = request(app).post('/resend/webhooks').set('content-type', 'application/json');
    for (const [name, value] of Object.entries(headers)) call = call.set(name, value);
    return call.send(payload);
};

describe('the webhook route', () => {
    it('checks the signature and runs the function for the event type', async () => {
        const bounced: string[] = [];
        const app = express();
        install({
            'email.bounced': ({ event, deliveryId }) => {
                bounced.push(`${event.data.to[0]} ${deliveryId}`);
            },
        }).mount(app);

        const response = await post(app, bouncedEvent, signedDelivery(bouncedEvent));

        expect(response.status).toBe(204);
        expect(bounced).toEqual(['ada@example.com msg_1']);
    });

    it('hands the event function the app jobs and plugins', async () => {
        undeliverable.length = 0;
        let reachedPlugins: string[] = [];
        const app = express();
        install({
            'email.bounced': async (context) => {
                const {
                    event,
                    jobs: appJobs,
                    plugins,
                } = context as unknown as {
                    event: {
                        data: {
                            to: string[];
                        };
                    };
                    jobs: {
                        markUndeliverable: {
                            run: (input: { email: string }) => Promise<unknown>;
                        };
                    };
                    plugins: Record<string, unknown>;
                };
                reachedPlugins = Object.keys(plugins);
                await appJobs.markUndeliverable.run({
                    email: event.data.to[0]!,
                });
            },
        }).mount(app);

        const response = await post(app, bouncedEvent, signedDelivery(bouncedEvent));

        expect(response.status).toBe(204);
        expect(undeliverable).toEqual(['ada@example.com']);
        expect(reachedPlugins).toEqual(['resend']);
    });

    it('acknowledges an event with no function', async () => {
        const app = express();
        install({}).mount(app);

        const response = await post(app, bouncedEvent, signedDelivery(bouncedEvent));

        expect(response.status).toBe(204);
    });

    it('refuses a delivery whose signature does not match', async () => {
        const bounced: string[] = [];
        const app = express();
        install({
            'email.bounced': () => {
                bounced.push('ran');
            },
        }).mount(app);

        const response = await post(
            app,
            bouncedEvent,
            signedDelivery(bouncedEvent, `whsec_${Buffer.from('another-secret').toString('base64')}`)
        );

        expect(response.status).toBe(400);
        expect(bounced).toEqual([]);
    });

    it('serves no webhook route without a webhook secret', async () => {
        const app = express();
        defineConfig({
            adapter: expressAdapter(),
            routes: [],
            plugins: [
                resendPlugin({
                    apiKey: 're_test',
                    from: 'Kizuna <hello@example.com>',
                }),
            ],
        }).api.mount(app);

        const response = await post(app, bouncedEvent, signedDelivery(bouncedEvent));

        expect(response.status).toBe(404);
    });
});
