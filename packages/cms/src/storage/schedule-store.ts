import { randomUUID } from 'node:crypto';
import { actingAgent } from '../agents.js';
import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm';
import { cmsReleases, cmsSchedules } from './schema.js';
import type { CmsDatabase } from './store.js';

export type ScheduleAction = 'publish' | 'unpublish';

export type ScheduleStatus = 'scheduled' | 'running' | 'done' | 'cancelled';

export type ReleaseStatus = 'open' | 'running' | 'published';

export interface ScheduleRow {
    id: string;
    ref: string;
    documentId: string;
    action: ScheduleAction;
    at: Date | null;
    releaseId: string | null;
    force: boolean;
    status: ScheduleStatus;
    createdBy: string;
    createdAt: Date;
    ranAt: Date | null;
    ranVersion: number | null;
}

export interface ReleaseRow {
    id: string;
    name: string;
    at: Date | null;
    status: ReleaseStatus;
    force: boolean;
    createdBy: string;
    /**
     * The agent that made it for `createdBy`, like `Claude`, or `null`.
     */
    createdVia: string | null;
    createdAt: Date;
    scheduledBy: string | null;
    publishedAt: Date | null;
    publishedBy: string | null;
}

const PENDING: ScheduleStatus[] = ['scheduled', 'running'];

const toSchedule = (row: typeof cmsSchedules.$inferSelect): ScheduleRow => ({
    ...row,
    action: row.action as ScheduleAction,
    status: row.status as ScheduleStatus,
});

const toRelease = (row: typeof cmsReleases.$inferSelect): ReleaseRow => ({
    ...row,
    status: row.status as ReleaseStatus,
});

/**
 * The schedules and releases, in their own tables. A document has at most
 * one pending schedule: its own, or its place in a release.
 */
export class ScheduleStore {
    constructor(private readonly db: CmsDatabase) {}

    /**
     * The document's pending schedule, its own or its release's.
     */
    async pendingFor(documentId: string): Promise<ScheduleRow | undefined> {
        const [row] = await this.db
            .select()
            .from(cmsSchedules)
            .where(and(eq(cmsSchedules.documentId, documentId), inArray(cmsSchedules.status, PENDING)))
            .limit(1);
        return row === undefined ? undefined : toSchedule(row);
    }

    /**
     * Every pending schedule, soonest first, release members included.
     */
    async pending(): Promise<ScheduleRow[]> {
        const rows = await this.db
            .select()
            .from(cmsSchedules)
            .where(inArray(cmsSchedules.status, PENDING))
            .orderBy(asc(cmsSchedules.at), asc(cmsSchedules.createdAt));
        return rows.map(toSchedule);
    }

    /**
     * Sets a document's own schedule, replacing an earlier one of its own.
     */
    async schedule(
        input: Pick<ScheduleRow, 'ref' | 'documentId' | 'action' | 'at' | 'force' | 'createdBy'> & { releaseId?: string | null }
    ): Promise<ScheduleRow> {
        return this.db.transaction(async (tx) => {
            await tx
                .update(cmsSchedules)
                .set({
                    status: 'cancelled',
                })
                .where(and(eq(cmsSchedules.documentId, input.documentId), eq(cmsSchedules.status, 'scheduled')));
            const [row] = await tx
                .insert(cmsSchedules)
                .values({
                    id: randomUUID(),
                    ref: input.ref,
                    documentId: input.documentId,
                    action: input.action,
                    at: input.at,
                    releaseId: input.releaseId ?? null,
                    force: input.force,
                    status: 'scheduled',
                    createdBy: input.createdBy,
                    createdAt: new Date(),
                })
                .returning();
            return toSchedule(row!);
        });
    }

    /**
     * Ends a document's pending schedule, taking it out of its release. A run
     * already under way keeps going.
     */
    async endFor(documentId: string): Promise<boolean> {
        const ended = await this.db
            .update(cmsSchedules)
            .set({
                status: 'cancelled',
            })
            .where(and(eq(cmsSchedules.documentId, documentId), eq(cmsSchedules.status, 'scheduled')))
            .returning({
                id: cmsSchedules.id,
            });
        return ended.length > 0;
    }

    /**
     * Claims a schedule for one run. Answers `false` when another run took it
     * first, so two instances never run one schedule twice.
     */
    async claim(id: string): Promise<boolean> {
        const claimed = await this.db
            .update(cmsSchedules)
            .set({
                status: 'running',
            })
            .where(and(eq(cmsSchedules.id, id), eq(cmsSchedules.status, 'scheduled')))
            .returning({
                id: cmsSchedules.id,
            });
        return claimed.length > 0;
    }

    /**
     * Hands a claimed schedule back, for the next tick.
     */
    async unclaim(ids: readonly string[]): Promise<void> {
        if (ids.length === 0) return;
        await this.db
            .update(cmsSchedules)
            .set({
                status: 'scheduled',
            })
            .where(and(inArray(cmsSchedules.id, [...ids]), eq(cmsSchedules.status, 'running')));
    }

    async finish(id: string, version: number | null): Promise<void> {
        await this.db
            .update(cmsSchedules)
            .set({
                status: 'done',
                ranAt: new Date(),
                ranVersion: version,
            })
            .where(eq(cmsSchedules.id, id));
    }

    /**
     * The documents scheduled on their own whose time has come.
     */
    async due(now: Date): Promise<ScheduleRow[]> {
        const rows = await this.db
            .select()
            .from(cmsSchedules)
            .where(and(eq(cmsSchedules.status, 'scheduled'), isNull(cmsSchedules.releaseId), lte(cmsSchedules.at, now)))
            .orderBy(asc(cmsSchedules.at));
        return rows.map(toSchedule);
    }

    /**
     * The documents in a release: waiting for it, or published with it.
     */
    async members(releaseId: string): Promise<ScheduleRow[]> {
        const rows = await this.db
            .select()
            .from(cmsSchedules)
            .where(and(eq(cmsSchedules.releaseId, releaseId), inArray(cmsSchedules.status, [...PENDING, 'done'])))
            .orderBy(asc(cmsSchedules.createdAt));
        return rows.map(toSchedule);
    }

    async createRelease(name: string, by: string): Promise<ReleaseRow> {
        const [row] = await this.db
            .insert(cmsReleases)
            .values({
                id: `rel_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
                name,
                status: 'open',
                createdBy: by,
                createdVia: actingAgent(),
                createdAt: new Date(),
            })
            .returning();
        return toRelease(row!);
    }

    async release(id: string): Promise<ReleaseRow | undefined> {
        const [row] = await this.db.select().from(cmsReleases).where(eq(cmsReleases.id, id)).limit(1);
        return row === undefined ? undefined : toRelease(row);
    }

    /**
     * The releases that have not published yet.
     */
    async openReleases(): Promise<ReleaseRow[]> {
        const rows = await this.db
            .select()
            .from(cmsReleases)
            .where(inArray(cmsReleases.status, ['open', 'running']))
            .orderBy(asc(cmsReleases.at), asc(cmsReleases.createdAt));
        return rows.map(toRelease);
    }

    async renameRelease(id: string, name: string): Promise<void> {
        await this.db
            .update(cmsReleases)
            .set({
                name,
            })
            .where(eq(cmsReleases.id, id));
    }

    /**
     * Sets or clears a release's time, and who set it.
     */
    async timeRelease(id: string, at: Date | null, by: string | null, force: boolean): Promise<void> {
        await this.db
            .update(cmsReleases)
            .set({
                at,
                scheduledBy: by,
                force,
            })
            .where(eq(cmsReleases.id, id));
    }

    /**
     * The releases whose time has come, not claimed yet.
     */
    async dueReleases(now: Date): Promise<ReleaseRow[]> {
        const rows = await this.db
            .select()
            .from(cmsReleases)
            .where(and(eq(cmsReleases.status, 'open'), lte(cmsReleases.at, now)))
            .orderBy(asc(cmsReleases.at));
        return rows.map(toRelease);
    }

    /**
     * Claims a release, and its members, for one run.
     */
    async claimRelease(id: string): Promise<boolean> {
        return this.db.transaction(async (tx) => {
            const claimed = await tx
                .update(cmsReleases)
                .set({
                    status: 'running',
                })
                .where(and(eq(cmsReleases.id, id), eq(cmsReleases.status, 'open')))
                .returning({
                    id: cmsReleases.id,
                });
            if (claimed.length === 0) return false;
            await tx
                .update(cmsSchedules)
                .set({
                    status: 'running',
                })
                .where(and(eq(cmsSchedules.releaseId, id), eq(cmsSchedules.status, 'scheduled')));
            return true;
        });
    }

    async unclaimRelease(id: string): Promise<void> {
        await this.db.transaction(async (tx) => {
            await tx
                .update(cmsReleases)
                .set({
                    status: 'open',
                })
                .where(and(eq(cmsReleases.id, id), eq(cmsReleases.status, 'running')));
            await tx
                .update(cmsSchedules)
                .set({
                    status: 'scheduled',
                })
                .where(and(eq(cmsSchedules.releaseId, id), eq(cmsSchedules.status, 'running')));
        });
    }

    /**
     * Marks a release published, with the version each member published.
     */
    async finishRelease(id: string, by: string, versions: ReadonlyMap<string, number | null>): Promise<void> {
        const now = new Date();
        await this.db.transaction(async (tx) => {
            await tx
                .update(cmsReleases)
                .set({
                    status: 'published',
                    publishedAt: now,
                    publishedBy: by,
                })
                .where(eq(cmsReleases.id, id));
            for (const [scheduleId, version] of versions) {
                await tx
                    .update(cmsSchedules)
                    .set({
                        status: 'done',
                        ranAt: now,
                        ranVersion: version,
                    })
                    .where(eq(cmsSchedules.id, scheduleId));
            }
        });
    }

    /**
     * Removes a release. Its documents leave it with their drafts untouched.
     */
    async deleteRelease(id: string): Promise<void> {
        await this.db.transaction(async (tx) => {
            await tx.delete(cmsSchedules).where(eq(cmsSchedules.releaseId, id));
            await tx.delete(cmsReleases).where(eq(cmsReleases.id, id));
        });
    }
}
