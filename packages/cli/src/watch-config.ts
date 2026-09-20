import { watch, type FSWatcher } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ApiDefinition } from '@ts-kizuna/core';
import { loadConfig } from './load-config.js';
import { apiNotices, type Notice } from './api-notices.js';

/**
 * What a watcher reports each time it reloads.
 */
export interface ConfigChange {
    api: ApiDefinition;
    /**
     * The file whose change triggered this reload, absent on the first load.
     */
    changed?: string;
    /**
     * Every file the api was built from, the set being watched.
     */
    files: string[];
    /**
     * Routes that announce their own retirement, soonest sunset first.
     */
    notices: Notice[];
}

export interface WatchConfigOptions {
    /**
     * Named export to read the api from.
     *
     * @default 'api'
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
     * keeps going and the last good api stays current.
     *
     * Reports to stderr when you pass nothing, so a broken edit is never
     * silent.
     */
    onError?: (error: unknown, changed: string | undefined) => void;
}

/**
 * Watches a config and its imports, reloading on change.
 *
 * The watch set is the config's own import graph, taken from what the loader
 * reported reading, so nothing has to name a directory. Returns a function that
 * stops watching.
 */
export const watchConfig = async (
    configPath: string,
    onChange: (change: ConfigChange) => void | Promise<void>,
    options: WatchConfigOptions = {}
): Promise<() => void> => {
    const { exportName = 'api', debounce = 60 } = options;

    const report =
        options.onError ??
        ((error: unknown, changed: string | undefined) => {
            const where = changed === undefined ? configPath : changed;
            console.error(`Could not load the config after ${where} changed.`);
            console.error(error instanceof Error ? error.message : String(error));
        });

    const watchers = new Map<string, FSWatcher>();
    let timer: NodeJS.Timeout | undefined;
    let stopped = false;

    let known: string[] = [];

    const reload = async (changed?: string): Promise<void> => {
        const files: string[] = [];
        const api = await loadConfig(configPath, { exportName, files, reread: known });
        if (api === undefined) throw new Error(`No \`${exportName}\` export in ${configPath}`);

        known = files;
        watchDirectories(files);
        await onChange({ api, changed, files, notices: apiNotices(api, {}) });
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
