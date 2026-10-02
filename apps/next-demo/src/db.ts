import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

/**
 * The demo's database. `pnpm dev` serves a PGlite file on port 5499; set
 * `DATABASE_URL` to use any other Postgres. Kept on `globalThis` so Next's
 * reloads reuse one pool. PGlite answers one query at a time, and its socket
 * server mixes up the replies of connections that send at once, so the pool
 * holds one connection and queues the rest.
 */
const open = () =>
    drizzle(
        postgres(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5499/postgres', {
            max: 1,
            prepare: false,
            onnotice: () => undefined,
        })
    );

const shared = globalThis as {
    kizunaDemoDb?: ReturnType<typeof open>;
};

export const db = (shared.kizunaDemoDb ??= open());
