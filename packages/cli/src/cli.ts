#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ConfigSyntaxError, generateConfigTypes } from './generate-types.js';
import { checkClients, formatStale, writeClients } from './generate-clients.js';
import { loadConfig } from './load-config.js';

const usage = `Usage: kizuna generate [options]

Writes kizuna.types.ts and every client the config declares. A file that already
matches is left alone.

Options:
  --check           Report what would be rewritten and write nothing. Exits 1
                    when anything is behind, for a pipeline to fail on.
  --config <path>   Path to the config. Default: kizuna.config.ts
  --types <path>    Where the Config is written, overriding the config's
                    typescript.outputFile.
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

    const [config] = await loadConfig(configPath);
    if (!config) die(`No config found at ${displayPath(configPath)}. A kizuna config default-exports its \`defineConfig(...)\` call.`);
    // `--types` beats the config, which beats the file beside the config.
    const typesOutput = values.types ?? config.typesOutput;
    if (typesOutput === undefined) {
        die(
            `${displayPath(configPath)} declares no \`typescript.outputFile\`, which is where the \`Config\` is written. ` +
                'Add one, or pass --types.'
        );
    }
    const typesPath = resolve(dirname(configPath), typesOutput);
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
