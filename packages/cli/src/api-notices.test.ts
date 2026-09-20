import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { defineConfig } from 'kizunajs';
import { apiNotices, formatNotice } from './api-notices.js';

const k = new Kizuna();

const ok = {
    responses: {
        200: z.object({ id: z.string() }),
    },
} as const;

const contract = defineConfig({
    routes: {
        users: k.routes('users', {
            getUser: k.route({
                method: 'GET',
                path: '/users/:id',
                ...ok,
            }),
            listUsers: k.route({
                method: 'GET',
                path: '/users',
                deprecated: 'Use searchUsers instead.',
                sunset: '2026-10-01',
                ...ok,
            }),
            oldSearch: k.route({
                method: 'GET',
                path: '/users/search',
                deprecated: true,
                ...ok,
            }),
            legacyExport: k.route({
                method: 'GET',
                path: '/users/export',
                deprecated: {
                    message: 'Use the reporting API.',
                    date: '2026-01-01',
                },
                sunset: '2026-09-20',
                ...ok,
            }),
            retired: k.route({
                method: 'GET',
                path: '/users/retired',
                sunset: '2026-09-01',
                ...ok,
            }),
        }),
    },
}).api;

const now = new Date('2026-09-15T00:00:00Z');
const notices = apiNotices(contract, { now });

describe('apiNotices', () => {
    it('reports only routes that announce their own retirement', () => {
        expect(notices.map((notice) => notice.routeKey)).not.toContain('users.getUser');
        expect(notices).toHaveLength(4);
    });

    it('orders by how close the sunset is, undated deprecations last', () => {
        expect(notices.map((notice) => notice.routeKey)).toEqual([
            'users.retired',
            'users.legacyExport',
            'users.listUsers',
            'users.oldSearch',
        ]);
    });

    it('counts whole days to the sunset, negative once it has passed', () => {
        expect(notices.find((notice) => notice.routeKey === 'users.retired')?.daysUntilSunset).toBe(-14);
        expect(notices.find((notice) => notice.routeKey === 'users.legacyExport')?.daysUntilSunset).toBe(5);
    });

    it('carries the message whichever form declared it', () => {
        expect(notices.find((notice) => notice.routeKey === 'users.listUsers')?.message).toBe('Use searchUsers instead.');
        expect(notices.find((notice) => notice.routeKey === 'users.legacyExport')?.message).toBe('Use the reporting API.');
        expect(notices.find((notice) => notice.routeKey === 'users.oldSearch')?.message).toBeUndefined();
    });

    it('reports a sunset on a route that is not deprecated', () => {
        const retired = notices.find((notice) => notice.routeKey === 'users.retired');
        expect(retired?.deprecated).toBe(false);
        expect(retired?.sunset).toBe('2026-09-01');
    });
});

describe('formatNotice', () => {
    it('reads as one line a watcher can print', () => {
        const listUsers = notices.find((notice) => notice.routeKey === 'users.listUsers');
        expect(formatNotice(listUsers!)).toBe('GET /users  users.listUsers  deprecated, sunset in 16 days. Use searchUsers instead.');
    });

    it('says how long ago a sunset passed', () => {
        const retired = notices.find((notice) => notice.routeKey === 'users.retired');
        expect(formatNotice(retired!)).toBe('GET /users/retired  users.retired  sunset 14 days ago');
    });

    it('says deprecated with no date when there is none', () => {
        const oldSearch = notices.find((notice) => notice.routeKey === 'users.oldSearch');
        expect(formatNotice(oldSearch!)).toBe('GET /users/search  users.oldSearch  deprecated');
    });
});
