import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Kizuna, ResponseError, type JobWorkerContext } from 'kizunajs';
import { JOBS_META } from 'kizunajs/adapter';
import { startJobWorker } from 'kizunajs/jobs';
import { pgmq } from './transport.js';
import * as sql from './sql.js';

interface Statement {
    text: string;
    values: unknown[] | undefined;
}

interface Row {
    queue_name: string;
    msg_id: string;
    read_ct: number;
    message: unknown;
}

/**
 * Records every statement. A read answers with the next batch queued by
 * `deliver`, then with nothing.
 */
const fakePool = () => {
    const statements: Statement[] = [];
    const batches: Row[][] = [];
    let failReads = 0;
    const pool = {
        query: vi.fn(async (text: string, values?: unknown[]) => {
            statements.push({
                text,
                values,
            });
            if (text === sql.read) {
                if (failReads > 0) {
                    failReads -= 1;
                    throw new Error('the connection was reset');
                }
                return {
                    rows: batches.shift() ?? [],
                };
            }
            return {
                rows: [],
            };
        }),
    };
    return {
        pool,
        statements,
        ran: (text: string) => statements.filter((statement) => statement.text === text),
        deliver: (...rows: Row[]) => {
            batches.push(rows);
        },
        failNextRead: () => {
            failReads += 1;
        },
    };
};

const silent = {
    error: vi.fn(),
};

const stored = (job: string, read: number, retry = 1, input: unknown = undefined): Row => ({
    queue_name: `kizuna_${job
        .replace('.', '_')
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()}`,
    msg_id: '1',
    read_ct: read,
    message: {
        job,
        input,
        retry,
    },
});

/**
 * Start the worker and wait for it to settle what was delivered.
 */
const drain = async (
    database: ReturnType<typeof fakePool>,
    run: JobWorkerContext['run'],
    jobs: string[] = ['users.indexUser']
): Promise<void> => {
    const transport = pgmq({
        pool: database.pool,
        pollIntervalMs: 5,
        logger: silent,
    });
    const worker = await transport.start!({
        jobs: jobs.map((job) => ({
            job,
        })),
        run,
    });
    await vi.waitFor(() => {
        expect(database.ran(sql.read).length).toBeGreaterThan(1);
    });
    await worker.stop();
};

describe('dispatch', () => {
    it('sends the job, its input and its attempts to the job’s own queue', async () => {
        const database = fakePool();
        await pgmq({
            pool: database.pool,
        }).dispatch({
            job: 'users.indexUser',
            input: {
                userId: '1',
            },
            retry: 3,
        });

        expect(database.ran(sql.createQueue)[0]?.values).toEqual(['kizuna_users_index_user']);
        expect(database.ran(sql.send)[0]?.values).toEqual([
            'kizuna_users_index_user',
            JSON.stringify({
                job: 'users.indexUser',
                input: {
                    userId: '1',
                },
                retry: 3,
            }),
            null,
        ]);
    });

    it('creates a queue once per process', async () => {
        const database = fakePool();
        const transport = pgmq({
            pool: database.pool,
        });
        await transport.dispatch({
            job: 'cleanup',
            input: undefined,
        });
        await transport.dispatch({
            job: 'cleanup',
            input: undefined,
        });

        expect(database.ran(sql.createQueue)).toHaveLength(1);
        expect(database.ran(sql.send)).toHaveLength(2);
    });

    it('treats a queue another replica created first as created', async () => {
        const database = fakePool();
        database.pool.query.mockRejectedValueOnce(
            Object.assign(new Error('duplicate key value violates unique constraint'), {
                code: '23505',
            })
        );
        await pgmq({
            pool: database.pool,
        }).dispatch({
            job: 'cleanup',
            input: undefined,
        });

        expect(database.ran(sql.send)).toHaveLength(1);
    });

    it('passes runAt for the database to turn into a delay', async () => {
        const database = fakePool();
        await pgmq({
            pool: database.pool,
        }).dispatch({
            job: 'cleanup',
            input: undefined,
            runAt: new Date('2026-11-20T05:00:00.000Z'),
        });

        expect(database.ran(sql.send)[0]?.values?.[2]).toBe('2026-11-20T05:00:00.000Z');
    });

    it('sends a message with a dedupe key like any other, since pgmq has no deduplication', async () => {
        const database = fakePool();
        const transport = pgmq({
            pool: database.pool,
        });
        await transport.dispatch({
            job: 'cleanup',
            input: undefined,
            dedupeKey: 'cleanup@2026-11-20T05:00:00.000Z',
        });

        expect(transport.supports.dedupe).toBeUndefined();
        expect(database.ran(sql.send)).toHaveLength(1);
        expect(database.statements.map((statement) => statement.text)).toEqual([sql.createQueue, sql.send]);
    });

    it('throws on a job whose queue name pgmq would refuse', async () => {
        const database = fakePool();
        await expect(
            pgmq({
                pool: database.pool,
            }).dispatch({
                job: 'billing.reconcileEveryOutstandingInvoiceForTheQuarter',
                input: undefined,
            })
        ).rejects.toMatchObject({
            cause: {
                message: expect.stringContaining('pgmq allows 47'),
            },
        });
        expect(database.statements).toHaveLength(0);
    });
});

describe('start', () => {
    it('deletes a message whose job succeeded', async () => {
        const database = fakePool();
        database.deliver(
            stored('users.indexUser', 1, 1, {
                userId: '1',
            })
        );
        const run = vi.fn(async () => {});
        await drain(database, run);

        expect(run).toHaveBeenCalledWith({
            job: 'users.indexUser',
            input: {
                userId: '1',
            },
        });
        expect(database.ran(sql.remove)[0]?.values).toEqual(['kizuna_users_index_user', '1']);
        expect(database.ran(sql.archive)).toHaveLength(0);
    });

    it('retries a 503 after 10 seconds, doubling each attempt', async () => {
        const database = fakePool();
        database.deliver(stored('users.indexUser', 1, 5));
        database.deliver(stored('users.indexUser', 3, 5));
        const unavailable = new ResponseError({
            status: 503,
            body: {
                detail: 'Search is down',
            },
        });
        await drain(database, async () => {
            throw unavailable;
        });

        expect(database.ran(sql.retryLater).map((statement) => statement.values?.[2])).toEqual([10, 40]);
        expect(database.ran(sql.archive)).toHaveLength(0);
    });

    it('archives a 422 at once, however many attempts are left', async () => {
        const database = fakePool();
        database.deliver(stored('users.indexUser', 1, 5));
        await drain(database, async () => {
            throw new ResponseError({
                status: 422,
                body: {
                    detail: 'No user with id 1',
                },
            });
        });

        expect(database.ran(sql.archive)).toHaveLength(1);
        expect(database.ran(sql.retryLater)).toHaveLength(0);
    });

    it('archives a message whose last attempt failed', async () => {
        const database = fakePool();
        database.deliver(stored('users.indexUser', 3, 3));
        await drain(database, async () => {
            throw new Error('the disk is full');
        });

        expect(database.ran(sql.archive)).toHaveLength(1);
        expect(database.ran(sql.retryLater)).toHaveLength(0);
    });

    it('archives without running a message read more times than it has attempts', async () => {
        const database = fakePool();
        database.deliver(stored('users.indexUser', 2, 1));
        const run = vi.fn(async () => {});
        await drain(database, run);

        expect(run).not.toHaveBeenCalled();
        expect(database.ran(sql.archive)).toHaveLength(1);
    });

    it('reads every subscribed queue in one statement', async () => {
        const database = fakePool();
        await drain(database, async () => {}, ['cleanup', 'users.indexUser']);

        expect(database.ran(sql.read)[0]?.values).toEqual([['kizuna_cleanup', 'kizuna_users_index_user'], 60, 10]);
    });

    it('keeps polling after a failed read', async () => {
        const database = fakePool();
        database.failNextRead();
        await drain(database, async () => {});

        expect(silent.error).toHaveBeenCalledWith('[kizuna] Reading from pgmq failed:', expect.any(Error));
    });

    it('waits for a running job before stop resolves', async () => {
        const database = fakePool();
        database.deliver(stored('users.indexUser', 1));
        let finish: () => void = () => {};
        const transport = pgmq({
            pool: database.pool,
            pollIntervalMs: 5,
            logger: silent,
        });
        const worker = await transport.start!({
            jobs: [
                {
                    job: 'users.indexUser',
                },
            ],
            run: () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        });
        await vi.waitFor(() => {
            expect(database.ran(sql.read)).toHaveLength(1);
        });

        let stopped = false;
        const stopping = Promise.resolve(worker.stop()).then(() => {
            stopped = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(stopped).toBe(false);

        finish();
        await stopping;
        expect(database.ran(sql.remove)).toHaveLength(1);
    });

    it('throws when two jobs share one queue name', async () => {
        await expect(
            pgmq({
                pool: fakePool().pool,
            }).start!({
                jobs: [
                    {
                        job: 'users.indexUser',
                    },
                    {
                        job: 'users_index.user',
                    },
                ],
                run: async () => {},
            })
        ).rejects.toThrow('both become the pgmq queue "kizuna_users_index_user"');
    });
});

describe('with startJobWorker', () => {
    const k = new Kizuna<{}>();
    const jobs = k.jobs({
        indexUser: {
            retry: 3,
            input: z.object({
                userId: z.string(),
            }),
        },
    });

    it('retries a job that returns a 503 rather than throwing one', async () => {
        const database = fakePool();
        database.deliver(
            stored('indexUser', 1, 3, {
                userId: '1',
            })
        );
        const transport = pgmq({
            pool: database.pool,
            pollIntervalMs: 5,
            logger: silent,
        });
        const worker = await startJobWorker(
            {
                [JOBS_META]: {
                    jobs,
                    handlers: {
                        indexUser: async () => ({
                            status: 503,
                            body: {
                                detail: 'Search is down',
                            },
                        }),
                    },
                    transport,
                },
            },
            {
                logger: {
                    log: () => {},
                    warn: () => {},
                    error: () => {},
                },
            }
        );
        await vi.waitFor(() => {
            expect(database.ran(sql.retryLater)).toHaveLength(1);
        });
        await worker?.stop();
    });

    it('archives a message whose input no longer fits the job’s schema', async () => {
        const database = fakePool();
        database.deliver(
            stored('indexUser', 1, 3, {
                userIdentifier: 'renamed since this was queued',
            })
        );
        const transport = pgmq({
            pool: database.pool,
            pollIntervalMs: 5,
            logger: silent,
        });
        const worker = await startJobWorker(
            {
                [JOBS_META]: {
                    jobs,
                    handlers: {
                        indexUser: async () => {},
                    },
                    transport,
                },
            },
            {
                logger: {
                    log: () => {},
                    warn: () => {},
                    error: () => {},
                },
            }
        );
        await vi.waitFor(() => {
            expect(database.ran(sql.archive)).toHaveLength(1);
        });
        await worker?.stop();
    });
});
