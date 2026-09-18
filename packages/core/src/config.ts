import type { Contract } from './contract.js';

/**
 * A client generated from a config, created by its generator's own factory so
 * the options are typed where the generator lives.
 *
 * @example
 * import { swiftClient } from '@ts-kizuna/swift';
 */
export interface ClientTarget {
    /**
     * The generator that produced this target, for messages and reporting.
     */
    readonly kind: string;
    /**
     * Path the generated file is written to.
     */
    readonly output: string;
    /**
     * Renders the file this target writes.
     */
    readonly generate: (contract: Contract) => string;
}

/**
 * One API as the CLI reads it back out of `kizuna.config.ts`: what it serves,
 * and what is generated from it.
 */
export interface ApiEntry {
    api: Contract;
    clients?: readonly ClientTarget[];
}

/**
 * Every API a `kizuna.config.ts` module exports, as `[name, entry]` pairs. A
 * repository serving one API exports it as `api`, which reports as `default`;
 * one serving several exports several, each reported under its export name.
 */
export const apiEntries = (module: Record<string, unknown>): [string, ApiEntry][] => {
    const entries: [string, ApiEntry][] = [];
    for (const [name, value] of Object.entries(module)) {
        if (value === null || typeof value !== 'object') continue;
        if (!('routes' in value)) continue;
        entries.push([
            name === 'api' ? 'default' : name,
            {
                api: value as Contract,
                clients: (module.clients as readonly ClientTarget[] | undefined) ?? [],
            },
        ]);
    }
    return entries;
};
