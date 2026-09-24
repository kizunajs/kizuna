import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { diffSnapshots, type Change, type DiffOptions } from './diff-apis.js';
import { parse } from 'yaml';
import type { ApiSnapshot } from './snapshot.js';

export interface DiffAgainstOptions extends DiffOptions {
    /**
     * Where a relative path is resolved from.
     *
     * @default process.cwd()
     */
    cwd?: string;
}

const git = (cwd: string, ...args: string[]): string =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/**
 * The repository holding the snapshot, falling back to the one the caller ran in.
 */
const repositoryFor = (directory: string, cwd: string): string => {
    try {
        return git(directory, 'rev-parse', '--show-toplevel');
    } catch {
        return git(cwd, 'rev-parse', '--show-toplevel');
    }
};

const parseSnapshot = (contents: string, source: string): ApiSnapshot => {
    try {
        return parse(contents) as ApiSnapshot;
    } catch {
        throw new Error(`${source} is not a Kizuna snapshot. Run \`kizuna generate\` to write one.`);
    }
};

/**
 * Reads a path out of a ref without checking anything out.
 */
const showAtRef = (root: string, ref: string, path: string): string => {
    try {
        return git(root, 'show', `${ref}:${path}`);
    } catch {
        throw new Error(`${path} does not exist at ${ref}. It was added or renamed since, so there is nothing to compare against.`);
    }
};

export const readSnapshot = (path: string): ApiSnapshot => {
    if (!existsSync(path)) throw new Error(`No snapshot at ${path}. Run \`kizuna generate\` to write one.`);
    return parseSnapshot(readFileSync(path, 'utf8'), path);
};

/**
 * Compares a snapshot against the same file at a git ref.
 *
 * The ref is read with `git show`, so nothing is checked out, installed or
 * executed for the other side. A snapshot written a year ago compares fine
 * against one written today.
 */
export const diffAgainst = (ref: string, snapshotPath: string, options: DiffAgainstOptions = {}): Change[] => {
    const { cwd = process.cwd(), ...diff } = options;

    const absolute = isAbsolute(snapshotPath) ? snapshotPath : resolve(cwd, snapshotPath);
    const root = repositoryFor(dirname(absolute), cwd);
    const fromRoot = relative(root, absolute);

    if (fromRoot.startsWith('..')) throw new Error(`${snapshotPath} is outside the repository at ${root}`);

    const before = parseSnapshot(showAtRef(root, ref, fromRoot.split('\\').join('/')), `${fromRoot} at ${ref}`);

    return diffSnapshots(before, readSnapshot(absolute), diff);
};
