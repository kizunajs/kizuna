import { z } from 'zod';
import { defineClient, type GeneratedFileOptions } from 'kizunajs/generator';
import { swiftClientWalk } from './generator.js';

const SwiftClientOptionsSchema = z.object({
    /**
     * Name of the generated namespace enum.
     *
     * @default 'API'
     */
    namespace: z.string().default('API'),
    /**
     * Convert wire field names to camelCase properties, mapping the wire name
     * back via `CodingKeys`.
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
 * Where a generated Swift client is written, and what it is called there.
 */
export type SwiftClientOptions = z.input<typeof SwiftClientOptionsSchema> & GeneratedFileOptions;

/**
 * A Swift client for `kizuna.config.ts`.
 *
 * @example
 * swiftClient({
 *     output: './Sources/APIClient/APIClient.swift',
 *     namespace: 'API',
 * });
 */
export const swiftClient = defineClient({
    target: 'swift',
    options: SwiftClientOptionsSchema,
    generate: ({ options, api }) =>
        swiftClientWalk(api, {
            namespaceName: options.namespace,
            camelCaseProperties: options.camelCaseProperties,
            unknownEnumCase: options.unknownEnumCase,
        }),
});
