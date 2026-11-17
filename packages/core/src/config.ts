import type { ConfigExtension } from './config-extension.js';
import type { ApiDefinition } from './api-definition.js';

/**
 * A file `kizuna generate` writes and `--check` compares, made by a client's
 * factory, a generator's, or kizuna itself.
 *
 * @example
 * swiftClient({
 *     output: './Sources/APIClient/APIClient.swift',
 * });
 */
export interface GeneratedFile {
    /**
     * The language a client generates, like `swift`. A generator has none.
     */
    readonly target?: string;
    /**
     * Path the file is written to, resolved against the config's directory.
     */
    readonly output: string;
    /**
     * Renders the file's contents.
     */
    readonly render: (api: ApiDefinition) => string;
}

/**
 * Where `kizuna generate` writes the `Config` and what else it holds.
 */
export interface ConfigTypes {
    /**
     * Path the `Config` is written to, resolved against the config's directory.
     */
    outputFile?: string;
    /**
     * What else `Config` holds, each entry under a name of its own. A class that
     * extends `Kizuna` reads its entry back, so a method it adds to `k` can check
     * a name against the others. Code that wraps `defineConfig` adds its entry
     * and keeps the ones already there.
     *
     * @example
     * typescript: {
     *     ...options.typescript,
     *     extend: [
     *         ...(options.typescript?.extend ?? []),
     *         {
     *             reports: {
     *                 names: options.reports.map((report) => report.name),
     *             },
     *         },
     *     ],
     * },
     */
    extend?: readonly ConfigExtension[];
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
    clients?: readonly GeneratedFile[];
    /**
     * The files the config's plugins generate.
     */
    generators?: readonly GeneratedFile[];
    /**
     * Where `kizuna generate` writes the `Config` and what else it holds.
     */
    typescript?: ConfigTypes;
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
                generators: config.generators ?? [],
                typescript: config.typescript,
                diff: config.diff,
            },
        ],
    ];
};
