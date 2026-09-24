import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { diffAgainst } from './diff-against.js';
import type { ApiSnapshot } from './snapshot.js';

const repositories: string[] = [];

afterEach(() => {
    while (repositories.length > 0) rmSync(repositories.pop()!, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });

const snapshotOf = (path: string): ApiSnapshot => ({
    routes: {
        'users.getUser': { method: 'GET', path, statuses: [200], deprecated: false, responses: { 200: null } },
    },
    jobs: [],
    tools: {},
});

const SNAPSHOT = join('.kizuna', 'snapshot.yaml');

const write = (directory: string, snapshot: ApiSnapshot) => {
    mkdirSync(join(directory, '.kizuna'), { recursive: true });
    writeFileSync(join(directory, SNAPSHOT), stringify(snapshot, { lineWidth: 0 }));
};

const repository = (snapshot: ApiSnapshot) => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'kizuna-diff-against-')));
    repositories.push(directory);

    git(directory, 'init', '--quiet');
    git(directory, 'config', 'user.email', 'test@example.com');
    git(directory, 'config', 'user.name', 'Test');

    write(directory, snapshot);
    git(directory, 'add', '.');
    git(directory, 'commit', '--quiet', '-m', 'first');

    return directory;
};

describe('diffAgainst', () => {
    it('says nothing when the api has not moved', () => {
        const directory = repository(snapshotOf('/users/:id'));

        expect(diffAgainst('HEAD', SNAPSHOT, { cwd: directory })).toEqual([]);
    });

    it('reports what changed since a ref', () => {
        const directory = repository(snapshotOf('/users/:id'));
        write(directory, snapshotOf('/people/:id'));

        expect(diffAgainst('HEAD', SNAPSHOT, { cwd: directory }).map((change) => change.summary)).toEqual([
            'GET /users/:id moved to /people/:id',
        ]);
    });

    it('reads a ref that is several commits back', () => {
        const directory = repository(snapshotOf('/users/:id'));

        write(directory, snapshotOf('/people/:id'));
        git(directory, 'commit', '--quiet', '-am', 'second');
        write(directory, snapshotOf('/users/:id'));

        expect(diffAgainst('HEAD~1', SNAPSHOT, { cwd: directory })).toEqual([]);
        expect(diffAgainst('HEAD', SNAPSHOT, { cwd: directory }).map((change) => change.summary)).toEqual([
            'GET /people/:id moved to /users/:id',
        ]);
    });

    it('never checks anything out', () => {
        const directory = repository(snapshotOf('/users/:id'));
        diffAgainst('HEAD', SNAPSHOT, { cwd: directory });

        expect(git(directory, 'worktree', 'list').trim().split('\n')).toHaveLength(1);
        expect(git(directory, 'status', '--porcelain').trim()).toBe('');
    });

    it('says so when the ref has no snapshot', () => {
        const directory = repository(snapshotOf('/users/:id'));
        git(directory, 'rm', '--quiet', SNAPSHOT);
        git(directory, 'commit', '--quiet', '-m', 'no snapshot');
        write(directory, snapshotOf('/users/:id'));

        expect(() => diffAgainst('HEAD', SNAPSHOT, { cwd: directory })).toThrow('does not exist at HEAD');
    });

    it('refuses a snapshot outside the repository', () => {
        const directory = repository(snapshotOf('/users/:id'));

        expect(() => diffAgainst('HEAD', '/etc/hosts', { cwd: directory })).toThrow('outside the repository');
    });
});
