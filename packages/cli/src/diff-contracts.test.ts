import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna, type AuthoredRoutes } from '@ts-kizuna/core';
import { diffContracts, formatChange, hasBreakingChange, type Change } from './diff-contracts.js';

const k = new Kizuna();

const ok = { 200: z.object({ id: z.string() }) };

const contractOf = (routes: AuthoredRoutes) =>
    k.contract({
        routes: {
            users: k.routes(routes),
        },
    });

const base = contractOf({
    getUser: { method: 'GET', path: '/users/:id', responses: { ...ok, 404: z.object({ detail: z.string() }) } },
    listUsers: { method: 'GET', path: '/users', responses: ok },
});

const summaries = (changes: Change[]) => changes.map((change) => change.summary);

describe('routes that come and go', () => {
    it('reports a removed route as breaking', () => {
        const after = contractOf({ listUsers: { method: 'GET', path: '/users', responses: ok } });
        const changes = diffContracts(base, after);

        expect(changes[0]).toMatchObject({ level: 'breaking', key: 'users.getUser' });
        expect(summaries(changes)).toContain('users.getUser is gone');
    });

    it('reports a new route as added, not breaking', () => {
        const after = contractOf({
            getUser: { method: 'GET', path: '/users/:id', responses: { ...ok, 404: z.object({ detail: z.string() }) } },
            listUsers: { method: 'GET', path: '/users', responses: ok },
            archiveUser: { method: 'POST', path: '/users/:id/archive', responses: ok },
        });
        const changes = diffContracts(base, after);

        expect(changes).toHaveLength(1);
        expect(changes[0]?.level).toBe('added');
        expect(hasBreakingChange(changes)).toBe(false);
    });
});

describe('a rename, which OpenAPI cannot see', () => {
    it('reads as a rename rather than a removal and an addition', () => {
        const after = contractOf({
            fetchUser: { method: 'GET', path: '/users/:id', responses: { ...ok, 404: z.object({ detail: z.string() }) } },
            listUsers: { method: 'GET', path: '/users', responses: ok },
        });
        const changes = diffContracts(base, after);

        expect(changes).toHaveLength(1);
        expect(changes[0]).toMatchObject({
            level: 'breaking',
            summary: 'users.getUser renamed to users.fetchUser',
        });
        expect(changes[0]?.detail).toContain('HTTP surface unaffected');
    });
});

describe('the shape of a route', () => {
    it('reports a moved path as breaking', () => {
        const after = contractOf({
            getUser: { method: 'GET', path: '/people/:id', responses: { ...ok, 404: z.object({ detail: z.string() }) } },
            listUsers: { method: 'GET', path: '/users', responses: ok },
        });

        expect(summaries(diffContracts(base, after))).toContain('users.getUser moved from /users/:id to /people/:id');
    });

    it('reports a changed method as breaking', () => {
        const after = contractOf({
            getUser: { method: 'POST', path: '/users/:id', responses: { ...ok, 404: z.object({ detail: z.string() }) } },
            listUsers: { method: 'GET', path: '/users', responses: ok },
        });

        expect(summaries(diffContracts(base, after))).toContain('users.getUser answers POST instead of GET');
    });

    it('reports a dropped status as breaking and a new one as changed', () => {
        const after = contractOf({
            getUser: { method: 'GET', path: '/users/:id', responses: { ...ok, 410: z.object({ detail: z.string() }) } },
            listUsers: { method: 'GET', path: '/users', responses: ok },
        });
        const changes = diffContracts(base, after);

        expect(summaries(changes)).toContain('users.getUser no longer answers 404');
        expect(summaries(changes)).toContain('users.getUser can now answer 410');
        expect(changes.find((change) => change.summary.includes('no longer'))?.level).toBe('breaking');
        expect(changes.find((change) => change.summary.includes('can now'))?.level).toBe('changed');
    });

    it('reports a new deprecation and sunset as changed', () => {
        const after = contractOf({
            getUser: {
                method: 'GET',
                path: '/users/:id',
                deprecated: 'Use fetchUser.',
                sunset: '2027-01-01',
                responses: { ...ok, 404: z.object({ detail: z.string() }) },
            },
            listUsers: { method: 'GET', path: '/users', responses: ok },
        });
        const changes = diffContracts(base, after);

        expect(summaries(changes)).toContain('users.getUser is now deprecated');
        expect(summaries(changes)).toContain('users.getUser sunsets on 2027-01-01');
        expect(hasBreakingChange(changes)).toBe(false);
    });
});

describe('schemas, the change oasdiff was there for', () => {
    const withBody = contractOf({
        createUser: {
            method: 'POST',
            path: '/users',
            body: z.object({ name: z.string() }),
            responses: { 201: z.object({ id: z.string(), nickname: z.string() }) },
        },
    });

    it('reports a newly required request field as breaking', () => {
        const after = contractOf({
            createUser: {
                method: 'POST',
                path: '/users',
                body: z.object({ name: z.string(), organisationId: z.string() }),
                responses: { 201: z.object({ id: z.string(), nickname: z.string() }) },
            },
        });

        expect(summaries(diffContracts(withBody, after))).toContain('users.createUser body.organisationId is now required');
        expect(hasBreakingChange(diffContracts(withBody, after))).toBe(true);
    });

    it('does not report an optional request field', () => {
        const after = contractOf({
            createUser: {
                method: 'POST',
                path: '/users',
                body: z.object({ name: z.string(), nickname: z.string().optional() }),
                responses: { 201: z.object({ id: z.string(), nickname: z.string() }) },
            },
        });

        expect(diffContracts(withBody, after)).toEqual([]);
    });

    it('reports a removed response field as breaking', () => {
        const after = contractOf({
            createUser: {
                method: 'POST',
                path: '/users',
                body: z.object({ name: z.string() }),
                responses: { 201: z.object({ id: z.string() }) },
            },
        });

        expect(summaries(diffContracts(withBody, after))).toContain('users.createUser 201.nickname is gone');
    });

    it('reports a narrowed query param as breaking', () => {
        const before = contractOf({
            listUsers: { method: 'GET', path: '/users', query: z.object({ sort: z.string() }), responses: ok },
        });
        const after = contractOf({
            listUsers: {
                method: 'GET',
                path: '/users',
                query: z.object({ sort: z.enum(['name', 'createdAt']) }),
                responses: ok,
            },
        });

        expect(summaries(diffContracts(before, after))).toContain('users.listUsers query.sort is enum instead of string');
    });
});

describe('what a document cannot carry', () => {
    const withJob = k.contract({
        routes: { users: k.routes('users', { listUsers: { method: 'GET', path: '/users', responses: ok } }) },
        jobs: k.jobs({
            reconcile: {
                description: 'Reconciles invoices',
                input: z.object({ month: z.string() }),
            },
        }),
    });

    const withoutJob = k.contract({
        routes: { users: k.routes('users', { listUsers: { method: 'GET', path: '/users', responses: ok } }) },
    });

    it('reports a removed job key as breaking', () => {
        const changes = diffContracts(withJob, withoutJob);

        expect(changes).toHaveLength(1);
        expect(changes[0]).toMatchObject({ level: 'breaking', key: 'reconcile' });
        expect(changes[0]?.detail).toContain('POST /jobs/run');
    });
});

describe('reporting', () => {
    it('puts breaking changes first', () => {
        const after = contractOf({
            listUsers: { method: 'GET', path: '/users', responses: ok },
            archiveUser: { method: 'POST', path: '/users/:id/archive', responses: ok },
        });

        expect(diffContracts(base, after).map((change) => change.level)).toEqual(['breaking', 'added']);
    });

    it('reads as a block with the cost underneath', () => {
        const after = contractOf({ listUsers: { method: 'GET', path: '/users', responses: ok } });

        expect(formatChange(diffContracts(base, after)[0]!)).toBe(
            'BREAKING users.getUser is gone\n         GET /users/:id no longer exists'
        );
    });

    it('says nothing when nothing changed', () => {
        expect(diffContracts(base, base)).toEqual([]);
        expect(hasBreakingChange([])).toBe(false);
    });
});
