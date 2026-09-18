import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { Contract } from '@ts-kizuna/core';
import { loadContract } from './load-contract.js';
import { diffContracts, type Change } from './diff-contracts.js';

export interface DiffAgainstOptions {
    /**
     * Named export to read the contract from.
     *
     * @default 'contract'
     */
    exportName?: string;
    /**
     * Repository the ref lives in.
     *
     * @default process.cwd()
     */
    cwd?: string;
}

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/**
 * Compares the contract on disk against the same contract at a git ref.
 *
 * The ref is checked out into a worktree inside the repository, which costs a
 * few files rather than a clone. Nothing is installed there: module resolution
 * walks up to the repository's own `node_modules`, so the base tree needs only
 * its source.
 *
 * @example
 * const changes = await diffAgainst('main', './src/contract.ts');
 */
export const diffAgainst = async (ref: string, contractPath: string, options: DiffAgainstOptions = {}): Promise<Change[]> => {
    const { exportName = 'api', cwd = process.cwd() } = options;

    const root = git(cwd, 'rev-parse', '--show-toplevel');
    const absolute = isAbsolute(contractPath) ? contractPath : resolve(cwd, contractPath);
    const fromRoot = relative(root, absolute);

    if (fromRoot.startsWith('..')) throw new Error(`${contractPath} is outside the repository at ${root}`);

    // Inside the repository, so Node resolves dependencies by walking up to the
    // root's `node_modules` instead of needing an install of its own.
    const worktree = mkdtempSync(join(root, '.kizuna-diff-'));

    try {
        git(root, 'worktree', 'add', '--detach', '--force', worktree, ref);

        const before = await loadContract(join(worktree, fromRoot), { exportName });
        if (before === undefined) throw new Error(`No \`${exportName}\` export in ${fromRoot} at ${ref}`);

        const after = await loadContract(absolute, { exportName });
        if (after === undefined) throw new Error(`No \`${exportName}\` export in ${contractPath}`);

        return diffContracts(before as Contract, after as Contract);
    } finally {
        try {
            git(root, 'worktree', 'remove', '--force', worktree);
        } catch {
            rmSync(worktree, { recursive: true, force: true });
        }
    }
};
