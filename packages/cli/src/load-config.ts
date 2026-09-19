import { createJiti } from 'jiti';
import type { Contract } from '@ts-kizuna/core';

export interface LoadConfigOptions {
    /**
     * Named export to read the contract from.
     *
     * @default 'api'
     */
    exportName?: string;
    /**
     * Collects the source files the contract was built from, its own import
     * graph with dependencies left out.
     */
    files?: string[];
    /**
     * Files to read from disk rather than from jiti's module cache, which is
     * shared across instances and would otherwise serve the version it first
     * saw. Pass what a previous load reported to pick up edits.
     */
    reread?: readonly string[];
}

const isContract = (value: unknown): value is Contract =>
    typeof value === 'object' && value !== null && typeof (value as Contract).routes === 'object';

const cacheOf = (jiti: unknown): Record<string, unknown> => (jiti as { cache?: Record<string, unknown> }).cache ?? {};

/**
 * Imports a contract module with jiti (so a `.ts` entry works without a build
 * step) and returns the named export (default `contract`) or the default export.
 * Returns undefined when neither is present.
 */
export const loadConfig = async (
    contractPath: string,
    exportNameOrOptions: string | LoadConfigOptions = 'api'
): Promise<Contract | undefined> => {
    const options = typeof exportNameOrOptions === 'string' ? { exportName: exportNameOrOptions } : exportNameOrOptions;
    const { exportName = 'api', files, reread } = options;

    const jiti = createJiti(import.meta.url, {
        interopDefault: true,
    });

    const cache = cacheOf(jiti);
    const evicted = new Set(reread ?? []);
    for (const file of evicted) delete cache[file];

    // The cache is shared across instances and outlives this call, so only what
    // this load put there counts as the contract's own graph.
    const before = new Set(Object.keys(cache));
    const loaded = (await jiti.import(contractPath)) as Record<string, Contract | undefined> | undefined;

    if (files) {
        files.push(...Object.keys(cache).filter((file) => !file.includes('node_modules') && (!before.has(file) || evicted.has(file))));
    }

    // A `kizuna.config.ts` default-exports its config, so the api is one step in.
    const config = loaded?.default as Record<string, unknown> | undefined;
    const candidate = loaded?.[exportName] ?? config?.[exportName] ?? config;

    // `interopDefault` hands back the namespace when a module has no default,
    // so a module without a config would otherwise look like one.
    return isContract(candidate) ? candidate : undefined;
};
