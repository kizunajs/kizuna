import type { AuthoredJobDefinition, JobHandlerArgs, JobHandlerReturn, JobVoidReturn } from './jobs.js';
import { DECLARATION } from './types.js';

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
    handler: JobHandlerFor<Definition>;
};

/**
 * What `k.job` returns: the job, waiting for its handler.
 */
export interface JobBuilder<Definition extends AuthoredJobDefinition> {
    /**
     * The handler that runs this job. `input` is typed from the job's schema,
     * and the return is checked against its `result`.
     */
    handler(fn: JobHandlerFor<Definition>): JobWithHandler<Definition>;
}

export const createJob = <const Definition extends AuthoredJobDefinition>(definition: Definition): JobBuilder<Definition> => ({
    handler: (fn) => ({
        ...definition,
        handler: fn,
        [DECLARATION]: 'job' as const,
    }),
});
