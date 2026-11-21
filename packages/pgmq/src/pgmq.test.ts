import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ResponseError, type JobWorker, type JobWorkerContext } from 'kizunajs';
import { pgmqTransport } from './transport.js';

/**
 * pgmq installs from one SQL file, so each version runs in PGlite with no
 * server. 1.5.1 is the oldest this transport supports.
 */
const VERSIONS = ['v1.5.1', 'v1.13.1'];

const QUEUE = 'kizuna_users_index_user';

const silent = {
    error: vi.fn(),
};

describe.each(VERSIONS)('pgmq %s', (version) => {
    let database: PGlite;
    let worker: JobWorker | undefined;

    beforeAll(async () => {
        database = new PGlite();
        await database.exec(await readFile(new URL(`../fixtures/pgmq/pgmq-${version}.sql`, import.meta.url), 'utf8'));
    });

    afterAll(async () => {
        await database.close();
    });

    afterEach(async () => {
        await worker?.stop();
        worker = undefined;
        await database.query('select pgmq.drop_queue(queue_name) from pgmq.meta');
    });

    const transport = () =>
        pgmqTransport({
            pool: database,
            pollIntervalMs: 5,
            logger: silent,
        });

    const queued = async () =>
        (
            await database.query<{
                read_ct: number;
                message: unknown;
                delay_seconds: number;
            }>(`select read_ct, message, extract(epoch from (vt - now()))::int as delay_seconds from pgmq.q_${QUEUE}`)
        ).rows;

    const archived = async () => (await database.query(`select msg_id from pgmq.a_${QUEUE}`)).rows;

    const queue = (retry = 1) =>
        transport().dispatch({
            job: 'users.indexUser',
            input: {
                userId: '1',
            },
            retry,
        });

    const drain = async (run: JobWorkerContext['run']) => {
        worker = await transport().start!({
            jobs: [
                {
                    job: 'users.indexUser',
                },
            ],
            run,
        });
    };

    it('creates the job’s queue and sends the job, its input and its attempts', async () => {
        await queue(3);

        expect((await database.query(`select queue_name from pgmq.meta`)).rows).toEqual([
            {
                queue_name: QUEUE,
            },
        ]);
        expect(await queued()).toMatchObject([
            {
                read_ct: 0,
                message: {
                    job: 'users.indexUser',
                    input: {
                        userId: '1',
                    },
                    retry: 3,
                },
            },
        ]);
    });

    it('sends to a queue another process already created', async () => {
        await queue();
        await queue();

        expect(await queued()).toHaveLength(2);
    });

    it('holds a message with runAt until it is due', async () => {
        await transport().dispatch({
            job: 'users.indexUser',
            input: undefined,
            runAt: new Date(Date.now() + 3_600_000),
        });

        const [message] = await queued();
        expect(message?.delay_seconds).toBeGreaterThan(3_500);
    });

    it('deletes a message whose job succeeded', async () => {
        await queue();
        const run = vi.fn(async () => {});
        await drain(run);

        await vi.waitFor(async () => {
            expect(await queued()).toHaveLength(0);
        });
        expect(run).toHaveBeenCalledWith({
            job: 'users.indexUser',
            input: {
                userId: '1',
            },
        });
        expect(await archived()).toHaveLength(0);
    });

    it('hides a message for 10 seconds after a failed attempt', async () => {
        await queue(3);
        await drain(async () => {
            throw new ResponseError({
                status: 503,
                body: {
                    detail: 'Search is down',
                },
            });
        });

        await vi.waitFor(async () => {
            const [message] = await queued();
            expect(message?.read_ct).toBe(1);
            expect(message?.delay_seconds).toBeGreaterThan(5);
        });
        expect(await archived()).toHaveLength(0);
    });

    it('archives a 422 with attempts left', async () => {
        await queue(3);
        await drain(async () => {
            throw new ResponseError({
                status: 422,
                body: {
                    detail: 'No user with id 1',
                },
            });
        });

        await vi.waitFor(async () => {
            expect(await archived()).toHaveLength(1);
        });
        expect(await queued()).toHaveLength(0);
    });

    it('archives a message whose last attempt failed', async () => {
        await queue(1);
        await drain(async () => {
            throw new Error('the disk is full');
        });

        await vi.waitFor(async () => {
            expect(await archived()).toHaveLength(1);
        });
        expect(await queued()).toHaveLength(0);
    });
});
