import type { ApiDefinition } from './api-definition.js';

/**
 * A client generated from a config, created by its generator's own factory so
 * the options are typed where the generator lives.
 *
 * @example
 * import { swiftClient } from '@kizunajs/swift';
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
    readonly generate: (contract: ApiDefinition) => string;
}

/**
 * What else `kizuna diff` treats as breaking.
 */
export interface DiffSettings {
    /**
     * Report a renamed dotted key, such as `users.getUser` becoming
     * `users.fetchUser`, as breaking. The key names the method on a generated
     * client, so a rename breaks anyone shipping one as an SDK and leaves the
     * HTTP surface untouched.
     *
     * @default false
     */
    dottedKeys?: boolean;
    /**
     * Report a job key that is gone. A job answers `POST /jobs/run` by its
     * dotted key, so this matters once something outside your own code
     * dispatches them.
     *
     * @default false
     */
    jobs?: boolean;
    /**
     * Report an MCP tool a model can no longer call.
     *
     * @default false
     */
    tools?: boolean;
}

/**
 * What `kizuna.config.ts` default-exports: the api its config assembles, and
 * what is generated from it.
 */
export interface ApiEntry {
    api: ApiDefinition;
    clients?: readonly ClientTarget[];
    /**
     * Where `kizuna generate` writes the `Config`.
     */
    typescript?: {
        outputFile?: string;
    };
    /**
     * What else `kizuna diff` treats as breaking.
     */
    diff?: DiffSettings;
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
                typescript: config.typescript,
                diff: config.diff,
            },
        ],
    ];
};
