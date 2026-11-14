import { describe, expect, it, vi } from 'vitest';
import { defineConfig } from './define-config.js';
import { accessMatrix, createTestClient } from './testing.js';
import { config } from './testing.fixture.js';

const api = createTestClient(config);

describe('createTestClient', () => {
    it('calls a route through the pipeline without a server', async () => {
        const response = await api.users.health();
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('application/json');
    });

    it('answers the body as it arrives over JSON', async () => {
        const response = await api.users.health();
        expect(response.body).toEqual({
            ok: true,
            checkedAt: '2026-10-23T08:00:00.000Z',
        });
    });

    it('runs the guard with no credential until as() names the caller', async () => {
        const response = await api.users.getUser({
            params: {
                id: '1',
            },
        });
        expect(response).toMatchObject({
            status: 401,
            body: {
                detail: 'Sign in first',
            },
        });
    });

    it('runs the real guard on a credential the call sends', async () => {
        const response = await api.users.getUser({
            params: {
                id: '1',
            },
            headers: {
                authorization: 'Bearer tok_ada',
            },
        });
        expect(response.status).toBe(200);
    });

    it('skips the guard for the identity as() names', async () => {
        const response = await api
            .as('user', {
                userId: '1',
            })
            .users.getUser({
                params: {
                    id: '1',
                },
            });
        expect(response).toEqual({
            status: 200,
            headers: {
                'content-type': 'application/json',
            },
            body: {
                id: '1',
                name: 'Ada',
            },
        });
    });

    it('still checks the roles the route accepts', async () => {
        const asAdmin = await api
            .as('member', {
                workspaceUserId: '2',
                role: 'admin',
            })
            .users.deleteWorkspace();
        const asOwner = await api
            .as('member', {
                workspaceUserId: '1',
                role: 'owner',
            })
            .users.deleteWorkspace();
        expect(asAdmin.status).toBe(403);
        expect(asOwner.status).toBe(204);
    });

    it('answers invalid input with the 400 a served route sends', async () => {
        const response = await api
            .as('user', {
                userId: '1',
            })
            .users.createUser({
                body: {
                    name: '',
                },
            });
        expect(response.status).toBe(400);
    });

    it('fails a call that answers a status the route does not declare', async () => {
        await expect(api.users.wrongStatus()).rejects.toThrow('users.wrongStatus answered 202, which it does not declare.');
    });

    it('fails a call whose body the schema rejects', async () => {
        await expect(api.users.wrongBody()).rejects.toThrow('Response validation failed for users.wrongBody');
    });

    it('fails a call that answers a field the schema does not declare', async () => {
        await expect(api.users.leakUser()).rejects.toThrow(
            'users.leakUser answered 200 with fields its schema does not declare: passwordHash.'
        );
    });

    it('hands handlers the plugins and jobs the test passes', async () => {
        const send = vi.fn((to: string) => `faked for ${to}`);
        const queue = vi.fn(async () => undefined);
        const faked = createTestClient(config, {
            plugins: {
                email: {
                    send,
                },
            },
            jobs: {
                sendWelcome: {
                    queue,
                },
            },
        });
        const response = await faked
            .as('user', {
                userId: '1',
            })
            .users.createUser({
                body: {
                    name: 'Grace',
                },
            });
        expect(response.body).toMatchObject({
            sent: 'faked for Grace',
        });
        expect(queue).toHaveBeenCalledWith({
            input: {
                name: 'Grace',
            },
        });
    });
});

describe('accessMatrix', () => {
    it('reports who reaches each route', async () => {
        const matrix = await accessMatrix(config, {
            ada: {
                user: {
                    userId: '1',
                },
            },
            admin: {
                member: {
                    workspaceUserId: '2',
                    role: 'admin',
                },
            },
            owner: {
                member: {
                    workspaceUserId: '1',
                    role: 'owner',
                },
            },
        });
        expect(matrix['users.getUser']).toEqual({
            anonymous: 401,
            ada: 'allowed',
            admin: 401,
            owner: 401,
        });
        expect(matrix['users.deleteWorkspace']).toEqual({
            anonymous: 401,
            ada: 401,
            admin: 403,
            owner: 'allowed',
        });
        expect(matrix['users.health']).toEqual({
            anonymous: 'allowed',
            ada: 'allowed',
            admin: 'allowed',
            owner: 'allowed',
        });
    });

    it('throws when the api has no routes, so it never passes by checking nothing', async () => {
        await expect(
            accessMatrix(
                defineConfig({
                    routes: [],
                }),
                {}
            )
        ).rejects.toThrow('accessMatrix found no routes');
    });
});
