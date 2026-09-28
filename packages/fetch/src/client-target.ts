import { z } from 'zod';
import { defineClient, type GeneratedFileOptions } from 'kizunajs/generator';
import { generateFetchClient } from './generator.js';

const FetchClientOptionsSchema = z.object({
    /**
     * Name of the generated namespace holding every model and every route's
     * `Params`, `Query`, `Body`, `Headers` and `Result`.
     *
     * @default 'API'
     */
    namespace: z.string().optional(),
    /**
     * Module the generated file imports its runtime from.
     *
     * @default '@kizunajs/fetch'
     */
    runtimeModule: z.string().optional(),
    /**
     * Command the file's header tells a reader to run.
     *
     * @default 'kizuna generate'
     */
    regenerateCommand: z.string().optional(),
    /**
     * Path to the api this was generated from, relative to the generated
     * file. Named in the header so tooling can tell when the client has fallen
     * behind, and so a reader knows where the API is declared.
     */
    source: z.string().optional(),
});

/**
 * Where a generated TypeScript client is written.
 */
export type FetchClientTargetOptions = z.input<typeof FetchClientOptionsSchema> & GeneratedFileOptions;

/**
 * A TypeScript client for `kizuna.config.ts`.
 *
 * @example
 * fetchClient({
 *     output: './packages/api-client/src/generated.ts',
 * });
 */
export const fetchClient = defineClient({
    target: 'fetch',
    options: FetchClientOptionsSchema,
    generate: ({ options, api }) => ({
        finalize: () => generateFetchClient(api, options),
    }),
});
