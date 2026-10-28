import { sql } from 'drizzle-orm';
import type { CmsDatabase } from './storage/store.js';

/**
 * A draft was saved.
 */
export interface DraftNotice {
    /**
     * The document, as `formatRef` writes it.
     */
    ref: string;
    /**
     * The field paths the save changed, or `null` when it may have changed
     * any of them, as a rollback does.
     */
    paths: string[] | null;
}

type Listener = (notice: DraftNotice) => void;

/**
 * The Postgres channel notices travel on.
 */
export const DRAFT_CHANNEL = 'kizuna_cms_drafts';

/**
 * Postgres refuses a payload of 8000 bytes or more. A notice past this sends
 * no paths, which the preview treats as a change to anything.
 */
const MAX_PAYLOAD = 7000;

/**
 * How long a listening connection that failed waits before it tries again.
 */
const RETRY_MS = 5000;

/**
 * The driver under Drizzle, as far as listening goes: postgres.js and PGlite
 * take a callback per channel, node-postgres emits `notification` from a
 * connection of its own.
 */
interface ChannelClient {
    listen: (channel: string, callback: (payload: string) => void) => Promise<unknown>;
}

interface NodePostgresConnection {
    query: (text: string) => Promise<unknown>;
    on: (event: string, handler: (value: never) => void) => unknown;
    removeListener: (event: string, handler: (value: never) => void) => unknown;
    release?: (error?: Error) => void;
}

interface NodePostgresPool {
    connect: () => Promise<NodePostgresConnection>;
    totalCount: number;
}

type Listening = (deliver: (payload: string) => void, dropped: () => void) => Promise<() => void>;

const listeningFor = (client: unknown): Listening | undefined => {
    if (typeof client !== 'object' && typeof client !== 'function') return undefined;
    if (client === null) return undefined;
    const candidate = client as Partial<ChannelClient & NodePostgresPool & NodePostgresConnection>;
    if (typeof candidate.listen === 'function') {
        const channels = candidate as ChannelClient;
        return async (deliver) => {
            const stop = await channels.listen(DRAFT_CHANNEL, deliver);
            return () => {
                const stopped =
                    typeof stop === 'function'
                        ? (stop as () => Promise<void>)()
                        : (stop as { unlisten?: () => Promise<void> } | undefined)?.unlisten?.();
                // The database may already be closed, which leaves nothing to stop.
                void Promise.resolve(stopped).catch(() => undefined);
            };
        };
    }
    if (typeof candidate.query !== 'function' || typeof candidate.on !== 'function') return undefined;
    const pool = typeof candidate.connect === 'function' && typeof candidate.totalCount === 'number';
    return async (deliver, dropped) => {
        // A pool hands each query to any connection, so listening holds one of its own.
        const connection = pool ? await (candidate as NodePostgresPool).connect() : (candidate as NodePostgresConnection);
        const onNotification = (message: { channel: string; payload?: string }): void => {
            if (message.channel === DRAFT_CHANNEL && message.payload !== undefined) deliver(message.payload);
        };
        const onError = (error: Error): void => {
            forget();
            if (pool) connection.release?.(error);
            dropped();
        };
        const forget = (): void => {
            connection.removeListener('notification', onNotification as (value: never) => void);
            connection.removeListener('error', onError as (value: never) => void);
        };
        connection.on('notification', onNotification as (value: never) => void);
        connection.on('error', onError as (value: never) => void);
        try {
            await connection.query(`LISTEN ${DRAFT_CHANNEL}`);
        } catch (error) {
            forget();
            if (pool) connection.release?.(error as Error);
            throw error;
        }
        return () => {
            forget();
            void connection
                .query(`UNLISTEN ${DRAFT_CHANNEL}`)
                .catch(() => undefined)
                .finally(() => {
                    if (pool) connection.release?.();
                });
        };
    };
};

const parseNotice = (payload: string): DraftNotice | undefined => {
    try {
        const parsed = JSON.parse(payload) as Partial<DraftNotice>;
        if (typeof parsed.ref !== 'string') return undefined;
        return {
            ref: parsed.ref,
            paths: Array.isArray(parsed.paths) ? parsed.paths.filter((path): path is string => typeof path === 'string') : null,
        };
    } catch {
        return undefined;
    }
};

/**
 * Tells every server instance when a draft is saved, through Postgres
 * `LISTEN` and `NOTIFY` on the CMS's own database. A driver that cannot
 * listen, like Neon over HTTP, hears only the saves of its own process.
 */
export class DraftNotices {
    private readonly listeners = new Set<Listener>();
    private readonly listening: Listening | undefined;
    private started: Promise<(() => void) | undefined> | undefined;
    private heard = false;
    private warned = false;

    constructor(
        private readonly db: CmsDatabase,
        client: unknown = (db as { $client?: unknown }).$client
    ) {
        this.listening = listeningFor(client);
    }

    /**
     * Whether notices reach other server instances.
     */
    get shared(): boolean {
        return this.listening !== undefined;
    }

    /**
     * Sends a notice to every subscriber, in this process and the others. A
     * notice that cannot be sent never fails the save that made it.
     */
    async publish(notice: DraftNotice): Promise<void> {
        if (this.listening !== undefined) {
            let payload = JSON.stringify(notice);
            if (payload.length > MAX_PAYLOAD) {
                payload = JSON.stringify({
                    ref: notice.ref,
                    paths: null,
                } satisfies DraftNotice);
            }
            try {
                await this.db.execute(sql`select pg_notify(${DRAFT_CHANNEL}, ${payload})`);
            } catch (error) {
                this.warn(error);
            }
        }
        // Subscribers here hear it back from Postgres while this process listens.
        if (!this.heard) this.deliver(notice);
    }

    /**
     * Calls `listener` with every notice until the returned function is
     * called. Resolves once notices reach it.
     */
    async subscribe(listener: Listener): Promise<() => void> {
        this.listeners.add(listener);
        await this.start();
        return () => {
            this.listeners.delete(listener);
            if (this.listeners.size === 0) this.halt();
        };
    }

    private deliver(notice: DraftNotice): void {
        for (const listener of this.listeners) listener(notice);
    }

    private async start(): Promise<void> {
        if (this.listening === undefined) return;
        const started = (this.started ??= this.listening(
            (payload) => {
                const notice = parseNotice(payload);
                if (notice !== undefined) this.deliver(notice);
            },
            () => this.retry(started)
        ).then(
            (stop) => {
                if (this.started === started) this.heard = true;
                return stop;
            },
            (error: unknown) => {
                this.warn(error);
                this.retry(started);
                return undefined;
            }
        ));
        await started;
    }

    private halt(): void {
        const started = this.started;
        this.started = undefined;
        this.heard = false;
        void started?.then((stop) => stop?.());
    }

    /**
     * Listens again after a connection dropped or never opened, while anyone
     * still subscribes.
     */
    private retry(failed: Promise<unknown>): void {
        if (this.started !== failed) return;
        this.started = undefined;
        this.heard = false;
        setTimeout(() => {
            if (this.listeners.size > 0 && this.started === undefined) void this.start();
        }, RETRY_MS).unref?.();
    }

    private warn(error: unknown): void {
        if (this.warned) return;
        this.warned = true;
        console.warn(
            `The CMS cannot pass draft changes between server instances, so the draft preview updates only for saves in this process: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}
