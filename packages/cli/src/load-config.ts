import { createJiti } from 'jiti';
import { apiEntries, type ApiDefinition, type ClientTarget, type DiffSettings } from 'kizunajs';

/**
 * One api a config declares, with everything generated from it. A config that
 * declares a single api reports it under `default`.
 */
export interface LoadedApi {
    name: string;
    api: ApiDefinition;
    clients: readonly ClientTarget[];
    /**
     * Where `kizuna generate` writes the `Config`, when the config says.
     */
    typesOutput: string | undefined;
    /**
     * What else `kizuna diff` treats as breaking.
     */
    diff: DiffSettings;
}

/**
 * Imports a config module with jiti, so a `.ts` config works without a build
 * step, and returns every api it declares along with the clients and the types
 * output each one asks for.
 *
 * Returns an empty list when the module default-exports nothing that looks like
 * a config.
 */
export const loadConfig = async (configPath: string): Promise<LoadedApi[]> => {
    const jiti = createJiti(import.meta.url, {
        interopDefault: true,
        jsx: true,
        tsconfigPaths: true,
    });

    const loaded = (await jiti.import(configPath)) as Record<string, unknown>;

    return apiEntries(loaded).map(([name, entry]) => ({
        name,
        api: entry.api,
        clients: entry.clients ?? [],
        typesOutput: entry.typescript?.outputFile,
        diff: entry.diff ?? {},
    }));
};
