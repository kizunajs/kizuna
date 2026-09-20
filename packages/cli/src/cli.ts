#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { apiEntries, type ClientTarget, type ApiDefinition } from '@ts-kizuna/core';
import { createJiti } from 'jiti';
import { ConfigSyntaxError, generateConfigTypes } from './generate-types.js';
import { checkClients, formatStale, writeClients } from './generate-clients.js';

const usage = `Usage: kizuna generate [options]

Writes kizuna.types.ts and every client the config declares. A file that already
matches is left alone.

Options:
  --check           Report what would be rewritten and write nothing. Exits 1
                    when anything is behind, for a pipeline to fail on.
  --config <path>   Path to the config. Default: kizuna.config.ts
  --types <path>    Where kizuna.types.ts is written. Beats the config's
                    typescript.outputFile. Default: beside the config.
`;

/**
 * A path as the person reading the terminal knows it: relative to where they
 * ran the command, unless that climbs out of the directory.
 */
const displayPath = (file: string): string => {
    const shown = relative(process.cwd(), file);
    return shown.startsWith('..') ? file : shown;
};

const die: (message: string, code?: number) => never = (message, code = 1) => {
    process.stderr.write(`${message}\n`);
    process.exit(code);
};

/**
 * The config's own default export, loaded with jiti so a `.ts` config needs no
 * build step.
 */
const loadConfig = async (
    configPath: string
): Promise<{ api: ApiDefinition; clients: readonly ClientTarget[]; typesOutput: string | undefined }> => {
    const jiti = createJiti(import.meta.url, {
        interopDefault: true,
    });
    const loaded = (await jiti.import(configPath)) as Record<string, unknown>;
    const [entry] = apiEntries(loaded);
    if (!entry) die(`No config found at ${configPath}. A kizuna config default-exports its \`defineConfig(...)\` call.`);
    return { api: entry[1].api, clients: entry[1].clients ?? [], typesOutput: entry[1].typescript?.outputFile };
};

const main = async (): Promise<void> => {
    const argv = process.argv.slice(2);
    const command = argv[0];
    if (command !== 'generate') {
        die(usage, command === undefined || command === '--help' || command === '-h' ? 0 : 1);
    }

    const { values } = parseArgs({
        args: argv.slice(1),
        options: {
            check: {
                type: 'boolean',
            },
            config: {
                type: 'string',
            },
            types: {
                type: 'string',
            },
        },
        strict: true,
    });

    const configPath = resolve(process.cwd(), values.config ?? 'kizuna.config.ts');
    if (!existsSync(configPath)) {
        die(`No config at ${displayPath(configPath)}. Pass --config to point at one.`);
    }
    let types: string;
    try {
        types = generateConfigTypes(readFileSync(configPath, 'utf8'), configPath);
    } catch (error) {
        if (error instanceof ConfigSyntaxError) die(`${displayPath(configPath)}: ${error.message}`);
        throw error;
    }

    const config = await loadConfig(configPath);
    // `--types` beats the config, which beats the file beside the config.
    const typesPath = resolve(dirname(configPath), values.types ?? config.typesOutput ?? 'kizuna.types.ts');
    const typesCurrent = existsSync(typesPath) ? readFileSync(typesPath, 'utf8') : undefined;
    const typesBehind = typesCurrent !== types;

    if (values.check) {
        const stale = checkClients(config.api, config.clients);
        if (!typesBehind && stale.length === 0) {
            process.stdout.write('Everything kizuna generates is up to date.\n');
            return;
        }
        if (typesBehind) {
            process.stdout.write(`  ${displayPath(typesPath)} is ${typesCurrent === undefined ? 'missing' : 'behind the config'}\n`);
        }
        if (stale.length > 0) process.stdout.write(`${formatStale(stale)}\n`);
        process.exit(1);
    }

    if (typesBehind) writeFileSync(typesPath, types);
    const written = writeClients(config.api, config.clients);

    const changed = [
        ...(typesBehind ? [displayPath(typesPath)] : []),
        ...written.filter((client) => client.changed).map((client) => displayPath(client.output)),
    ];
    process.stdout.write(
        changed.length > 0 ? `Wrote:\n${changed.map((file) => `  ${file}`).join('\n')}\n` : 'Everything was already up to date.\n'
    );
};

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    die(`Error: ${message}`);
});
