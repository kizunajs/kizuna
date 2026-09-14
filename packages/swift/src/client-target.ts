import type { ClientTarget, Contract } from '@ts-kizuna/core';
import { generateSwiftClient } from './generator.js';

/**
 * Where a generated Swift client is written, and what it is called there.
 */
export interface SwiftClientOptions {
    /**
     * Path the generated file is written to.
     */
    output: string;
    /**
     * Name of the generated namespace enum.
     *
     * @default 'API'
     */
    namespace?: string;
    /**
     * Convert wire field names to camelCase properties, mapping the wire name
     * back via `CodingKeys`.
     *
     * @default false
     */
    camelCaseProperties?: boolean;
    /**
     * Give every enum an `unknown` case, so a value the client has not been
     * generated for decodes instead of throwing.
     *
     * @default false
     */
    unknownEnumCase?: boolean;
}

/**
 * A Swift client target for `kizuna.config.ts`.
 *
 * @example
 * swiftClient({ output: './Sources/APIClient/APIClient.swift', namespace: 'API' });
 */
export const swiftClient = (options: SwiftClientOptions): ClientTarget => ({
    kind: 'swift',
    output: options.output,
    generate: (contract: Contract) =>
        generateSwiftClient(contract, {
            namespaceName: options.namespace ?? 'API',
            camelCaseProperties: options.camelCaseProperties,
            unknownEnumCase: options.unknownEnumCase,
        }),
});
