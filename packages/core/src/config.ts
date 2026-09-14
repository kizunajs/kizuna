import type { Contract } from './contract.js';
import type { Routes } from './types.js';

/**
 * A client generated from a contract, created by its generator's own factory so
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
 * One API: the contract it is defined by, and what is generated from it.
 */
export interface ApiEntry {
    contract: Contract;
    clients?: readonly ClientTarget[];
}

/**
 * A repository with one API names its contract directly. One with several
 * names each under `apis`.
 */
export type KizunaConfigInput = ApiEntry | { apis: Record<string, ApiEntry> };

/**
 * What kizuna knows about this repository, declared in `kizuna.config.ts` and
 * read back through the `KizunaConfig` interface.
 *
 * Augment `KizunaConfig` with this so the rest of kizuna can resolve names
 * against your routes:
 *
 * @example
 * ```ts
 * export const config = defineConfig({
 *     contract,
 * });
 *
 * declare module '@ts-kizuna/core' {
 *     interface KizunaConfig extends ConfigOf<typeof config> {}
 * }
 * ```
 */
export type ConfigOf<Config> = Config extends {
    apis: infer Apis;
}
    ? {
          [Name in keyof Apis]: Apis[Name] extends {
              contract: {
                  routes: infer Routes_;
              };
          }
              ? {
                    routes: Routes_;
                }
              : never;
      }
    : Config extends {
            contract: {
                routes: infer Routes_;
            };
        }
      ? {
            routes: Routes_;
        }
      : never;

/**
 * Declared by `kizuna.config.ts` through declaration merging. Empty until a
 * repository augments it, which is why every name resolved against it degrades
 * to nothing rather than to the wrong thing.
 */
export interface KizunaConfig {}

/**
 * The route tree one API was registered with. A repository with a single API
 * registers it without a name, so the name is ignored there.
 */
export type RegisteredRoutes<Name extends string = string> = KizunaConfig extends {
    routes: infer Routes_;
}
    ? Routes_
    : Name extends keyof KizunaConfig
      ? KizunaConfig[Name] extends {
            routes: infer Routes_;
        }
          ? Routes_
          : Routes
      : Routes;

/**
 * The names a repository registered, e.g. `'app' | 'workspace'`. Empty for a
 * repository with a single API, which names nothing.
 */
export type RegisteredApiNames = keyof KizunaConfig & string;

/**
 * Describe this repository's APIs, so the CLI can generate their clients and
 * kizuna can resolve names against their routes.
 *
 * It sits at the root of the repository, points at contracts you have already
 * built, and is types plus data: nothing here runs at request time.
 *
 * @example
 * ```ts
 * export const config = defineConfig({
 *     contract,
 *     clients: [
 *         swiftClient({
 *             output: './Sources/APIClient/APIClient.swift',
 *             namespace: 'API',
 *         }),
 *     ],
 * });
 * ```
 *
 * @example
 * ```ts
 * export const config = defineConfig({
 *     apis: {
 *         app: {
 *             contract: appContract,
 *         },
 *         workspace: {
 *             contract: workspaceContract,
 *         },
 *     },
 * });
 * ```
 */
export const defineConfig = <const Config extends KizunaConfigInput>(config: Config): Config => config;

/**
 * Every API a config declares, as `[name, entry]` pairs. A config naming one
 * API without a key reports it as `default`.
 */
export const apiEntries = (config: KizunaConfigInput): [string, ApiEntry][] => {
    if ('apis' in config) return Object.entries(config.apis);
    return [['default', config]];
};
