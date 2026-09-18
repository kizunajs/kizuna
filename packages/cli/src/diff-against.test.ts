import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { diffAgainst } from './diff-against.js';

const repositories: string[] = [];

afterEach(() => {
    while (repositories.length > 0) rmSync(repositories.pop()!, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });

/**
 * A contract with no imports, so the repository needs no dependencies of its
 * own and the test is about the ref handling rather than module resolution.
 */
const contractSource = (routes: string) => `export const api = { routes: ${routes} };\n`;

const repository = (initial: string) => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'kizuna-diff-against-')));
    repositories.push(directory);

    git(directory, 'init', '--quiet');
    git(directory, 'config', 'user.email', 'test@example.com');
    git(directory, 'config', 'user.name', 'Test');

    writeFileSync(join(directory, 'contract.ts'), contractSource(initial));
    git(directory, 'add', '.');
    git(directory, 'commit', '--quiet', '-m', 'first');

    return directory;
};

const userRoutes = (extra = '') => `{ users: { getUser: { method: 'GET', path: '/users/:id', responses: { 200: {}, 404: {} } }${extra} } }`;

describe('diffAgainst', () => {
    it('says nothing when the contract has not moved', async () => {
        const directory = repository(userRoutes());

        expect(await diffAgainst('HEAD', 'contract.ts', { cwd: directory })).toEqual([]);
    });

    it('reports what changed since a ref', async () => {
        const directory = repository(userRoutes());

        writeFileSync(
            join(directory, 'contract.ts'),
            contractSource(`{ users: { listUsers: { method: 'GET', path: '/users', responses: { 200: {} } } } }`)
        );

        const changes = await diffAgainst('HEAD', 'contract.ts', { cwd: directory });

        expect(changes.map((change) => change.summary)).toEqual(['users.getUser is gone', 'users.listUsers added']);
    });

    it('reads a ref that is several commits back', async () => {
        const directory = repository(userRoutes());

        writeFileSync(
            join(directory, 'contract.ts'),
            contractSource(userRoutes(`, archiveUser: { method: 'POST', path: '/users/:id/archive', responses: { 200: {} } }`))
        );
        git(directory, 'commit', '--quiet', '-am', 'second');

        writeFileSync(join(directory, 'contract.ts'), contractSource(userRoutes()));

        expect((await diffAgainst('HEAD~1', 'contract.ts', { cwd: directory })).map((change) => change.summary)).toEqual([]);
        expect((await diffAgainst('HEAD', 'contract.ts', { cwd: directory })).map((change) => change.summary)).toEqual([
            'users.archiveUser is gone',
        ]);
    });

    it('leaves no worktree behind', async () => {
        const directory = repository(userRoutes());
        await diffAgainst('HEAD', 'contract.ts', { cwd: directory });

        expect(git(directory, 'worktree', 'list').trim().split('\n')).toHaveLength(1);
        expect(git(directory, 'status', '--porcelain').trim()).toBe('');
    });

    it('cleans up even when the contract at the ref cannot be read', async () => {
        const directory = repository(userRoutes());
        writeFileSync(join(directory, 'contract.ts'), 'export const nothing = true;\n');
        git(directory, 'commit', '--quiet', '-am', 'no contract');

        await expect(diffAgainst('HEAD', 'contract.ts', { cwd: directory })).rejects.toThrow('No `api` export');
        expect(git(directory, 'worktree', 'list').trim().split('\n')).toHaveLength(1);
    });

    it('refuses a contract outside the repository', async () => {
        const directory = repository(userRoutes());

        await expect(diffAgainst('HEAD', '/etc/hosts', { cwd: directory })).rejects.toThrow('outside the repository');
    });
});
