import { defineJobTransport, JobInputError, ResponseError, type JobTransport, type JobWorker, type JobWorkerContext } from 'kizunajs';
import { queueName, queuesFor } from './queue-name.js';
import * as sql from './sql.js';

/**
 * Anything that runs one parameterised statement, which a node-postgres `Pool`
 * does as it is.
 */
export interface PgmqPool {
    query: (
        text: string,
        values?: unknown[]
    ) => Promise<{
        rows: unknown[];
    }>;
}

export interface PgmqOptions {
    /**
     * The connection to a Postgres database with the pgmq extension, such as a
     * node-postgres `Pool`.
     */
    pool: PgmqPool;
    /**
     * Put before every queue name, so `billing.reconcileInvoices` reads from
     * `kizuna_billing_reconcile_invoices`.
     *
     * @default 'kizuna_'
     */
    prefix?: string;
    /**
     * How long a message stays hidden from other workers once read. A job
     * still running past it is read again and runs twice.
     *
     * @default 60_000
     */
    visibilityTimeoutMs?: number;
    /**
     * How long the worker waits after a read that found nothing.
     *
     * @default 1_000
     */
    pollIntervalMs?: number;
    /**
     * The most messages one read takes from each queue. A read's messages run
     * at the same time.
     *
     * @default 10
     */
    batchSize?: number;
    /**
     * Where a failed read or settle is reported. The worker keeps polling.
     *
     * @default console
     */
    logger?: Pick<Console, 'error'>;
}

interface StoredMessage {
    job: string;
    input?: unknown;
    retry?: number;
}

interface ReadRow {
    queue_name: string;
    msg_id: string | number;
    read_ct: number;
    message: StoredMessage | string;
}

const FIRST_RETRY_SECONDS = 10;
const LONGEST_RETRY_SECONDS = 600;

/**
 * Before pgmq 1.6, two sessions creating one queue at once can race. Postgres
 * reports the loser as a unique violation or a duplicate table, and either way
 * the queue exists.
 */
const isAlreadyCreated = (error: unknown): boolean => {
    const code = (error as { code?: unknown } | undefined)?.code;
    return code === '23505' || code === '42P07';
};

/**
 * A `422`, or input the job's schema refuses, fails the same way every time.
 */
const isPermanent = (error: unknown): boolean => error instanceof JobInputError || (error instanceof ResponseError && error.status === 422);

/**
 * 10s, 20s, 40s, and so on, never more than 10 minutes.
 */
const retryDelaySeconds = (attempt: number): number => Math.min(FIRST_RETRY_SECONDS * 2 ** (attempt - 1), LONGEST_RETRY_SECONDS);

const toSeconds = (milliseconds: number): number => Math.ceil(milliseconds / 1000);

/**
 * A job transport backed by pgmq. Each job gets its own queue, created the
 * first time it is used, and `startJobWorker` drains them. pgmq has no
 * deduplication, so a `dedupeKey` is not honoured.
 *
 * @example
 * const pool = new pg.Pool({
 *     connectionString: process.env.DATABASE_URL,
 * });
 *
 * export default defineConfig({
 *     adapter: expressAdapter(),
 *     routes,
 *     jobs,
 *     jobRunner: {
 *         mode: 'in-process',
 *         transport: pgmq({
 *             pool,
 *         }),
 *     },
 * });
 */
export const pgmq = (options: PgmqOptions): JobTransport => {
    const { pool } = options;
    const prefix = options.prefix ?? 'kizuna_';
    const visibilitySeconds = toSeconds(options.visibilityTimeoutMs ?? 60_000);
    const pollIntervalMs = options.pollIntervalMs ?? 1_000;
    const batchSize = options.batchSize ?? 10;
    const logger = options.logger ?? console;

    const created = new Map<string, Promise<void>>();

    /**
     * Create a queue once per process. A failure is forgotten, so the next call
     * tries again.
     */
    const ensureQueue = (queue: string): Promise<void> => {
        const existing = created.get(queue);
        if (existing) return existing;
        const pending = pool
            .query(sql.createQueue, [queue])
            .then(() => {})
            .catch((error: unknown) => {
                if (isAlreadyCreated(error)) return;
                created.delete(queue);
                throw error;
            });
        created.set(queue, pending);
        return pending;
    };

    const start = async ({ jobs, run }: JobWorkerContext): Promise<JobWorker> => {
        const jobByQueue = queuesFor(
            prefix,
            jobs.map((descriptor) => descriptor.job)
        );
        const queues = [...jobByQueue.keys()];
        await Promise.all(queues.map(ensureQueue));

        const settle = async (row: ReadRow): Promise<void> => {
            const stored: StoredMessage = typeof row.message === 'string' ? JSON.parse(row.message) : row.message;
            const attempts = stored.retry ?? 1;
            // A worker that stopped mid-run still spent the attempt.
            if (row.read_ct > attempts) {
                await pool.query(sql.archive, [row.queue_name, row.msg_id]);
                return;
            }
            try {
                await run({
                    job: jobByQueue.get(row.queue_name) as string,
                    input: stored.input,
                });
            } catch (error) {
                if (isPermanent(error) || row.read_ct >= attempts) {
                    await pool.query(sql.archive, [row.queue_name, row.msg_id]);
                    return;
                }
                await pool.query(sql.retryLater, [row.queue_name, row.msg_id, retryDelaySeconds(row.read_ct)]);
                return;
            }
            await pool.query(sql.remove, [row.queue_name, row.msg_id]);
        };

        let stopped = false;
        let wake: (() => void) | undefined;

        const pause = (): Promise<void> =>
            new Promise((resolve) => {
                const timer = setTimeout(resolve, pollIntervalMs);
                wake = () => {
                    clearTimeout(timer);
                    resolve();
                };
            });

        /**
         * Read once and settle everything read. Resolves to how many messages
         * there were.
         */
        const poll = async (): Promise<number> => {
            const { rows } = await pool.query(sql.read, [queues, visibilitySeconds, batchSize]);
            const settled = await Promise.allSettled((rows as ReadRow[]).map(settle));
            for (const outcome of settled) {
                // The message is still in its queue and is read again once its
                // visibility timeout passes.
                if (outcome.status === 'rejected') logger.error('[kizuna] Settling a pgmq message failed:', outcome.reason);
            }
            return rows.length;
        };

        const loop = async (): Promise<void> => {
            while (!stopped) {
                let read = 0;
                try {
                    read = await poll();
                } catch (error) {
                    logger.error('[kizuna] Reading from pgmq failed:', error);
                }
                if (read === 0 && !stopped) await pause();
            }
        };

        const running = queues.length > 0 ? loop() : Promise.resolve();

        return {
            stop: async () => {
                stopped = true;
                wake?.();
                await running;
            },
        };
    };

    return defineJobTransport({
        name: 'pgmq',
        supports: {
            retry: true,
            runAt: true,
        },
        dispatch: async (message) => {
            const queue = queueName(prefix, message.job);
            const stored: StoredMessage = {
                job: message.job,
                input: message.input,
                retry: message.retry,
            };
            await ensureQueue(queue);
            await pool.query(sql.send, [queue, JSON.stringify(stored), message.runAt?.toISOString() ?? null]);
        },
        start,
    });
};
