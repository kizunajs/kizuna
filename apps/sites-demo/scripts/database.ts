import { spawn } from 'node:child_process';
import { createServer, type Socket } from 'node:net';
import { parseArgs } from 'node:util';
import { PGlite } from '@electric-sql/pglite';

/**
 * Serves one PGlite database to every process of the demo, as Postgres on a
 * local port, and runs `--run` once it listens.
 *
 * PGlite is a single Postgres session, so every connection shares its unnamed
 * statement and portal. A client sends a query as several messages, Parse,
 * Bind, Execute and Sync, and the stock `pglite-server` runs each message on
 * its own, so a second process's Parse can land between the first one's Parse
 * and Bind. This server lets one connection at a time hold the database, from
 * its first message until its Sync, and for the whole of an open transaction.
 *
 * pnpm exec tsx scripts/database.ts --db=.pglite --port=5497 --run "pnpm dev:apps"
 */
const { values } = parseArgs({
    options: {
        db: {
            type: 'string',
            default: '.pglite',
        },
        port: {
            type: 'string',
            default: '5497',
        },
        run: {
            type: 'string',
        },
    },
});

const SSL_REQUEST = 80877103;
const CANCEL_REQUEST = 80877102;

const db = await PGlite.create(values.db);

let holder: Socket | undefined;
const waiting: Array<{ socket: Socket; resolve: () => void }> = [];

const acquire = (socket: Socket): Promise<void> =>
    new Promise((resolve) => {
        if (holder === undefined || holder === socket) {
            holder = socket;
            resolve();
            return;
        }
        waiting.push({
            socket,
            resolve,
        });
    });

const release = (socket: Socket): void => {
    if (holder !== socket) return;
    holder = undefined;
    const next = waiting.shift();
    if (next === undefined) return;
    holder = next.socket;
    next.resolve();
};

/**
 * Runs one batch of a connection's messages while it holds the database. A
 * batch that ends in Flush waits for more of the same query, so the
 * connection keeps the database until its Sync.
 */
const run = async (socket: Socket, messages: Buffer[], keepAfter: boolean): Promise<void> => {
    await acquire(socket);
    for (const message of messages) {
        await db.execProtocolRawStream(new Uint8Array(message), {
            onRawData: (data) => {
                if (socket.writable) socket.write(Buffer.from(data));
            },
        });
    }
    if (!keepAfter && !db.isInTransaction()) release(socket);
};

const server = createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let started = false;
    let batch: Buffer[] = [];
    let queue = Promise.resolve();
    const enqueue = (messages: Buffer[], keepAfter: boolean): void => {
        queue = queue
            .then(() => run(socket, messages, keepAfter))
            .catch(() => {
                socket.destroy();
            });
    };

    socket.setNoDelay(true);
    socket.on('data', (data) => {
        buffer = Buffer.concat([buffer, data]);
        while (true) {
            if (!started) {
                if (buffer.length < 8) return;
                const length = buffer.readInt32BE(0);
                const code = buffer.readInt32BE(4);
                if (code === SSL_REQUEST) {
                    socket.write('N');
                    buffer = buffer.subarray(8);
                    continue;
                }
                if (code === CANCEL_REQUEST) {
                    socket.destroy();
                    return;
                }
                if (buffer.length < length) return;
                started = true;
                enqueue([buffer.subarray(0, length)], false);
                buffer = buffer.subarray(length);
                continue;
            }
            if (buffer.length < 5) return;
            const length = 1 + buffer.readInt32BE(1);
            if (buffer.length < length) return;
            const message = buffer.subarray(0, length);
            buffer = buffer.subarray(length);
            const type = String.fromCharCode(message[0]!);
            if (type === 'X') {
                socket.end();
                return;
            }
            batch.push(message);
            if (type === 'S' || type === 'Q' || type === 'H') {
                enqueue(batch, type === 'H');
                batch = [];
            }
        }
    });
    socket.on('close', () => {
        queue = queue.then(async () => {
            if (holder === socket && db.isInTransaction()) await db.exec('rollback');
            release(socket);
        });
    });
    socket.on('error', () => undefined);
});

server.listen(Number(values.port), '127.0.0.1', () => {
    console.log(`[database] ${values.db} on 127.0.0.1:${values.port}`);
    if (values.run === undefined) return;
    const child = spawn(values.run, {
        shell: true,
        stdio: 'inherit',
    });
    const stop = (): void => {
        child.kill('SIGTERM');
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    child.on('exit', async (code) => {
        server.close();
        await db.close();
        process.exit(code ?? 0);
    });
});
