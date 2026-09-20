#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ConfigSyntaxError, generateConfigTypes } from './generate-types.js';
import { checkClients, formatStale, writeClients } from './generate-clients.js';
import { loadConfig } from './load-config.js';
import { formatRoutes, routeMap } from './route-map.js';
import { diffAgainst } from './diff-against.js';
import { formatChange, hasBreakingChange } from './diff-apis.js';

const usage = `Usage: kizuna <command> [options]

Commands:
  generate   Write kizuna.types.ts and every client the config declares.
  routes     Print every route the config serves.
  diff       Compare the config against the same config at a git ref.

Options:
  --config <path>   Path to the config. Default: kizuna.config.ts
  --json            Print machine-readable output. routes, diff.

generate:
  --check           Report what would be rewritten and write nothing. Exits 1
                    when anything is behind, for a pipeline to fail on.
  --types <path>    Where the Config is written, overriding the config's
                    typescript.outputFile.

diff:
  --against <ref>   The git ref to compare against. Default: main
                    Exits 1 when a change breaks callers.
`;

const COMMANDS = ['generate', 'routes', 'diff'];

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
 * Resolves the config the command runs against, dying with the same message
 * whichever command asked.
 */
const configPathFrom = (given: string | undefined): string => {
    const configPath = resolve(process.cwd(), given ?? 'kizuna.config.ts');
    if (!existsSync(configPath)) die(`No config at ${displayPath(configPath)}. Pass --config to point at one.`);
    return configPath;
};

const loadOrDie = async (configPath: string) => {
    const [config] = await loadConfig(configPath);
    if (!config) die(`No config found at ${displayPath(configPath)}. A kizuna config default-exports its \`defineConfig(...)\` call.`);
    return config;
};

const runGenerate = async (values: { check?: boolean; config?: string; types?: string }): Promise<void> => {
    const configPath = configPathFrom(values.config);
    let types: string;
    try {
        types = generateConfigTypes(readFileSync(configPath, 'utf8'), configPath);
    } catch (error) {
        if (error instanceof ConfigSyntaxError) die(`${displayPath(configPath)}: ${error.message}`);
        throw error;
    }

    const config = await loadOrDie(configPath);
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

const runRoutes = async (values: { config?: string; json?: boolean }): Promise<void> => {
    const config = await loadOrDie(configPathFrom(values.config));
    const entries = routeMap(config.api, {});
    process.stdout.write(values.json ? `${JSON.stringify(entries, null, 2)}\n` : `${formatRoutes(entries)}\n`);
};

const runDiff = async (values: { config?: string; json?: boolean; against?: string }): Promise<void> => {
    const configPath = configPathFrom(values.config);
    const changes = await diffAgainst(values.against ?? 'main', configPath);

    if (values.json) {
        process.stdout.write(`${JSON.stringify(changes, null, 2)}\n`);
    } else if (changes.length === 0) {
        process.stdout.write('Nothing callers depend on has moved.\n');
    } else {
        process.stdout.write(`${changes.map((change) => formatChange(change)).join('\n\n')}\n`);
    }

    if (hasBreakingChange(changes)) process.exit(1);
};

const main = async (): Promise<void> => {
    const argv = process.argv.slice(2);
    const command = argv[0];
    if (command === undefined || !COMMANDS.includes(command)) {
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
            json: {
                type: 'boolean',
            },
            against: {
                type: 'string',
            },
        },
        strict: true,
    });

    if (command === 'routes') return runRoutes(values);
    if (command === 'diff') return runDiff(values);
    return runGenerate(values);
};

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    die(`Error: ${message}`);
});
