import { z } from 'zod';
import { defineClient, type GeneratedFileOptions } from 'kizunajs/generator';
import { kotlinClientWalk } from './generator.js';

const KotlinClientOptionsSchema = z.object({
    /**
     * Name of the generated namespace object.
     *
     * @default 'API'
     */
    namespace: z.string().default('API'),
    /**
     * Package declaration for the generated file, e.g. `com.example.api`.
     */
    package: z.string().optional(),
    /**
     * Convert wire field names to camelCase properties, mapping the wire name
     * back via `@SerialName`.
     *
     * @default false
     */
    camelCaseProperties: z.boolean().optional(),
    /**
     * Give every enum an `unknown` case, so a value the client has not been
     * generated for decodes instead of throwing.
     *
     * @default false
     */
    unknownEnumCase: z.boolean().optional(),
});

/**
 * Where a generated Kotlin client is written, and what it is called there.
 */
export type KotlinClientOptions = z.input<typeof KotlinClientOptionsSchema> & GeneratedFileOptions;

/**
 * A Kotlin client for `kizuna.config.ts`.
 *
 * @example
 * kotlinClient({
 *     output: './api/APIClient.kt',
 *     package: 'com.example.api',
 * });
 */
export const kotlinClient = defineClient({
    target: 'kotlin',
    options: KotlinClientOptionsSchema,
    generate: ({ options, api }) =>
        kotlinClientWalk(api, {
            namespaceName: options.namespace,
            packageName: options.package,
            camelCaseProperties: options.camelCaseProperties,
            unknownEnumCase: options.unknownEnumCase,
        }),
});
