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
 * What `kizuna.config.ts` default-exports: the api its config assembles, and
 * what is generated from it.
 */
export interface ApiEntry {
    api: Contract;
    clients?: readonly ClientTarget[];
}

/**
 * The config a `kizuna.config.ts` module default-exports. A repository serving
 * several APIs writes a config file for each.
 */
export const apiEntries = (module: Record<string, unknown>): [string, ApiEntry][] => {
    const config = (module.default ?? module) as Partial<ApiEntry>;
    if (config.api === undefined) return [];
    return [
        [
            'default',
            {
                api: config.api,
                clients: config.clients ?? [],
            },
        ],
    ];
};
