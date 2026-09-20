#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from '@ts-kizuna/cli';
import { generateKotlinClient } from './generator.js';

const usage = `Usage: ts-kizuna-kotlin generate --config <path> --out <path> --namespace-name <name>

Required:
  --config <path>          Path to a kizuna.config.ts. Suffix with an export to read
                           something other than the default: src/apis.ts:workspace.
  --out <path>             File path to write the generated .kt file.
  --namespace-name <name>  Public object wrapping all generated types (e.g. MyAPI).

Optional:
  --package <name>         Package declaration for the generated file (e.g. com.example.api).
  --camel-case             Convert wire field names to camelCase properties with @SerialName.
                           Default: keep wire names verbatim.
  --unknown-enum-case      Emit enums as a sealed interface with an Unknown(wireValue) member
                           so unrecognised wire values decode instead of throwing. Default: off.
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
            out: {
                type: 'string',
            },
            'namespace-name': {
                type: 'string',
            },
            package: {
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
    const outArg = values.out ?? die('Missing --out\n\n' + usage);
    const namespaceName = values['namespace-name'] ?? die('Missing --namespace-name\n\n' + usage);

    const [pathPart, apiName = values.export] = configArg.split(':');
    const configPath = resolve(process.cwd(), pathPart!);
    const apis = await loadConfig(configPath);
    const loaded =
        (apiName === undefined ? apis[0] : apis.find((entry) => entry.name === apiName)) ??
        die(apiName === undefined ? `No config found at ${configPath}` : `No api named \`${apiName}\` at ${configPath}`);
    const contract = loaded.api;
    const kotlinSource = generateKotlinClient(contract, {
        namespaceName,
        packageName: values.package,
        camelCaseProperties: values['camel-case'],
        unknownEnumCase: values['unknown-enum-case'],
    });

    const outputPath = resolve(process.cwd(), outArg);
    mkdirSync(dirname(outputPath), {
        recursive: true,
    });
    writeFileSync(outputPath, kotlinSource, 'utf8');

    process.stdout.write(`Wrote ${kotlinSource.length} bytes to ${outputPath}\n`);
};

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    die(`Error: ${message}`);
});
