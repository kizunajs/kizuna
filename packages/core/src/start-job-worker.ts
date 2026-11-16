import {
    boundJobKeys,
    flattenJobs,
    jobFnAt,
    jobRunnerFrom,
    JOBS_META,
    type JobDescriptor,
    type JobsMeta,
    type JobWorker,
} from './adapter.js';
import { ResponseError } from './response-error.js';

export interface StartJobWorkerOptions {
    /**
     * Drain only these jobs, by dotted key.
     */
    only?: readonly string[];
    /**
     * Never drain these.
     */
    exclude?: readonly string[];
    /**
     * Where progress goes.
     *
     * @default console
     */
    logger?: Pick<Console, 'log' | 'warn' | 'error'>;
}

/**
 * Drain a transport that stores queued work rather than running it itself.
 *
 * Returns `undefined` when the transport does not implement `start`.
 *
 * Each message's input is validated against the schema it lands on.
 *
 * A handler that throws, or returns a status of 400 or more, rejects. A
 * returned status rejects as a `ResponseError`, so a transport can tell a `422`
 * from a `503`.
 *
 * @example
 * const worker = await startJobWorker(api);
 * process.on('SIGTERM', () => void worker?.stop());
 */
export const startJobWorker = async (api: unknown, options?: StartJobWorkerOptions): Promise<JobWorker | undefined> => {
    const logger = options?.logger ?? console;
    const meta = (api as { [JOBS_META]?: JobsMeta })[JOBS_META];
    if (!meta) return undefined;

    const transport = meta.transport;
    if (!transport?.start) return undefined;

    const runner = jobRunnerFrom(meta);
    if (!runner) return undefined;

    // Subscribing to a job with no handler would take messages off the queue
    // that nothing can run.
    const bound = boundJobKeys(meta);

    const jobs: JobDescriptor[] = [];
    for (const { jobKey } of flattenJobs(meta.jobs)) {
        if (options?.only && !options.only.includes(jobKey)) continue;
        if (options?.exclude?.includes(jobKey)) continue;
        if (!bound.has(jobKey)) {
            logger.warn(`[kizuna] No handler was bound for job "${jobKey}", so the worker does not subscribe to it.`);
            continue;
        }
        jobs.push({
            job: jobKey,
        });
    }

    logger.log(`[kizuna] Draining ${jobs.length} job(s) from the "${transport.name}" transport.`);

    return transport.start({
        jobs,
        run: async (message) => {
            const jobFn = jobFnAt(runner, message.job);
            if (!jobFn) throw new Error(`No handler is bound for job "${message.job}" on this api.`);
            const response = (await jobFn.run(message.input)) as {
                status: number;
                body: unknown;
            };
            // A returned 503 asks for a retry as plainly as a thrown one does.
            if (response.status >= 400) throw new ResponseError(response);
        },
    });
};
