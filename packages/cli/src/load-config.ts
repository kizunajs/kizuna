import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createJiti } from 'jiti';
import { apiEntries, type ApiDefinition, type DiffSettings, type GeneratedFile } from 'kizunajs';

/**
 * One api a config declares, with everything generated from it. A config that
 * declares a single api reports it under `default`.
 */
export interface LoadedApi {
    name: string;
    api: ApiDefinition;
    clients: readonly GeneratedFile[];
    /**
     * The files the config's plugins generate.
     */
    generators: readonly GeneratedFile[];
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
        generators: entry.generators ?? [],
        typesOutput: entry.typescript?.outputFile,
        diff: entry.diff ?? {},
    }));
};

/**
 * What a plugin's `cli` entry exports.
 */
export interface PluginCli {
    run: (argv: readonly string[], context: unknown) => Promise<number>;
    /**
     * Writes the files the config imports, before `kizuna generate` loads it,
     * so a config never imports a generated file that has gone stale. In
     * check mode it writes nothing and says which files are behind.
     */
    prepare?: (context: { cwd: string; configPath: string; check: boolean }) => Promise<Array<{ output: string; changed: boolean }>>;
}

/**
 * The `cli` entry of a plugin installed in the project, or `undefined` when the
 * project has no such package.
 */
export const resolvePluginCli = async (specifier: string): Promise<PluginCli | undefined> => {
    const jiti = createJiti(`${process.cwd()}/`, {
        interopDefault: true,
    });
    try {
        const loaded = (await jiti.import(specifier)) as Partial<PluginCli>;
        return typeof loaded.run === 'function' ? (loaded as PluginCli) : undefined;
    } catch (error) {
        if (
            /Cannot find (module|package)|ERR_MODULE_NOT_FOUND|ERR_PACKAGE_PATH_NOT_EXPORTED|is not defined by "exports"/.test(
                String(error)
            )
        )
            return undefined;
        throw error;
    }
};

/**
 * Runs `prepare` on the CLI of every kizuna package the project depends on,
 * found from the `package.json` beside or above the config.
 */
export const preparePlugins = async (configPath: string, check: boolean): Promise<Array<{ output: string; changed: boolean }>> => {
    let folder = dirname(configPath);
    let manifest: string | undefined;
    while (manifest === undefined) {
        const candidate = join(folder, 'package.json');
        if (existsSync(candidate)) manifest = candidate;
        else if (dirname(folder) === folder) return [];
        else folder = dirname(folder);
    }
    const declared = JSON.parse(readFileSync(manifest, 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
    };
    const names = Object.keys({
        ...declared.dependencies,
        ...declared.devDependencies,
    }).filter((name) => name.startsWith('@kizunajs/') && name !== '@kizunajs/cli');
    const prepared: Array<{ output: string; changed: boolean }> = [];
    for (const name of names) {
        const cli = await resolvePluginCli(`${name}/cli`);
        if (cli?.prepare !== undefined) {
            prepared.push(
                ...(await cli.prepare({
                    cwd: process.cwd(),
                    configPath,
                    check,
                }))
            );
        }
    }
    return prepared;
};
