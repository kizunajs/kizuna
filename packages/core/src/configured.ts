import type { AuthoredJobDefinition, JobHandlerReturn } from './jobs.js';
import type { ToolDefinition, ToolHandlerReturn } from './tools.js';
import type { JobQueueOptions } from './job-runner.js';
import type { AnyAdapter, HandlerContextOf } from './adapter.js';
import type { RequestContextValues } from './handler-pipeline.js';
import type { RequestContextSchema } from './request-context.js';
import type { SecurityScheme } from './security-scheme.js';
import type { TagOptions, TagSet } from './tags.js';
import type { z } from 'zod';

/**
 * What one API is made of, written by `kizuna generate` and handed to
 * `new Kizuna<Config>()`. Everything a handler receives beyond its own inputs,
 * and every name kizuna checks a route against, is read from it.
 *
 * @example
 * ```ts
 * // src/kizuna.types.ts, generated
 * export interface Config {
 *     adapter: typeof expressAdapter;
 *     tags: typeof tags;
 *     identities: { user: typeof user };
 *     jobs: typeof jobs;
 * }
 * ```
 */
export interface KizunaConfigShape {
    adapter?: unknown;
    tags?: unknown;
    identities?: unknown;
    requestContext?: unknown;
    guardSchema?: unknown;
    issueCodes?: string;
    jobs?: unknown;
    tools?: unknown;
}

/**
 * One job, as a handler reaches it.
 */
export interface JobFnOf<Definition extends AuthoredJobDefinition> {
    /**
     * Run the job now and resolve to what its handler returned.
     */
    run: Definition extends { input: z.ZodType }
        ? (input: z.input<Definition['input']>) => Promise<JobHandlerReturn<Definition>>
        : () => Promise<JobHandlerReturn<Definition>>;
    /**
     * Put the job in line and answer without waiting for it.
     */
    queue: Definition extends { input: z.ZodType }
        ? (message: { input: z.input<Definition['input']> } & JobQueueOptions) => Promise<void>
        : (message?: JobQueueOptions) => Promise<void>;
}

/**
 * A tree of jobs, as a handler reaches them.
 */
export type JobsOfTree<Tree> = {
    [Key in keyof Tree]: Tree[Key] extends { definition: infer Definition extends AuthoredJobDefinition }
        ? JobFnOf<Definition>
        : JobsOfTree<Tree[Key]>;
};

/**
 * A tree of tools, as a handler reaches them.
 */
export type ToolsOfTree<Tree> = {
    [Key in keyof Tree]: Tree[Key] extends { definition: infer Definition extends ToolDefinition }
        ? (input: Definition extends { input: z.ZodType } ? z.input<Definition['input']> : void) => Promise<ToolHandlerReturn<Definition>>
        : ToolsOfTree<Tree[Key]>;
};

export type ConfiguredTags<Config> = Config extends { tags: TagSet<infer Tags extends Record<string, TagOptions>> }
    ? Tags
    : Record<string, never>;
export type ConfiguredCodes<Config> = Config extends { issueCodes: infer Codes extends string } ? Codes : never;
export type ConfiguredIdentities<Config> = Config extends { identities: infer Identities extends Record<string, SecurityScheme> }
    ? Identities
    : Record<string, never>;
export type ConfiguredRequestContextSchemas<Config> = Config extends {
    requestContext: infer Declarations extends Record<string, RequestContextSchema>;
}
    ? Declarations
    : Record<string, never>;
export type ConfiguredGuardSchema<Config> = Config extends { guardSchema: infer Schema extends z.ZodType } ? Schema : undefined;
export type ConfiguredAdapterValue<Config> = Config extends { adapter: infer Adapter extends AnyAdapter } ? Adapter : undefined;

export type ConfiguredJobs<Config> = Config extends { jobs: infer Tree } ? { jobs: JobsOfTree<Tree> } : {};
export type ConfiguredTools<Config> = Config extends { tools: infer Tree } ? { tools: ToolsOfTree<Tree> } : {};
export type ConfiguredAdapterContext<Config> = HandlerContextOf<ConfiguredAdapterValue<Config>>;
export type ConfiguredRequestContext<Config> = RequestContextValues<ConfiguredRequestContextSchemas<Config>>;
