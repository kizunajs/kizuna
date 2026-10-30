import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

/**
 * The one database every site's app reads, served on port 5497 by
 * `scripts/database.ts`. Set `DATABASE_URL` to use any other Postgres. Kept
 * on `globalThis` so Next's reloads reuse one pool.
 *
 * PGlite answers one query at a time, so the pool holds one connection and
 * queues the rest. postgres.js would also listen on a second connection, and
 * the database server cannot keep a `LISTEN` apart from the queries beside
 * it, so the client the CMS sees cannot listen.
 */
const open = () => {
    const client = postgres(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5497/postgres', {
        max: 1,
        prepare: false,
        onnotice: () => undefined,
    });
    Reflect.deleteProperty(client, 'listen');
    return drizzle(client);
};

const shared = globalThis as {
    kizunaSitesDemoDb?: ReturnType<typeof open>;
};

export const db = (shared.kizunaSitesDemoDb ??= open());
