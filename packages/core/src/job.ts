import type { AuthoredJobDefinition, JobHandlerArgs, JobHandlerReturn, JobVoidReturn } from './jobs.js';
import { DECLARATION, HANDLER } from './types.js';

/**
 * A job's handler, typed against the job it answers.
 */
export type JobHandlerFor<Definition extends AuthoredJobDefinition> = (
    args: JobHandlerArgs<Definition>
) => Promise<JobHandlerReturn<Definition> | JobVoidReturn<Definition>> | JobHandlerReturn<Definition> | JobVoidReturn<Definition>;

/**
 * A job and the handler that runs it.
 */
export type JobWithHandler<Definition extends AuthoredJobDefinition> = Definition & {
    readonly [HANDLER]: (args: never) => unknown;
};

/**
 * What `k.job` returns: the job itself, and the `handler` that runs it. A job
 * nothing runs, one a generator reads, needs no handler.
 */
export type JobBuilder<Definition extends AuthoredJobDefinition> = Definition & JobHandlerStep<Definition>;

interface JobHandlerStep<Definition extends AuthoredJobDefinition> {
    /**
     * The handler that runs this job. `input` is typed from the job's schema,
     * and the return is checked against its `result`.
     */
    handler(fn: JobHandlerFor<Definition>): JobWithHandler<Definition>;
}

export const createJob = <const Definition extends AuthoredJobDefinition>(definition: Definition): JobBuilder<Definition> =>
    ({
        ...definition,
        handler: (fn: unknown) => ({
            ...definition,
            [HANDLER]: fn,
            [DECLARATION]: 'job' as const,
        }),
    }) as unknown as JobBuilder<Definition>;
