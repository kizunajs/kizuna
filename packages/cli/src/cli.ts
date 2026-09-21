#!/usr/bin/env node
import type { ClientTarget } from 'kizunajs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ConfigSyntaxError, generateConfigTypes } from './generate-types.js';
import { checkClients, formatStale, writeClients } from './generate-clients.js';
import { loadConfig } from './load-config.js';
import { formatRoutes, routeMap } from './route-map.js';
import { diffAgainst, readSnapshot } from './diff-against.js';
import { diffSnapshots, formatChange, hasBreakingChange } from './diff-apis.js';
import { snapshotPathFor, snapshotTarget } from './snapshot.js';

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
  --from <path>     Compare two snapshots directly, with no git and no
  --to <path>       config. Pass both.
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

/**
 * A client writes where its config says, not where the command was run from,
 * so `kizuna generate --config apps/api/kizuna.config.ts` lands the same files
 * wherever it is invoked.
 */
const besideConfig = (configPath: string, clients: readonly ClientTarget[]): ClientTarget[] =>
    clients.map((client) => ({ ...client, output: resolve(dirname(configPath), client.output) }));

const runGenerate = async (values: { check?: boolean; config?: string; types?: string }): Promise<void> => {
    const configPath = configPathFrom(values.config);
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

    // Settled first: the generated imports are written relative to it.
    let types: string;
    try {
        types = generateConfigTypes(readFileSync(configPath, 'utf8'), configPath, typesPath);
    } catch (error) {
        if (error instanceof ConfigSyntaxError) die(`${displayPath(configPath)}: ${error.message}`);
        throw error;
    }

    const typesCurrent = existsSync(typesPath) ? readFileSync(typesPath, 'utf8') : undefined;
    const typesBehind = typesCurrent !== types;

    if (values.check) {
        const stale = checkClients(config.api, [...besideConfig(configPath, config.clients), snapshotTarget(configPath)]);
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
    const written = writeClients(config.api, [...besideConfig(configPath, config.clients), snapshotTarget(configPath)]);

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

const runDiff = async (values: { config?: string; json?: boolean; against?: string; from?: string; to?: string }): Promise<void> => {
    let changes;

    if (values.from !== undefined || values.to !== undefined) {
        if (values.from === undefined || values.to === undefined) die('Pass --from and --to together, or neither.');
        changes = diffSnapshots(readSnapshot(values.from!), readSnapshot(values.to!));
    } else {
        const configPath = configPathFrom(values.config);
        const config = await loadOrDie(configPath);
        changes = diffAgainst(values.against ?? 'main', snapshotPathFor(configPath), config.diff);
    }

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
            from: {
                type: 'string',
            },
            to: {
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
