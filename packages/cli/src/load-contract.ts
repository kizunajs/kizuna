import { createJiti } from 'jiti';
import type { Contract } from '@ts-kizuna/core';

export interface LoadContractOptions {
    /**
     * Named export to read the contract from.
     *
     * @default 'contract'
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

const cacheOf = (jiti: unknown): Record<string, unknown> => (jiti as { cache?: Record<string, unknown> }).cache ?? {};

/**
 * Imports a contract module with jiti (so a `.ts` entry works without a build
 * step) and returns the named export (default `contract`) or the default export.
 * Returns undefined when neither is present.
 */
export const loadContract = async (
    contractPath: string,
    exportNameOrOptions: string | LoadContractOptions = 'contract'
): Promise<Contract | undefined> => {
    const options = typeof exportNameOrOptions === 'string' ? { exportName: exportNameOrOptions } : exportNameOrOptions;
    const { exportName = 'contract', files, reread } = options;

    const jiti = createJiti(import.meta.url, {
        interopDefault: true,
    });

    const cache = cacheOf(jiti);
    for (const file of reread ?? []) delete cache[file];

    const loaded = (await jiti.import(contractPath)) as Record<string, Contract | undefined>;

    if (files) files.push(...Object.keys(cache).filter((file) => !file.includes('node_modules')));

    return loaded[exportName] ?? loaded.default;
};
