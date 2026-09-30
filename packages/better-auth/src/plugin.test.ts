import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { defineConfig, Kizuna } from 'kizunajs';
import { definePlugin } from 'kizunajs/plugin';
import { expressAdapter } from '@kizunajs/express';
import { defineBetterAuthPlugin } from './plugin.js';
import { kizuna, type KizunaOptions } from './client.js';
import type { BetterAuthEventHandlers } from './webhooks.js';

interface Config {
    adapter: ReturnType<typeof expressAdapter>;
    auth: {
        identities: {
            betterAuthApp: typeof betterAuthApp;
        };
    };
    jobs: typeof jobs;
}

const k = new Kizuna<Config>();

const betterAuthApp = k.identity.bearer({}).guard(({ bearer, deny }) => {
    if (bearer?.token === 'app-token') return;
    return deny({
        status: 401,
        body: {
            detail: 'Unauthorized',
        },
    });
});

const resets: string[] = [];

const jobs = k.jobs({
    recordReset: k
        .job({
            input: z.object({
                userId: z.string(),
            }),
        })
        .handler(({ input }) => {
            resets.push(input.userId);
        }),
});

interface SentEmail {
    to: string;
    subject: string;
}

let sent: SentEmail[] = [];

const mailerPlugin = definePlugin({
    slug: 'mailer',
    setup: () => ({
        exports: {
            send: (email: SentEmail) => {
                sent.push(email);
            },
        },
    }),
});

const betterAuthPlugin = defineBetterAuthPlugin({
    client: {},
});

const install = (on: BetterAuthEventHandlers) =>
    defineConfig({
        adapter: expressAdapter(),
        routes: {},
        auth: {
            identities: {
                betterAuthApp,
            },
        },
        jobs,
        jobRunner: {
            mode: 'in-process',
        },
        plugins: [
            mailerPlugin(),
            betterAuthPlugin({
                auth: 'betterAuthApp',
                on,
            }),
        ],
    }).api;

const appOf = (on: BetterAuthEventHandlers): express.Express => {
    const app = express();
    install(on).mount(app);
    return app;
};

const servers: Server[] = [];

/**
 * Serves the API on a free port and answers the webhook route's URL.
 */
const serve = async (on: BetterAuthEventHandlers): Promise<string> => {
    const server = appOf(on).listen(0);
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/better-auth/webhooks`;
};

afterEach(async () => {
    sent = [];
    resets.length = 0;
    vi.restoreAllMocks();
    await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

const ada = {
    id: 'user_1',
    email: 'ada@example.com',
    name: 'Ada',
    emailVerified: true,
    image: null,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
};

const appHeaders = {
    authorization: 'Bearer app-token',
};

describe('betterAuthPlugin options', () => {
    it('stops the app when the route would take any caller', () => {
        expect(() =>
            defineConfig({
                routes: {},
                plugins: [
                    betterAuthPlugin({
                        auth: false,
                        on: {},
                    }),
                ],
            })
        ).toThrow(/\[kizuna\] Plugin 'betterAuth' has invalid options: auth: must name the identity the Better Auth app calls with/);
    });

    it('stops the app without `on`', () => {
        expect(() =>
            defineConfig({
                routes: {},
                plugins: [
                    betterAuthPlugin({
                        auth: 'betterAuthApp',
                        on: undefined as never,
                    }),
                ],
            })
        ).toThrow(/Plugin 'betterAuth' has invalid options: on/);
    });
});

/**
 * A `forward()` named the way the kizuna plugin names it when Better Auth
 * starts, here held by a plugin `probe` at `notify`.
 */
const namedForward = (options: KizunaOptions) => {
    const kizunaApi = kizuna(options);
    const notify = kizunaApi.forward<(data: Record<string, unknown>, request?: Request) => Promise<void>>();
    void kizunaApi.init?.({
        options: {
            plugins: [
                {
                    id: 'probe',
                    options: {
                        notify,
                    },
                },
            ],
        },
        logger: console,
    } as never);
    return notify;
};

describe('forward()', () => {
    it('hands the function the event, its data, jobs and plugins', async () => {
        const url = await serve({
            '*': async ({ event, data, ...context }) => {
                const { jobs: appJobs, plugins } = context as unknown as {
                    jobs: {
                        recordReset: {
                            run: (input: { userId: string }) => Promise<unknown>;
                        };
                    };
                    plugins: {
                        mailer: {
                            send: (email: SentEmail) => void;
                        };
                    };
                };
                const { user } = data as {
                    user: {
                        id: string;
                        email: string;
                    };
                };
                plugins.mailer.send({
                    to: user.email,
                    subject: `${event} ${String(data.url)}`,
                });
                await appJobs.recordReset.run({
                    userId: user.id,
                });
            },
        });

        await namedForward({
            url,
            headers: appHeaders,
        })({
            user: ada,
            url: 'https://auth.example.com/reset/tok_1',
        });

        expect(sent).toEqual([
            {
                to: 'ada@example.com',
                subject: 'probe.notify https://auth.example.com/reset/tok_1',
            },
        ]);
        expect(resets).toEqual(['user_1']);
    });

    it('sends dates as ISO strings, and leaves out functions and undefined fields', async () => {
        let received: unknown;
        const url = await serve({
            '*': ({ data }) => {
                received = data;
            },
        });

        await namedForward({
            url,
            headers: appHeaders,
        })({
            user: {
                ...ada,
                plan: 'pro',
                greet: () => 'hello',
                missing: undefined,
            },
        });

        expect(received).toEqual({
            user: {
                id: 'user_1',
                email: 'ada@example.com',
                name: 'Ada',
                emailVerified: true,
                image: null,
                createdAt: '2026-09-01T10:00:00.000Z',
                updatedAt: '2026-09-01T10:00:00.000Z',
                plan: 'pro',
            },
        });
    });

    it('sends only what it is handed, never the request', async () => {
        const bodies: unknown[] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
            bodies.push(JSON.parse(String(init?.body)));
            return new Response(null, {
                status: 204,
            });
        });

        await namedForward({
            url: 'https://api.example.com/better-auth/webhooks',
        })(
            {
                token: 'tok_3',
            },
            new Request('https://auth.example.com/api/auth/delete-user')
        );

        expect(bodies).toEqual([
            {
                event: 'probe.notify',
                data: {
                    token: 'tok_3',
                },
            },
        ]);
    });

    it('asks for the headers before every event', async () => {
        const url = await serve({});
        const headers = vi.fn(async () => appHeaders);
        const notify = namedForward({
            url,
            headers,
        });

        await notify({});
        await notify({});

        expect(headers).toHaveBeenCalledTimes(2);
    });

    it('throws when the API refuses the event', async () => {
        const ran = vi.fn();
        const url = await serve({
            '*': ran,
        });

        await expect(
            namedForward({
                url,
                headers: {
                    authorization: 'Bearer wrong-token',
                },
            })({})
        ).rejects.toThrow('[kizuna/better-auth] Sending probe.notify failed: the API answered 401.');
        expect(ran).not.toHaveBeenCalled();
    });

    it('throws when the kizuna plugin never named it', async () => {
        const notify = kizuna({
            url: 'https://api.example.com/better-auth/webhooks',
        }).forward<(data: Record<string, unknown>) => Promise<void>>();

        await expect(notify({})).rejects.toThrow('[kizuna/better-auth] A forward() was never named.');
    });
});

const resetBody = {
    event: 'emailAndPassword.sendResetPassword',
    data: {
        user: {
            ...ada,
            createdAt: '2026-09-01T10:00:00.000Z',
            updatedAt: '2026-09-01T10:00:00.000Z',
        },
        url: 'https://auth.example.com/reset/tok_1',
        token: 'tok_1',
    },
};

const post = (app: express.Express, body: unknown, headers: Record<string, string> = appHeaders) => {
    let call = request(app).post('/better-auth/webhooks').set('content-type', 'application/json');
    for (const [name, value] of Object.entries(headers)) call = call.set(name, value);
    return call.send(JSON.stringify(body));
};

describe('the webhook route', () => {
    it('answers 401 without the identity, and runs nothing', async () => {
        const ran = vi.fn();
        const app = appOf({
            'emailAndPassword.sendResetPassword': ran,
        });

        const response = await post(app, resetBody, {});

        expect(response.status).toBe(401);
        expect(ran).not.toHaveBeenCalled();
    });

    it('answers 400 for a body that is not an event, and runs nothing', async () => {
        const ran = vi.fn();
        const app = appOf({
            'emailAndPassword.sendResetPassword': ran,
        });

        const response = await post(app, {
            event: 'emailAndPassword.sendResetPassword',
        });

        expect(response.status).toBe(400);
        expect(ran).not.toHaveBeenCalled();
    });

    it('acknowledges an event it does not know', async () => {
        const response = await post(appOf({}), {
            event: 'sendCarrierPigeon',
            data: resetBody.data,
        });

        expect(response.status).toBe(204);
    });

    it('acknowledges an event with no function', async () => {
        const response = await post(appOf({}), resetBody);

        expect(response.status).toBe(204);
    });
});

/**
 * A Better Auth instance on its in-memory adapter, as its own app would run.
 */
const createAuth = (options: Parameters<typeof betterAuth>[0]) =>
    betterAuth({
        baseURL: 'http://localhost:3000',
        secret: 'kizuna-better-auth-test-secret-0123456789',
        database: memoryAdapter({
            user: [],
            session: [],
            account: [],
            verification: [],
        }),
        telemetry: {
            enabled: false,
        },
        logger: {
            disabled: true,
        },
        ...options,
    });

describe('the kizuna Better Auth plugin', () => {
    it('forwards a password reset Better Auth starts', async () => {
        const received: string[] = [];
        const url = await serve({
            'emailAndPassword.sendResetPassword': ({ data }) => {
                received.push(`${data.user.email} ${data.token}`);
            },
        });
        const auth = createAuth({
            emailAndPassword: {
                enabled: true,
            },
            plugins: [
                kizuna({
                    url,
                    headers: appHeaders,
                }),
            ],
        });
        await auth.api.signUpEmail({
            body: {
                email: 'ada@example.com',
                password: 'correct-horse-battery',
                name: 'Ada',
            },
        });

        await auth.api.requestPasswordReset({
            body: {
                email: 'ada@example.com',
                redirectTo: 'http://localhost:3000/reset',
            },
        });

        expect(received).toEqual([expect.stringMatching(/^ada@example\.com \S+$/)]);
    });

    it('fills every core callback, and turns on changing email and deleting accounts', async () => {
        const auth = createAuth({
            emailAndPassword: {
                enabled: true,
            },
            plugins: [
                kizuna({
                    url: 'https://api.example.com/better-auth/webhooks',
                }),
            ],
        });

        const { options } = await auth.$context;

        expect(options.emailAndPassword?.sendResetPassword).toBeTypeOf('function');
        expect(options.emailVerification?.sendVerificationEmail).toBeTypeOf('function');
        expect(options.user?.changeEmail?.sendChangeEmailConfirmation).toBeTypeOf('function');
        expect(options.user?.deleteUser?.sendDeleteAccountVerification).toBeTypeOf('function');
        expect(options.user?.changeEmail?.enabled).toBe(true);
        expect(options.user?.deleteUser?.enabled).toBe(true);
    });

    it('keeps a feature the app turns off', async () => {
        const auth = createAuth({
            user: {
                deleteUser: {
                    enabled: false,
                },
            },
            plugins: [
                kizuna({
                    url: 'https://api.example.com/better-auth/webhooks',
                }),
            ],
        });

        const { options } = await auth.$context;

        expect(options.user?.deleteUser?.enabled).toBe(false);
    });

    it('logs a lifecycle event the API never got, and lets the sign-up through', async () => {
        const logged: unknown[] = [];
        const auth = createAuth({
            emailAndPassword: {
                enabled: true,
            },
            logger: {
                level: 'error',
                log: (_level, message) => {
                    logged.push(message);
                },
            },
            plugins: [
                kizuna({
                    url: 'http://127.0.0.1:9/better-auth/webhooks',
                }),
            ],
        });

        await expect(
            auth.api.signUpEmail({
                body: {
                    email: 'ada@example.com',
                    password: 'correct-horse-battery',
                    name: 'Ada',
                },
            })
        ).resolves.toMatchObject({
            user: {
                email: 'ada@example.com',
            },
        });
        expect(logged).toEqual(expect.arrayContaining([expect.stringContaining('databaseHooks.user.create.after did not reach the API')]));
    });

    it('leaves a callback the app sets itself alone', async () => {
        const forwarded = vi.fn();
        const own = vi.fn(async () => undefined);
        const url = await serve({
            'emailAndPassword.sendResetPassword': forwarded,
        });
        const auth = createAuth({
            emailAndPassword: {
                enabled: true,
                sendResetPassword: own,
            },
            plugins: [
                kizuna({
                    url,
                    headers: appHeaders,
                }),
            ],
        });
        await auth.api.signUpEmail({
            body: {
                email: 'ada@example.com',
                password: 'correct-horse-battery',
                name: 'Ada',
            },
        });

        await auth.api.requestPasswordReset({
            body: {
                email: 'ada@example.com',
                redirectTo: 'http://localhost:3000/reset',
            },
        });

        expect(own).toHaveBeenCalledTimes(1);
        expect(forwarded).not.toHaveBeenCalled();
    });
});
