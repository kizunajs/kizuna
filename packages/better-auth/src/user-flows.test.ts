import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createAuthClient } from 'better-auth/client';
import { emailOTPClient, magicLinkClient, organizationClient } from 'better-auth/client/plugins';
import { toNodeHandler } from 'better-auth/node';
import { bearer, emailOTP, magicLink } from 'better-auth/plugins';
import { organization } from 'better-auth/plugins/organization';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { defineBetterAuthPlugin } from './plugin.js';
import { createForwarder, kizuna } from './client.js';
import type { BetterAuthEvent } from './events.js';
import type { BetterAuthEventHandlers } from './webhooks.js';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * A server on a free port whose handler is set once both apps exist, since
 * each needs the other's address.
 */
const listen = async (): Promise<{ server: Server; origin: string; handle: (handler: Handler) => void }> => {
    let current: Handler = (_req, res) => res.end();
    const server = createServer((req, res) => current(req, res)).listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    return {
        server,
        origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        handle: (handler) => {
            current = handler;
        },
    };
};

const authServer = await listen();
const apiServer = await listen();

/**
 * The API's own Better Auth client, as `src/better-auth.ts` would hold it.
 */
const authClient = createAuthClient({
    baseURL: authServer.origin,
    plugins: [organizationClient(), magicLinkClient(), emailOTPClient()],
});

const betterAuthPlugin = defineBetterAuthPlugin({
    client: authClient,
});

interface Config {
    adapter: ReturnType<typeof expressAdapter>;
    auth: {
        identities: {
            betterAuthApp: typeof betterAuthApp;
            member: typeof member;
        };
    };
    plugins: [ReturnType<typeof betterAuthPlugin>];
}

const k = new Kizuna<Config>();

const betterAuthApp = k.identity.bearer({}).guard(({ bearer: credential, deny }) => {
    if (credential?.token === 'app-token') return;
    return deny({
        status: 401,
        body: {
            detail: 'Unauthorized',
        },
    });
});

const member = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
            token: z.string(),
        }),
    })
    .guard(async ({ bearer: credential, deny }) => {
        const { data } = credential
            ? await authClient.getSession({
                  fetchOptions: {
                      headers: {
                          authorization: `Bearer ${credential.token}`,
                      },
                  },
              })
            : {
                  data: null,
              };
        if (data === null || credential === null) {
            return deny({
                status: 401,
                body: {
                    detail: 'Sign in first',
                },
            });
        }

        return {
            userId: data.user.id,
            token: credential.token,
        };
    });

/**
 * The user's own credential, passed on to Better Auth.
 */
const asUser = (token: string) => ({
    fetchOptions: {
        headers: {
            authorization: `Bearer ${token}`,
        },
    },
});

const routes = k.routes('account', {
    sendMagicLink: k
        .route({
            method: 'POST',
            path: '/sign-in/magic-link',
            auth: false,
            body: z.object({
                email: z.email(),
            }),
            responses: {
                204: z.void(),
            },
        })
        .handler(async ({ body, plugins }) => {
            await plugins.betterAuth.signIn.magicLink({
                email: body.email,
            });

            return {
                status: 204,
                body: undefined,
            };
        }),
    sendSignInCode: k
        .route({
            method: 'POST',
            path: '/sign-in/code',
            auth: false,
            body: z.object({
                email: z.email(),
            }),
            responses: {
                204: z.void(),
            },
        })
        .handler(async ({ body, plugins }) => {
            await plugins.betterAuth.emailOtp.sendVerificationOtp({
                email: body.email,
                type: 'sign-in',
            });

            return {
                status: 204,
                body: undefined,
            };
        }),
    confirmDeletion: k
        .route({
            method: 'POST',
            path: '/account/deletion-confirmations',
            auth: 'member',
            body: z.object({
                token: z.string(),
            }),
            responses: {
                204: z.void(),
            },
        })
        .handler(async ({ auth, body, plugins }) => {
            await plugins.betterAuth.deleteUser({
                token: body.token,
                ...asUser(auth.member.token),
            });

            return {
                status: 204,
                body: undefined,
            };
        }),
    requestPasswordReset: k
        .route({
            method: 'POST',
            path: '/account/password-reset',
            auth: false,
            body: z.object({
                email: z.email(),
            }),
            responses: {
                204: z.void(),
            },
        })
        .handler(async ({ body, plugins }) => {
            await plugins.betterAuth.requestPasswordReset({
                email: body.email,
            });

            return {
                status: 204,
                body: undefined,
            };
        }),
    resetPassword: k
        .route({
            method: 'PUT',
            path: '/account/password',
            auth: false,
            body: z.object({
                token: z.string(),
                newPassword: z.string(),
            }),
            responses: {
                204: z.void(),
            },
        })
        .handler(async ({ body, plugins }) => {
            await plugins.betterAuth.resetPassword(body);

            return {
                status: 204,
                body: undefined,
            };
        }),
    changeEmail: k
        .route({
            method: 'PATCH',
            path: '/account/email',
            auth: 'member',
            body: z.object({
                email: z.email(),
            }),
            responses: {
                204: z.void(),
            },
        })
        .handler(async ({ auth, body, plugins }) => {
            const { error } = await plugins.betterAuth.changeEmail({
                newEmail: body.email,
                ...asUser(auth.member.token),
            });
            if (error) throw new Error(error.message);

            return {
                status: 204,
                body: undefined,
            };
        }),
    deleteAccount: k
        .route({
            method: 'DELETE',
            path: '/account',
            auth: 'member',
            responses: {
                204: z.void(),
            },
        })
        .handler(async ({ auth, plugins }) => {
            await plugins.betterAuth.deleteUser(asUser(auth.member.token));

            return {
                status: 204,
                body: undefined,
            };
        }),
    listSessions: k
        .route({
            method: 'GET',
            path: '/account/sessions',
            auth: 'member',
            responses: {
                200: z.array(
                    z.object({
                        id: z.string(),
                    })
                ),
            },
        })
        .handler(async ({ auth, plugins }) => {
            const { data } = await plugins.betterAuth.listSessions(asUser(auth.member.token));

            return {
                status: 200,
                body: (data ?? []).map((session) => ({
                    id: session.id,
                })),
            };
        }),
    invite: k
        .route({
            method: 'POST',
            path: '/organizations/:organizationId/invitations',
            auth: 'member',
            body: z.object({
                email: z.email(),
            }),
            responses: {
                204: z.void(),
            },
        })
        .handler(async ({ auth, params, body, plugins }) => {
            const { error } = await plugins.betterAuth.organization.inviteMember({
                organizationId: params.organizationId,
                email: body.email,
                role: 'member',
                ...asUser(auth.member.token),
            });
            if (error) throw new Error(error.message);

            return {
                status: 204,
                body: undefined,
            };
        }),
});

interface Received {
    event: BetterAuthEvent;
    data: Record<string, unknown>;
}

let received: Received[] = [];

const record = (context: { event: BetterAuthEvent; data: unknown }) => {
    received.push({
        event: context.event,
        data: context.data as Record<string, unknown>,
    });
};

const events: BetterAuthEvent[] = [
    'sendResetPassword',
    'sendVerificationEmail',
    'sendChangeEmailConfirmation',
    'sendDeleteAccountVerification',
    'sendInvitationEmail',
    'sendMagicLink',
    'sendVerificationOTP',
    'sendPhoneNumberOTP',
    'sendPasswordResetOTP',
    'sendTwoFactorOTP',
    'userCreated',
    'userUpdated',
    'userDeleted',
    'emailVerified',
    'passwordReset',
    'sessionCreated',
];

const recordEverything = Object.fromEntries(events.map((event) => [event, record])) as BetterAuthEventHandlers;

/**
 * What arrived for one event, in order.
 */
const dataOf = (event: BetterAuthEvent) => received.filter((candidate) => candidate.event === event).map((candidate) => candidate.data);

const db: Record<string, Record<string, unknown>[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
    organization: [],
    member: [],
    invitation: [],
};

const forwarding = {
    url: `${apiServer.origin}/better-auth/webhooks`,
    headers: {
        authorization: 'Bearer app-token',
    },
};

const auth = betterAuth({
    baseURL: authServer.origin,
    secret: 'kizuna-better-auth-test-secret-0123456789',
    database: memoryAdapter(db),
    emailAndPassword: {
        enabled: true,
    },
    telemetry: {
        enabled: false,
    },
    logger: {
        disabled: true,
    },
    plugins: [
        bearer(),
        organization({
            sendInvitationEmail: createForwarder(forwarding)('sendInvitationEmail'),
        }),
        magicLink({
            sendMagicLink: createForwarder(forwarding)('sendMagicLink'),
        }),
        emailOTP({
            sendVerificationOTP: createForwarder(forwarding)('sendVerificationOTP'),
        }),
        kizuna(forwarding),
    ],
});

const api = express();

beforeAll(() => {
    authServer.handle(toNodeHandler(auth));
    defineConfig({
        adapter: expressAdapter(),
        routes,
        auth: {
            identities: {
                betterAuthApp,
                member,
            },
        },
        plugins: [
            betterAuthPlugin({
                auth: 'betterAuthApp',
                on: recordEverything,
            }),
        ],
    }).api.mount(api);
    apiServer.handle(api);
});

afterAll(async () => {
    await Promise.all([authServer.server, apiServer.server].map((server) => new Promise((resolve) => server.close(resolve))));
});

let email = '';

/**
 * A fresh user and the bearer token their app would send. Verified unless
 * the test says otherwise.
 */
const signUp = async (verified = true): Promise<{ token: string; userId: string }> => {
    email = `ada+${Math.random().toString(36).slice(2)}@example.com`;
    const { token, user } = await auth.api.signUpEmail({
        body: {
            email,
            password: 'correct-horse-battery',
            name: 'Ada',
        },
    });
    const stored = db.user!.find((candidate) => candidate.id === user.id)!;
    stored.emailVerified = verified;
    return {
        token: token!,
        userId: user.id,
    };
};

beforeEach(() => {
    received = [];
});

describe('an API that owns the user flows', () => {
    it('knows the signed-in user through Better Auth', async () => {
        const { token } = await signUp();

        const signedIn = await request(api).get('/account/sessions').set('authorization', `Bearer ${token}`);
        const stranger = await request(api).get('/account/sessions').set('authorization', 'Bearer not-a-session');

        expect(signedIn.status).toBe(200);
        expect(signedIn.body).toHaveLength(1);
        expect(stranger.status).toBe(401);
    });

    it('changes an email from its own route, and sends the confirmation itself', async () => {
        const { token } = await signUp();

        const response = await request(api).patch('/account/email').set('authorization', `Bearer ${token}`).send({
            email: 'ada@lovelace.dev',
        });

        expect(response.status).toBe(204);
        expect(dataOf('sendChangeEmailConfirmation')).toMatchObject([
            {
                user: {
                    email,
                },
                newEmail: 'ada@lovelace.dev',
            },
        ]);
    });

    it('resets a password from its own routes', async () => {
        await signUp();

        const requested = await request(api).post('/account/password-reset').send({
            email,
        });
        const reset = await request(api)
            .put('/account/password')
            .send({
                token: String(dataOf('sendResetPassword')[0]?.token),
                newPassword: 'battery-staple-horse',
            });

        expect(requested.status).toBe(204);
        expect(reset.status).toBe(204);
        await expect(
            auth.api.signInEmail({
                body: {
                    email,
                    password: 'battery-staple-horse',
                },
            })
        ).resolves.toMatchObject({
            user: {
                email,
            },
        });
        expect(dataOf('passwordReset')).toMatchObject([
            {
                user: {
                    email,
                },
            },
        ]);
    });

    it('deletes an account only after the emailed link', async () => {
        const { token, userId } = await signUp();

        const response = await request(api).delete('/account').set('authorization', `Bearer ${token}`);

        expect(response.status).toBe(204);
        expect(dataOf('sendDeleteAccountVerification')).toMatchObject([
            {
                url: expect.stringContaining('/delete-user/callback?token='),
            },
        ]);
        expect(db.user!.some((candidate) => candidate.id === userId)).toBe(true);
        expect(dataOf('userDeleted')).toEqual([]);

        const confirmed = await request(api)
            .post('/account/deletion-confirmations')
            .set('authorization', `Bearer ${token}`)
            .send({
                token: String(dataOf('sendDeleteAccountVerification')[0]?.token),
            });

        expect(confirmed.status).toBe(204);
        expect(db.user!.some((candidate) => candidate.id === userId)).toBe(false);
        expect(dataOf('userDeleted')).toMatchObject([
            {
                user: {
                    id: userId,
                },
            },
        ]);
    });

    it("invites to an organization through the organization plugin's endpoints", async () => {
        const { token } = await signUp();
        const created = await authClient.organization.create({
            name: 'Kizuna',
            slug: `kizuna-${Math.random().toString(36).slice(2)}`,
            ...asUser(token),
        });

        const response = await request(api)
            .post(`/organizations/${created.data!.id}/invitations`)
            .set('authorization', `Bearer ${token}`)
            .send({
                email: 'grace@example.com',
            });

        expect(response.status).toBe(204);
        expect(dataOf('sendInvitationEmail')).toMatchObject([
            {
                email: 'grace@example.com',
                organization: {
                    name: 'Kizuna',
                },
                inviter: {
                    user: {
                        email,
                    },
                },
            },
        ]);
    });

    it('hears about a sign-up and its session, without the session token', async () => {
        const { userId } = await signUp();

        expect(dataOf('userCreated')).toMatchObject([
            {
                user: {
                    id: userId,
                    email,
                },
            },
        ]);
        const [created] = dataOf('sessionCreated') as Array<{ session: Record<string, unknown> }>;
        expect(created?.session).toMatchObject({
            userId,
        });
        expect(created?.session).not.toHaveProperty('token');
    });

    it('hears when a user verifies their email', async () => {
        await signUp(false);
        await auth.api.sendVerificationEmail({
            body: {
                email,
            },
        });

        await auth.api.verifyEmail({
            query: {
                token: String(dataOf('sendVerificationEmail')[0]?.token),
            },
        });

        expect(dataOf('emailVerified')).toMatchObject([
            {
                user: {
                    email,
                },
            },
        ]);
        expect(dataOf('userUpdated')).toMatchObject([
            {
                user: {
                    email,
                    emailVerified: true,
                },
            },
        ]);
    });

    it('sends a magic link from its own route', async () => {
        await signUp();

        const response = await request(api).post('/sign-in/magic-link').send({
            email,
        });

        expect(response.status).toBe(204);
        expect(dataOf('sendMagicLink')).toMatchObject([
            {
                email,
                url: expect.stringContaining('/magic-link/verify?token='),
            },
        ]);
    });

    it('sends a sign-in code from its own route', async () => {
        await signUp();

        const response = await request(api).post('/sign-in/code').send({
            email,
        });

        expect(response.status).toBe(204);
        expect(dataOf('sendVerificationOTP')).toMatchObject([
            {
                email,
                otp: expect.stringMatching(/^\d{6}$/),
                type: 'sign-in',
            },
        ]);
    });
});
