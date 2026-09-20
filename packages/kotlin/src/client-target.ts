import type { ClientTarget, ApiDefinition } from 'kizunajs';
import { generateKotlinClient } from './generator.js';

/**
 * Where a generated Kotlin client is written, and what it is called there.
 */
export interface KotlinClientOptions {
    /**
     * Path the generated file is written to.
     */
    output: string;
    /**
     * Name of the generated namespace object.
     *
     * @default 'API'
     */
    namespace?: string;
    /**
     * Package declaration for the generated file, e.g. `com.example.api`.
     */
    package?: string;
    /**
     * Convert wire field names to camelCase properties, mapping the wire name
     * back via `@SerialName`.
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
 * A Kotlin client target for `kizuna.config.ts`.
 *
 * @example
 * kotlinClient({ output: './api/APIClient.kt', package: 'com.example.api' });
 */
export const kotlinClient = (options: KotlinClientOptions): ClientTarget => ({
    kind: 'kotlin',
    output: options.output,
    generate: (contract: ApiDefinition) =>
        generateKotlinClient(contract, {
            namespaceName: options.namespace ?? 'API',
            packageName: options.package,
            camelCaseProperties: options.camelCaseProperties,
            unknownEnumCase: options.unknownEnumCase,
        }),
});
