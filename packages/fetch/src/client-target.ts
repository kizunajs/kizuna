import { z } from 'zod';
import { defineClient, type GeneratedFileOptions } from 'kizunajs/generator';
import { generateFetchClient, generateFetchIds } from './generator.js';

const FileHeaderOptionsSchema = z.object({
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

const FetchClientOptionsSchema = FileHeaderOptionsSchema.extend({
    /**
     * Name of the generated namespace holding every model and every route's
     * `Params`, `Query`, `Body`, `Headers` and `Result`.
     *
     * @default 'API'
     */
    namespace: z.string().optional(),
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
 *
 * @example
 * // Only the routes under `users`, for a package of its own
 * fetchClient({
 *     output: './packages/users-client/src/index.ts',
 *     groups: ['users'],
 * });
 */
export const fetchClient = defineClient({
    target: 'fetch',
    options: FetchClientOptionsSchema,
    generate: ({ options, api, groups }) => ({
        finalize: () =>
            generateFetchClient(api, {
                ...options,
                groups,
            }),
    }),
});

/**
 * Where a generated ids file is written.
 */
export type FetchIdsTargetOptions = z.input<typeof FileHeaderOptionsSchema> & GeneratedFileOptions;

/**
 * The brands a fetch client's routes carry, as Zod schemas in a file of their
 * own. Give it the client's `groups`, and another API can declare its schemas
 * with the ids this one hands out. The file imports `kizunajs` and `zod`.
 *
 * @example
 * fetchIds({
 *     output: './packages/users-client/src/ids.ts',
 *     groups: ['users'],
 * });
 */
export const fetchIds = defineClient({
    target: 'fetch-ids',
    options: FileHeaderOptionsSchema,
    generate: ({ options, api, groups }) => ({
        finalize: () =>
            generateFetchIds(api, {
                ...options,
                groups,
            }),
    }),
});
