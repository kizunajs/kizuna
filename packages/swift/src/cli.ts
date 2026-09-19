#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from '@ts-kizuna/cli';
import { generateSwiftClient } from './generator.js';

const usage = `Usage: ts-kizuna-swift generate --config <path> --output <path> --namespace-name <name>

Required:
  --config <path>          Path to a kizuna.config.ts. Suffix with an export to read
                           something other than the default: src/apis.ts:workspace.
  --output <path>          File path to write the generated .swift file.
  --namespace-name <name>  Public enum wrapping all generated types (e.g. MyAPI).

Optional:
  --camel-case             Convert wire field names to camelCase properties with CodingKeys.
                           Default: keep wire names verbatim.
  --unknown-enum-case      Emit enums with an unknown(String) fallback so unrecognised
                           wire values decode instead of throwing. Default: off.
  --export <name>          Export name when none is suffixed. Default: api.
`;

const die = (message: string, code = 1): never => {
    process.stderr.write(`${message}\n`);
    process.exit(code);
};

const main = async (): Promise<void> => {
    const argv = process.argv.slice(2);
    const command = argv[0];
    if (command !== 'generate') {
        die(usage, command ? 1 : 0);
    }

    const { values } = parseArgs({
        args: argv.slice(1),
        options: {
            config: {
                type: 'string',
            },
            output: {
                type: 'string',
            },
            'namespace-name': {
                type: 'string',
            },
            'camel-case': {
                type: 'boolean',
            },
            'unknown-enum-case': {
                type: 'boolean',
            },
            export: {
                type: 'string',
            },
        },
        strict: true,
    });

    const configArg = values.config ?? die('Missing --config\n\n' + usage);
    const outArg = values.output ?? die('Missing --output\n\n' + usage);
    const namespaceName = values['namespace-name'] ?? die('Missing --namespace-name\n\n' + usage);

    const [pathPart, exportName = values.export ?? 'api'] = configArg.split(':');
    const configPath = resolve(process.cwd(), pathPart!);
    const contract = (await loadConfig(configPath, exportName)) ?? die(`No \`${exportName}\` (or default) export found at ${configPath}`);
    const swiftSource = generateSwiftClient(contract, {
        namespaceName,
        camelCaseProperties: values['camel-case'],
        unknownEnumCase: values['unknown-enum-case'],
    });

    const outputPath = resolve(process.cwd(), outArg);
    mkdirSync(dirname(outputPath), {
        recursive: true,
    });
    writeFileSync(outputPath, swiftSource, 'utf8');

    process.stdout.write(`Wrote ${swiftSource.length} bytes to ${outputPath}\n`);
};

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    die(`Error: ${message}`);
});
