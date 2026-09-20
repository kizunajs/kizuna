import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna, defineConfig } from '@ts-kizuna/core';
import { formatRoutes, routeMap } from './route-map.js';

interface Config {
    tags: typeof tags;
    auth: { identities: { member: typeof member } };
}

const k = new Kizuna<Config>();
const tags = k.tags({ users: 'Users' });

const member = k.identity
    .apiKey({
        name: 'x-token',
        in: 'header',
        context: z.object({ userId: z.string() }),
    })
    .guard(({ apiKey, deny }) => (apiKey ? { userId: apiKey.value } : deny({ status: 401, body: { detail: 'no' } })));

const routes = k.routes('users', {
    listUsers: k
        .route({
            method: 'GET',
            path: '/users',
            auth: false,
            responses: { 200: z.array(z.string()) },
        })
        .handler(() => ({ status: 200, body: [] })),
    getUser: k
        .route({
            method: 'GET',
            path: '/users/:id',
            auth: 'member',
            summary: 'Read one user',
            tool: true,
            responses: { 200: z.object({ id: z.string() }) },
        })
        .handler(({ params }) => ({ status: 200, body: { id: params.id } })),
    deleteUser: k
        .route({
            method: 'DELETE',
            path: '/users/:id',
            auth: 'member',
            deprecated: 'use archiveUser instead',
            sunset: '2027-01-01',
            responses: { 200: z.object({ ok: z.boolean() }) },
        })
        .handler(() => ({ status: 200, body: { ok: true } })),
});

const { api } = defineConfig({
    tags,
    auth: { identities: { member } },
    routes: { users: routes },
});

describe('routeMap', () => {
    const entries = routeMap(api, {});

    it('carries every route with its method, path and key', () => {
        expect(entries.map((entry) => `${entry.method} ${entry.path}`)).toEqual(['GET /users', 'GET /users/:id', 'DELETE /users/:id']);
        expect(entries.map((entry) => entry.key)).toEqual(['users.listUsers', 'users.getUser', 'users.deleteUser']);
    });

    it('reads a public route as public and a guarded one by its identity', () => {
        expect(entries[0]?.auth).toBe('public');
        expect(entries[1]?.auth).toBe('member');
    });

    it('names a route that publishes as a tool, and leaves the rest alone', () => {
        expect(entries[1]?.tool).toBe('users_get_user');
        expect(entries[0]?.tool).toBeUndefined();
    });

    it('carries the deprecation message and the sunset date', () => {
        expect(entries[2]?.deprecated).toBe('use archiveUser instead');
        expect(entries[2]?.sunset).toBe('2027-01-01');
        expect(entries[0]?.deprecated).toBeUndefined();
    });

    it('carries the tag each route sits under', () => {
        expect(entries[1]?.tags).toEqual(['users']);
    });
});

describe('formatRoutes', () => {
    it('aligns the columns and notes what each route asks of a caller', () => {
        const printed = formatRoutes(routeMap(api, {}));
        const lines = printed.split('\n');
        expect(lines[0]).toContain('GET');
        expect(lines[0]).toContain('/users');
        expect(lines[0]).toContain('auth: public');
        expect(lines[1]).toContain('tool: users_get_user');
        expect(lines[2]).toContain('deprecated, use archiveUser instead');
        expect(lines[2]).toContain('sunset 2027-01-01');
    });

    it('says so when a config declares no routes', () => {
        expect(formatRoutes([])).toBe('This config declares no routes.');
    });
});
