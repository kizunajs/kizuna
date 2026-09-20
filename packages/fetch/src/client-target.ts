import type { ClientTarget, ApiDefinition } from '@ts-kizuna/core';
import { generateFetchClient, type FetchClientOptions } from './generator.js';

/**
 * Where a generated TypeScript client is written.
 */
export interface FetchClientTargetOptions extends FetchClientOptions {
    /**
     * Path the generated file is written to.
     */
    output: string;
}

/**
 * A TypeScript client target for `kizuna.config.ts`.
 *
 * @example
 * fetchClient({ output: './packages/api-client/src/generated.ts' });
 */
export const fetchClient = ({ output, ...options }: FetchClientTargetOptions): ClientTarget => ({
    kind: 'fetch',
    output,
    generate: (contract: ApiDefinition) => generateFetchClient(contract, options),
});
