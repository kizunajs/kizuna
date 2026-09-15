import { watch, type FSWatcher } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Contract } from '@ts-kizuna/core';
import { loadContract } from './load-contract.js';
import { contractNotices, type Notice } from './contract-notices.js';

/**
 * What a watcher reports each time it reloads.
 */
export interface ContractChange {
    contract: Contract;
    /**
     * The file whose change triggered this reload, absent on the first load.
     */
    changed?: string;
    /**
     * Every file the contract was built from, the set being watched.
     */
    files: string[];
    /**
     * Routes that announce their own retirement, soonest sunset first.
     */
    notices: Notice[];
}

export interface WatchContractOptions {
    /**
     * Named export to read the contract from.
     *
     * @default 'contract'
     */
    exportName?: string;
    /**
     * How long to wait for a run of writes to settle, in milliseconds. Editors
     * save in bursts, and a compiler writing a directory is a burst of its own.
     *
     * @default 60
     */
    debounce?: number;
    /**
     * Called when a reload throws, which a half-typed file will. The watcher
     * keeps going and the last good contract stays current.
     *
     * Reports to stderr when you pass nothing, so a broken edit is never
     * silent.
     */
    onError?: (error: unknown, changed: string | undefined) => void;
}

/**
 * Watches a contract and its imports, reloading on change.
 *
 * The watch set is the contract's own import graph, taken from what the loader
 * reported reading, so nothing has to name a directory. Returns a function that
 * stops watching.
 */
export const watchContract = async (
    contractPath: string,
    onChange: (change: ContractChange) => void | Promise<void>,
    options: WatchContractOptions = {}
): Promise<() => void> => {
    const { exportName = 'contract', debounce = 60 } = options;

    const report =
        options.onError ??
        ((error: unknown, changed: string | undefined) => {
            const where = changed === undefined ? contractPath : changed;
            console.error(`Could not load the contract after ${where} changed.`);
            console.error(error instanceof Error ? error.message : String(error));
        });

    const watchers = new Map<string, FSWatcher>();
    let timer: NodeJS.Timeout | undefined;
    let stopped = false;

    let known: string[] = [];

    const reload = async (changed?: string): Promise<void> => {
        const files: string[] = [];
        const contract = await loadContract(contractPath, { exportName, files, reread: known });
        if (contract === undefined) throw new Error(`No \`${exportName}\` export in ${contractPath}`);

        known = files;
        watchDirectories(files);
        await onChange({ contract, changed, files, notices: contractNotices(contract, {}) });
    };

    const watchDirectories = (files: string[]): void => {
        const wanted = new Set(files.map((file) => dirname(file)));

        for (const [directory, watcher] of watchers) {
            if (wanted.has(directory)) continue;
            watcher.close();
            watchers.delete(directory);
        }

        for (const directory of wanted) {
            if (watchers.has(directory)) continue;
            try {
                // Directories, not files: an editor that writes atomically
                // replaces the inode, and a file watcher follows the old one
                // into the bin.
                const watcher = watch(directory, (_event, name) => {
                    if (stopped || name === null) return;
                    schedule(join(directory, name));
                });
                watcher.on('error', () => {
                    watcher.close();
                    watchers.delete(directory);
                });
                watchers.set(directory, watcher);
            } catch {
                // A directory that has since been removed is not worth watching.
            }
        }
    };

    const schedule = (changed: string): void => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            void reload(changed).catch((error: unknown) => report(error, changed));
        }, debounce);
    };

    await reload();

    return () => {
        stopped = true;
        if (timer) clearTimeout(timer);
        for (const watcher of watchers.values()) watcher.close();
        watchers.clear();
    };
};
