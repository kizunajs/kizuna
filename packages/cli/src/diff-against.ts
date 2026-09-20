import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { loadConfig } from './load-config.js';
import { diffApis, type Change } from './diff-apis.js';

export interface DiffAgainstOptions {
    /**
     * Repository the ref lives in.
     *
     * @default process.cwd()
     */
    cwd?: string;
}

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/**
 * Compares the config on disk against the same config at a git ref.
 *
 * The ref is checked out into a worktree inside the repository, which costs a
 * few files rather than a clone. Nothing is installed there: module resolution
 * walks up to the repository's own `node_modules`, so the base tree needs only
 * its source.
 *
 * @example
 * const changes = await diffAgainst('main', './src/contract.ts');
 */
export const diffAgainst = async (ref: string, configPath: string, options: DiffAgainstOptions = {}): Promise<Change[]> => {
    const { cwd = process.cwd() } = options;

    const root = git(cwd, 'rev-parse', '--show-toplevel');
    const absolute = isAbsolute(configPath) ? configPath : resolve(cwd, configPath);
    const fromRoot = relative(root, absolute);

    if (fromRoot.startsWith('..')) throw new Error(`${configPath} is outside the repository at ${root}`);

    // Inside the repository, so Node resolves dependencies by walking up to the
    // root's `node_modules` instead of needing an install of its own.
    const worktree = mkdtempSync(join(root, '.kizuna-diff-'));

    try {
        git(root, 'worktree', 'add', '--detach', '--force', worktree, ref);

        const [before] = await loadConfig(join(worktree, fromRoot));
        if (before === undefined) throw new Error(`No config found in ${fromRoot} at ${ref}`);

        const [after] = await loadConfig(absolute);
        if (after === undefined) throw new Error(`No config found in ${configPath}`);

        return diffApis(before.api, after.api);
    } finally {
        try {
            git(root, 'worktree', 'remove', '--force', worktree);
        } catch {
            rmSync(worktree, { recursive: true, force: true });
        }
    }
};
