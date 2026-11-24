import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { cmsMerges } from './schema.js';
import type { CmsDatabase } from './store.js';

/**
 * Pages and items merged into one document, waiting for it to publish.
 */
export interface MergeRow {
    id: string;
    /**
     * The document they merged into, by ref.
     */
    ref: string;
    /**
     * The refs of the pages and items merged into it.
     */
    merged: string[];
    createdBy: string;
    createdAt: Date;
}

const toRow = (row: typeof cmsMerges.$inferSelect): MergeRow => ({
    id: row.id,
    ref: row.ref,
    merged: Array.isArray(row.merged) ? (row.merged as unknown[]).filter((each): each is string => typeof each === 'string') : [],
    createdBy: row.createdBy,
    createdAt: row.createdAt,
});

/**
 * The merges waiting for their document to publish, in their own table.
 */
export class MergeStore {
    constructor(private readonly db: CmsDatabase) {}

    /**
     * The merge waiting for `ref` to publish, or `undefined`.
     */
    async pending(ref: string): Promise<MergeRow | undefined> {
        const [row] = await this.db
            .select()
            .from(cmsMerges)
            .where(and(eq(cmsMerges.ref, ref), eq(cmsMerges.status, 'pending')))
            .limit(1);
        return row === undefined ? undefined : toRow(row);
    }

    /**
     * Every merge waiting for its document to publish.
     */
    async allPending(): Promise<MergeRow[]> {
        const rows = await this.db.select().from(cmsMerges).where(eq(cmsMerges.status, 'pending'));
        return rows.map(toRow);
    }

    /**
     * Records that `merged` wait for `ref` to publish, beside what waits for
     * it already.
     */
    async record(ref: string, merged: readonly string[], by: string): Promise<MergeRow> {
        const known = await this.pending(ref);
        if (known !== undefined) {
            const all = [...new Set([...known.merged, ...merged])];
            await this.db
                .update(cmsMerges)
                .set({
                    merged: all,
                })
                .where(eq(cmsMerges.id, known.id));
            return {
                ...known,
                merged: all,
            };
        }
        const [row] = await this.db
            .insert(cmsMerges)
            .values({
                id: randomUUID(),
                ref,
                merged: [...new Set(merged)],
                status: 'pending',
                createdBy: by,
                createdAt: new Date(),
            })
            .returning();
        return toRow(row!);
    }

    /**
     * Marks a merge done, once its document published.
     */
    async finish(id: string): Promise<void> {
        await this.db
            .update(cmsMerges)
            .set({
                status: 'done',
                doneAt: new Date(),
            })
            .where(eq(cmsMerges.id, id));
    }
}
