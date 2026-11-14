import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import { defineConfig } from './define-config.js';
import { definePlugin } from './plugin.js';
import { ProblemDetailsSchema } from './error-response.js';

/**
 * One api with every part the test client reaches: two identities, roles, a
 * plugin, a job, and routes that answer what they do not declare.
 */
interface Config {
    groups: typeof groups;
    auth: {
        identities: {
            user: typeof user;
            member: typeof member;
        };
    };
    jobs: typeof jobs;
    plugins: typeof plugins;
}

const k = new Kizuna<Config>();

const groups = k.groups({
    users: 'Users',
});

const user = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
    })
    .guard(({ bearer, deny }) => {
        if (bearer?.token !== 'tok_ada') {
            return deny({
                status: 401,
                body: {
                    detail: 'Sign in first',
                },
            });
        }
        return {
            userId: '1',
        };
    });

const permissions = Kizuna.permissions({
    workspace: ['read', 'delete'],
});

const member = k.identity
    .apiKey({
        name: 'x-workspace-token',
        in: 'header',
        context: z.object({
            workspaceUserId: z.string(),
        }),
        roles: Kizuna.roles(permissions, {
            admin: {
                workspace: ['read'],
            },
            owner: 'all',
        }),
    })
    .guard(({ deny }) =>
        deny({
            status: 401,
            body: {
                detail: 'Send a workspace token',
            },
        })
    );

const emailPlugin = definePlugin({
    slug: 'email',
    setup: () => ({
        exports: {
            send: (to: string): string => `sent to ${to}`,
            from: (): string => 'hello@example.com',
        },
    }),
});

const plugins = [emailPlugin()];

const jobs = k.jobs({
    sendWelcome: k
        .job({
            input: z.object({
                name: z.string(),
            }),
        })
        .handler(() => ({
            status: 204,
            body: undefined,
        })),
});

const UserSchema = z.object({
    id: z.string(),
    name: z.string(),
});

const routes = k.routes.users({
    health: k
        .route({
            method: 'GET',
            path: '/health',
            auth: false,
            responses: {
                200: z.object({
                    ok: z.boolean(),
                    checkedAt: z.date(),
                }),
            },
        })
        .handler(() => ({
            status: 200,
            body: {
                ok: true,
                checkedAt: new Date('2026-10-23T08:00:00.000Z'),
            },
        })),
    getUser: k
        .route({
            method: 'GET',
            path: '/users/:id',
            auth: 'user',
            responses: {
                200: UserSchema,
                404: ProblemDetailsSchema,
            },
        })
        .handler(({ params, auth }) => {
            if (params.id !== auth.user.userId) {
                return {
                    status: 404,
                    body: {
                        detail: 'No such user',
                    },
                };
            }
            return {
                status: 200,
                body: {
                    id: params.id,
                    name: 'Ada',
                },
            };
        }),
    createUser: k
        .route({
            method: 'POST',
            path: '/users',
            auth: 'user',
            body: z.object({
                name: z.string().min(1),
            }),
            responses: {
                201: z.object({
                    id: z.string(),
                    name: z.string(),
                    sent: z.string(),
                }),
            },
        })
        .handler(async ({ body, plugins, jobs }) => {
            await jobs.sendWelcome.queue({
                input: {
                    name: body.name,
                },
            });
            return {
                status: 201,
                body: {
                    id: '2',
                    name: body.name,
                    sent: plugins.email.send(body.name),
                },
            };
        }),
    deleteWorkspace: k
        .route({
            method: 'DELETE',
            path: '/workspace',
            auth: {
                identity: 'member',
                roles: 'owner',
            },
            responses: {
                204: z.void(),
            },
        })
        .handler(() => ({
            status: 204,
            body: undefined,
        })),
    leakUser: k
        .route({
            method: 'GET',
            path: '/leak',
            auth: false,
            responses: {
                200: UserSchema,
            },
        })
        .handler(() => {
            const stored = {
                id: '1',
                name: 'Ada',
                passwordHash: 'scrypt$1',
            };
            return {
                status: 200,
                body: stored,
            };
        }),
    wrongStatus: k
        .route({
            method: 'GET',
            path: '/wrong-status',
            auth: false,
            responses: {
                200: UserSchema,
            },
        })
        .handler(
            () =>
                ({
                    status: 202,
                    body: {
                        id: '1',
                        name: 'Ada',
                    },
                }) as never
        ),
    wrongBody: k
        .route({
            method: 'GET',
            path: '/wrong-body',
            auth: false,
            responses: {
                200: UserSchema,
            },
        })
        .handler(
            () =>
                ({
                    status: 200,
                    body: {
                        id: 1,
                    },
                }) as never
        ),
});

export const config = defineConfig({
    groups,
    auth: {
        identities: {
            user,
            member,
        },
    },
    jobs,
    jobRunner: {
        mode: 'in-process',
    },
    plugins,
    routes: [routes],
});
