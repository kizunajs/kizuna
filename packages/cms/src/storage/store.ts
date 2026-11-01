import { randomUUID } from 'node:crypto';
import { actingAgent } from '../agents.js';
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, max, ne, notInArray, or, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { cmsComments, cmsDocuments, cmsRefreshes, cmsRefs, cmsReviews, cmsTranslations, cmsVersions } from './schema.js';
import { CMS_MIGRATION_SQL, likePrefix, type IndexType } from './migration.js';
import { PLACE } from '../place.js';

/**
 * Any Drizzle Postgres database: node-postgres, postgres.js, Neon, PGlite.
 */
export type CmsDatabase = PgDatabase<PgQueryResultHKT, any, any>;

/**
 * What a document is: a page, a global, an item of a collection, or a media
 * item's metadata.
 */
export type DocumentKind = 'page' | 'global' | 'item' | 'media' | 'folder';

/**
 * Content as stored: one value per field.
 */
export type Content = Record<string, unknown>;

export interface DocumentRow {
    id: string;
    kind: DocumentKind;
    /**
     * The site a page or a site's own document belongs to; `default` for
     * shared content.
     */
    site: string;
    /**
     * `default` for the source, or the language a translation is in.
     */
    locale: string;
    key: string;
    published: Content | null;
    draft: Content | null;
    publishedVersion: number | null;
    publishedAt: Date | null;
    migrationVersion: number;
    updatedAt: Date;
    updatedBy: string;
    /**
     * The agent that made the last change for `updatedBy`, like `Claude`, or
     * `null` when the person made it.
     */
    updatedVia: string | null;
    /**
     * The person who looks after the document, or `null`.
     */
    owner: string | null;
    /**
     * Who edits the document now, while `heldUntil` lies ahead, or `null`.
     */
    heldBy: string | null;
    heldSince: Date | null;
    heldUntil: Date | null;
    /**
     * When the document went to the trash, or `null` while it is live.
     */
    trashedAt: Date | null;
    trashedBy: string | null;
    /**
     * The id of the document whose delete took this one to the trash.
     */
    trashedWith: string | null;
}

/**
 * One delete in the trash: the document deleted, and how many went with it,
 * the items under it in a tree.
 */
export interface TrashEntry {
    document: DocumentRow;
    under: number;
}

/**
 * Where a review stands: waiting for an answer, approved, sent back with
 * changes to make, taken back by the person who asked, or gone past by
 * someone who published the draft before anyone approved it.
 */
export type ReviewStatus = 'open' | 'approved' | 'changes' | 'withdrawn' | 'published-past-review';

export interface ReviewRow {
    id: string;
    requestId: string;
    /**
     * The document, as `formatRef` writes it.
     */
    ref: string;
    documentId: string;
    /**
     * The draft version the review was asked about.
     */
    version: number;
    reviewers: string[];
    requestedBy: string;
    /**
     * The agent that asked for `requestedBy`, or `null`.
     */
    requestedVia: string | null;
    note: string | null;
    createdAt: Date;
    status: ReviewStatus;
    decidedBy: string | null;
    decisionNote: string | null;
    decidedAt: Date | null;
}

/**
 * Where one refresh stands: waiting to run, answered, failed and waiting to
 * be tried again, or failed for good.
 */
export type RefreshStatus = 'queued' | 'answered' | 'retrying' | 'failed';

export interface RefreshRow {
    id: string;
    batch: string;
    ref: string;
    target: string;
    subject: string;
    status: RefreshStatus;
    attempts: number;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * A refresh that ran, for the dashboard.
 */
export interface RefreshRecord {
    target: string;
    status: 'answered' | 'failed' | 'retrying';
    attempts: number;
    at: Date;
}

/**
 * A comment on one field of a document's draft.
 */
export interface CommentRow {
    id: string;
    documentId: string;
    /**
     * The review it was left in, or `null` for a comment on the draft.
     */
    reviewId: string | null;
    /**
     * The field, as a change to it is keyed.
     */
    path: string;
    text: string;
    createdBy: string;
    createdAt: Date;
    resolvedBy: string | null;
    resolvedAt: Date | null;
    /**
     * The comment that starts the thread this one answers.
     */
    replyTo: string | null;
    /**
     * The phrase of the field's text the comment is about.
     */
    anchor: string | null;
    mentions: string[];
    assignee: string | null;
    /**
     * The agent that wrote it for `createdBy`, like `Claude`.
     */
    via: string | null;
}

/**
 * One filter, sort or cursor field of a list, read out of the stored JSON.
 */
export interface ListField {
    field: string;
    type: IndexType;
}

export interface ListQuery {
    kind: DocumentKind;
    keyPrefix: string;
    /**
     * The site the documents are stored under, `default` for shared content.
     */
    site?: string;
    /**
     * `published` lists published documents only; `draft` lists every document
     * by its draft where it has one.
     */
    copy: 'published' | 'draft';
    where?: ReadonlyArray<ListField & { value: unknown }>;
    /**
     * A list field that has to hold the value.
     */
    holds?: {
        field: string;
        value: string;
    };
    orderBy?: ListField | 'publishedAt' | 'updatedAt';
    direction?: 'asc' | 'desc';
    limit: number;
    cursor?: string;
}

/**
 * One condition of the editing list: a field holding one of the values, or
 * with `list`, a list holding one of them, or the document's status being
 * one of them. `negate` keeps the documents it does not hold for.
 */
export type EditingCondition =
    | {
          kind: 'field';
          field: ListField;
          list: boolean;
          values: readonly unknown[];
          negate: boolean;
      }
    | {
          kind: 'status';
          values: readonly string[];
          negate: boolean;
      };

export interface EditingQuery {
    kind: DocumentKind;
    keyPrefix: string;
    /**
     * The site the documents are stored under, `default` for shared content.
     */
    site?: string;
    /**
     * Sets of conditions, the documents meeting every condition of any one
     * set kept. No sets keeps every document.
     */
    groups: ReadonlyArray<ReadonlyArray<EditingCondition>>;
    /**
     * Text one of the fields holds, in any case.
     */
    search?: {
        term: string;
        fields: readonly string[];
    };
    /**
     * `key` sorts by the document's key, for a list with no field to sort by.
     */
    orderBy: ListField | 'updatedAt' | 'status' | 'key';
    direction: 'asc' | 'desc';
    limit?: number;
    offset: number;
}

/**
 * The order the editing list sorts statuses in.
 */
const STATUS_RANK = ['published', 'changed', 'draft', 'empty'];

/**
 * Where a page of results ends, opaque to callers.
 */
interface Cursor {
    value: unknown;
    id: string;
}

const encodeCursor = (cursor: Cursor): string => Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');

const decodeCursor = (value: string): Cursor | undefined => {
    try {
        const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor;
        return typeof parsed.id === 'string' ? parsed : undefined;
    } catch {
        return undefined;
    }
};

export interface VersionRow {
    version: number;
    summary: string | null;
    createdAt: Date;
    createdBy: string;
    /**
     * The agent that saved it for `createdBy`, or `null`.
     */
    via: string | null;
}

export interface VersionWithData extends VersionRow {
    data: Content;
    /**
     * The migration step `data` was saved at.
     */
    migrationVersion: number;
    /**
     * When this version went live, or `null` if it never did.
     */
    publishedAt: Date | null;
}

/**
 * The latest migration step of a definition, and the function that runs the
 * steps after `from` on stored content.
 */
export interface Migration {
    version: number;
    run: (content: Content, from: number) => Content;
}

export interface Ref {
    brand: string;
    refId: string;
    fieldPath: string;
}

/**
 * A write carried an `If-Match` for a version that is no longer the latest.
 */
export class VersionConflictError extends Error {
    constructor(
        readonly expected: number,
        readonly latest: number
    ) {
        super(`The draft is at version ${latest}, not ${expected}. Read it again before writing.`);
    }
}

/**
 * A write from someone other than the person editing the document while
 * their hold lasts.
 */
export class DocumentHeldError extends Error {
    constructor(
        readonly heldBy: string,
        readonly heldUntil: Date
    ) {
        super(`${heldBy} is editing the document until ${heldUntil.toISOString()}.`);
    }
}

/**
 * Who holds a document now: its holder while the hold lasts, or `null`.
 */
export const holderOf = (row: { heldBy: string | null; heldUntil: Date | null } | undefined, now = new Date()): string | null =>
    row?.heldBy !== null && row?.heldBy !== undefined && row.heldUntil !== null && row.heldUntil > now ? row.heldBy : null;

/**
 * A write to a document in the trash, whose key it keeps until it is
 * restored or deleted for good.
 */
export class DocumentTrashedError extends Error {
    constructor(readonly document: DocumentRow) {
        super(`'${document.key}' is in the trash. Restore it before writing to it.`);
    }
}

const SITE = 'default';

/**
 * The locale a document's source is stored under. A translation is stored
 * under its language.
 */
export const SOURCE_LOCALE = 'default';

/**
 * Leaves out the documents in the trash, which no read sees.
 */
const live = isNull(cmsDocuments.trashedAt);

const stored = (kind: DocumentKind, key: string, site = SITE, locale = SOURCE_LOCALE) =>
    and(eq(cmsDocuments.kind, kind), eq(cmsDocuments.site, site), eq(cmsDocuments.locale, locale), eq(cmsDocuments.key, key));

const identity = (kind: DocumentKind, key: string, site = SITE, locale = SOURCE_LOCALE) => and(stored(kind, key, site, locale), live);

const toRow = (row: typeof cmsDocuments.$inferSelect): DocumentRow => ({
    id: row.id,
    kind: row.kind as DocumentKind,
    site: row.site,
    locale: row.locale,
    key: row.key,
    published: row.published as Content | null,
    draft: row.draft as Content | null,
    publishedVersion: row.publishedVersion,
    publishedAt: row.publishedAt,
    migrationVersion: row.migrationVersion,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
    updatedVia: row.updatedVia,
    owner: row.owner,
    heldBy: row.heldBy,
    heldSince: row.heldSince,
    heldUntil: row.heldUntil,
    trashedAt: row.trashedAt,
    trashedBy: row.trashedBy,
    trashedWith: row.trashedWith,
});

const toComment = (row: typeof cmsComments.$inferSelect): CommentRow => ({
    ...row,
    mentions: row.mentions as string[],
});

const toReview = (row: typeof cmsReviews.$inferSelect): ReviewRow => ({
    ...row,
    reviewers: row.reviewers as string[],
    status: row.status as ReviewStatus,
});

/**
 * The tables the CMS owns, read and written through the app's Drizzle
 * instance. Every write that changes content goes through a transaction, so a
 * stale `If-Match` can never overwrite a newer version.
 */
export class DocumentStore {
    constructor(private readonly db: CmsDatabase) {}

    /**
     * Creates the tables, for tests and local setups. Apps run the migration
     * `kizuna cms migrate` writes instead.
     */
    async createTables(): Promise<void> {
        for (const statement of CMS_MIGRATION_SQL.split(';')) {
            if (statement.trim() === '') continue;
            await this.db.execute(sql.raw(statement));
        }
    }

    async get(kind: DocumentKind, key: string, site = SITE, locale = SOURCE_LOCALE): Promise<DocumentRow | undefined> {
        const [row] = await this.db
            .select()
            .from(cmsDocuments)
            .where(identity(kind, key, site, locale))
            .limit(1);
        return row === undefined ? undefined : toRow(row);
    }

    /**
     * A media document by its id, on whichever site it belongs to, since
     * media ids are unique across sites.
     */
    async media(key: string): Promise<DocumentRow | undefined> {
        const [row] = await this.db
            .select()
            .from(cmsDocuments)
            .where(and(eq(cmsDocuments.kind, 'media'), eq(cmsDocuments.locale, SOURCE_LOCALE), eq(cmsDocuments.key, key), live))
            .limit(1);
        return row === undefined ? undefined : toRow(row);
    }

    async getById(id: string): Promise<DocumentRow | undefined> {
        const [row] = await this.db.select().from(cmsDocuments).where(eq(cmsDocuments.id, id)).limit(1);
        return row === undefined ? undefined : toRow(row);
    }

    /**
     * Every source document of a kind, on one site when `site` is given.
     */
    /**
     * Gives documents a place without a new version, in the draft and the
     * published copy alike, for the items an orderable collection held
     * before they had one.
     */
    async assignPlaces(kind: DocumentKind, site: string, places: ReadonlyArray<{ key: string; place: string }>): Promise<void> {
        const path = `{${PLACE}}`;
        for (const { key, place } of places) {
            const value = JSON.stringify(place);
            await this.db
                .update(cmsDocuments)
                .set({
                    draft: sql`case when ${cmsDocuments.draft} is null then null else jsonb_set(${cmsDocuments.draft}, ${path}::text[], ${value}::jsonb) end`,
                    published: sql`case when ${cmsDocuments.published} is null then null else jsonb_set(${cmsDocuments.published}, ${path}::text[], ${value}::jsonb) end`,
                })
                .where(
                    and(
                        eq(cmsDocuments.kind, kind),
                        eq(cmsDocuments.site, site),
                        eq(cmsDocuments.locale, SOURCE_LOCALE),
                        eq(cmsDocuments.key, key)
                    )
                );
        }
    }

    async list(kind: DocumentKind, site?: string): Promise<DocumentRow[]> {
        const rows = await this.db
            .select()
            .from(cmsDocuments)
            .where(
                and(
                    eq(cmsDocuments.kind, kind),
                    eq(cmsDocuments.locale, SOURCE_LOCALE),
                    live,
                    ...(site === undefined ? [] : [eq(cmsDocuments.site, site)])
                )
            )
            .orderBy(asc(cmsDocuments.key));
        return rows.map(toRow);
    }

    /**
     * The translations of a document, by language.
     */
    async translations(kind: DocumentKind, key: string, site = SITE): Promise<DocumentRow[]> {
        const rows = await this.db
            .select()
            .from(cmsDocuments)
            .where(
                and(
                    eq(cmsDocuments.kind, kind),
                    eq(cmsDocuments.site, site),
                    eq(cmsDocuments.key, key),
                    ne(cmsDocuments.locale, SOURCE_LOCALE),
                    live
                )
            )
            .orderBy(asc(cmsDocuments.locale));
        return rows.map(toRow);
    }

    /**
     * The source version each field of a translation was written from.
     */
    async sourceVersions(documentId: string): Promise<Record<string, number>> {
        const [row] = await this.db.select().from(cmsTranslations).where(eq(cmsTranslations.documentId, documentId)).limit(1);
        return (row?.sourceVersions as Record<string, number> | undefined) ?? {};
    }

    /**
     * Records the source version the fields given were written from, keeping
     * the others.
     */
    async recordSourceVersions(documentId: string, versions: Record<string, number>): Promise<void> {
        if (Object.keys(versions).length === 0) return;
        const merged = {
            ...(await this.sourceVersions(documentId)),
            ...versions,
        };
        await this.db
            .insert(cmsTranslations)
            .values({
                documentId,
                sourceVersions: merged,
            })
            .onConflictDoUpdate({
                target: cmsTranslations.documentId,
                set: {
                    sourceVersions: merged,
                },
            });
    }

    async setOwner(documentId: string, owner: string | null): Promise<void> {
        await this.db
            .update(cmsDocuments)
            .set({
                owner,
            })
            .where(eq(cmsDocuments.id, documentId));
    }

    async addReviews(
        reviews: ReadonlyArray<Omit<ReviewRow, 'id' | 'requestedVia' | 'status' | 'decidedBy' | 'decisionNote' | 'decidedAt'>>
    ): Promise<ReviewRow[]> {
        if (reviews.length === 0) return [];
        const rows = await this.db
            .insert(cmsReviews)
            .values(
                reviews.map((review) => ({
                    ...review,
                    id: randomUUID(),
                    requestedVia: actingAgent(),
                    status: 'open',
                }))
            )
            .returning();
        return rows.map(toReview);
    }

    /**
     * A document's reviews, newest first.
     */
    async reviewsOf(documentId: string): Promise<ReviewRow[]> {
        const rows = await this.db
            .select()
            .from(cmsReviews)
            .where(eq(cmsReviews.documentId, documentId))
            .orderBy(desc(cmsReviews.createdAt));
        return rows.map(toReview);
    }

    async reviews(ids: readonly string[]): Promise<ReviewRow[]> {
        if (ids.length === 0) return [];
        const rows = await this.db
            .select()
            .from(cmsReviews)
            .where(inArray(cmsReviews.id, [...ids]));
        return rows.map(toReview);
    }

    /**
     * Every review still waiting for an answer, oldest first.
     */
    async openReviews(): Promise<ReviewRow[]> {
        const rows = await this.db
            .select({
                review: cmsReviews,
            })
            .from(cmsReviews)
            .innerJoin(cmsDocuments, eq(cmsDocuments.id, cmsReviews.documentId))
            .where(and(eq(cmsReviews.status, 'open'), live))
            .orderBy(asc(cmsReviews.createdAt));
        return rows.map((row) => toReview(row.review));
    }

    /**
     * Records an answer to a review, for the draft version the reviewer saw:
     * theirs, the requester's withdrawal, or a publish past it.
     */
    async decideReview(
        id: string,
        decision: { status: Exclude<ReviewStatus, 'open'>; by: string; note: string | null; version: number }
    ): Promise<void> {
        await this.db
            .update(cmsReviews)
            .set({
                status: decision.status,
                decidedBy: decision.by,
                decisionNote: decision.note,
                decidedAt: new Date(),
                version: decision.version,
            })
            .where(eq(cmsReviews.id, id));
    }

    /**
     * Takes back an answer, so the review waits for one again.
     */
    async reopenReview(id: string): Promise<void> {
        await this.db
            .update(cmsReviews)
            .set({
                status: 'open',
                decidedBy: null,
                decisionNote: null,
                decidedAt: null,
            })
            .where(eq(cmsReviews.id, id));
    }

    async addComment(
        comment: Omit<CommentRow, 'id' | 'resolvedBy' | 'resolvedAt' | 'replyTo' | 'anchor' | 'mentions' | 'assignee' | 'via'> &
            Partial<Pick<CommentRow, 'replyTo' | 'anchor' | 'mentions' | 'assignee' | 'via'>>
    ): Promise<CommentRow> {
        const [row] = await this.db
            .insert(cmsComments)
            .values({
                ...comment,
                id: randomUUID(),
            })
            .returning();
        return toComment(row!);
    }

    /**
     * The comments left in these reviews, oldest first.
     */
    async reviewComments(reviewIds: readonly string[]): Promise<CommentRow[]> {
        if (reviewIds.length === 0) return [];
        const rows = await this.db
            .select()
            .from(cmsComments)
            .where(inArray(cmsComments.reviewId, [...reviewIds]))
            .orderBy(asc(cmsComments.createdAt));
        return rows.map(toComment);
    }

    /**
     * Every comment on a document, oldest first.
     */
    async documentComments(documentId: string): Promise<CommentRow[]> {
        const rows = await this.db
            .select()
            .from(cmsComments)
            .where(eq(cmsComments.documentId, documentId))
            .orderBy(asc(cmsComments.createdAt));
        return rows.map(toComment);
    }

    /**
     * Every open comment on a document outside the trash, oldest first.
     */
    async openComments(): Promise<CommentRow[]> {
        const rows = await this.db
            .select({
                comment: cmsComments,
            })
            .from(cmsComments)
            .innerJoin(cmsDocuments, eq(cmsDocuments.id, cmsComments.documentId))
            .where(and(isNull(cmsComments.resolvedAt), live))
            .orderBy(asc(cmsComments.createdAt));
        return rows.map((row) => toComment(row.comment));
    }

    async comment(id: string): Promise<CommentRow | undefined> {
        const [row] = await this.db.select().from(cmsComments).where(eq(cmsComments.id, id)).limit(1);
        return row === undefined ? undefined : toComment(row);
    }

    /**
     * Resolves a comment with every answer in its thread.
     */
    async resolveComment(id: string, by: string): Promise<void> {
        await this.db
            .update(cmsComments)
            .set({
                resolvedBy: by,
                resolvedAt: new Date(),
            })
            .where(and(isNull(cmsComments.resolvedAt), or(eq(cmsComments.id, id), eq(cmsComments.replyTo, id))));
    }

    async addRefreshes(rows: ReadonlyArray<Pick<RefreshRow, 'batch' | 'ref' | 'target' | 'subject'>>): Promise<void> {
        if (rows.length === 0) return;
        const now = new Date();
        await this.db.insert(cmsRefreshes).values(
            rows.map((row) => ({
                ...row,
                id: randomUUID(),
                status: 'queued',
                attempts: 0,
                createdAt: now,
                updatedAt: now,
            }))
        );
    }

    /**
     * Records an attempt at refreshing one target for one subject, on every
     * row still waiting for it, since a queue may fold several publishes into
     * one call.
     */
    async recordRefresh(target: string, subject: string, outcome: 'answered' | 'retrying' | 'failed', attemptsAllowed = 1): Promise<void> {
        await this.db
            .update(cmsRefreshes)
            .set({
                // The attempt the transport makes last fails for good.
                status:
                    outcome === 'retrying'
                        ? sql`case when ${cmsRefreshes.attempts} + 1 >= ${attemptsAllowed} then 'failed' else 'retrying' end`
                        : outcome,
                attempts: sql`${cmsRefreshes.attempts} + 1`,
                updatedAt: new Date(),
            })
            .where(and(eq(cmsRefreshes.target, target), eq(cmsRefreshes.subject, subject), ne(cmsRefreshes.status, 'answered')));
    }

    /**
     * The refreshes of a document's latest publish, unpublish or delete.
     */
    async latestRefreshes(ref: string): Promise<RefreshRow[]> {
        const [latest] = await this.db
            .select({
                batch: cmsRefreshes.batch,
            })
            .from(cmsRefreshes)
            .where(eq(cmsRefreshes.ref, ref))
            .orderBy(desc(cmsRefreshes.createdAt))
            .limit(1);
        if (latest === undefined) return [];
        const rows = await this.db
            .select()
            .from(cmsRefreshes)
            .where(eq(cmsRefreshes.batch, latest.batch))
            .orderBy(asc(cmsRefreshes.target));
        return rows.map((row) => ({
            ...row,
            status: row.status as RefreshStatus,
        }));
    }

    /**
     * Every refresh that ran since a time, the latest attempt's time as `at`.
     */
    async refreshesSince(from: Date): Promise<RefreshRecord[]> {
        const rows = await this.db
            .select()
            .from(cmsRefreshes)
            .where(and(gte(cmsRefreshes.updatedAt, from), ne(cmsRefreshes.status, 'queued')))
            .orderBy(asc(cmsRefreshes.updatedAt));
        return rows.map((row) => ({
            target: row.target,
            status: row.status as RefreshRecord['status'],
            attempts: row.attempts,
            at: row.updatedAt,
        }));
    }

    async latestVersion(documentId: string): Promise<number> {
        const [row] = await this.db
            .select({
                latest: max(cmsVersions.version),
            })
            .from(cmsVersions)
            .where(eq(cmsVersions.documentId, documentId));
        return Number(row?.latest ?? 0);
    }

    async versions(documentId: string): Promise<VersionRow[]> {
        return this.db
            .select({
                version: cmsVersions.version,
                summary: cmsVersions.summary,
                createdAt: cmsVersions.createdAt,
                createdBy: cmsVersions.createdBy,
                via: cmsVersions.via,
            })
            .from(cmsVersions)
            .where(eq(cmsVersions.documentId, documentId))
            .orderBy(desc(cmsVersions.version));
    }

    async version(documentId: string, version: number): Promise<VersionWithData | undefined> {
        const [row] = await this.db
            .select()
            .from(cmsVersions)
            .where(and(eq(cmsVersions.documentId, documentId), eq(cmsVersions.version, version)))
            .limit(1);
        if (row === undefined) return undefined;
        return {
            version: row.version,
            summary: row.summary,
            createdAt: row.createdAt,
            createdBy: row.createdBy,
            via: row.via,
            data: row.data as Content,
            migrationVersion: row.migrationVersion,
            publishedAt: row.publishedAt,
        };
    }

    /**
     * The versions that went live before `before`, newest first.
     */
    async publishedVersions(documentId: string, before: number): Promise<VersionWithData[]> {
        const rows = await this.db
            .select()
            .from(cmsVersions)
            .where(and(eq(cmsVersions.documentId, documentId), lt(cmsVersions.version, before), isNotNull(cmsVersions.publishedAt)))
            .orderBy(desc(cmsVersions.version));
        return rows.map((row) => ({
            version: row.version,
            summary: row.summary,
            createdAt: row.createdAt,
            createdBy: row.createdBy,
            via: row.via,
            data: row.data as Content,
            migrationVersion: row.migrationVersion,
            publishedAt: row.publishedAt,
        }));
    }

    /**
     * Ends `by`'s hold on a document. Answers whether they held it.
     */
    async releaseHold(kind: DocumentKind, key: string, by: string, site = SITE, locale = SOURCE_LOCALE): Promise<boolean> {
        const released = await this.db
            .update(cmsDocuments)
            .set({
                heldBy: null,
                heldSince: null,
                heldUntil: null,
            })
            .where(and(identity(kind, key, site, locale), eq(cmsDocuments.heldBy, by), gt(cmsDocuments.heldUntil, new Date())))
            .returning({
                id: cmsDocuments.id,
            });
        return released.length > 0;
    }

    /**
     * Writes the draft and records a version. `ifMatch` is the version and save
     * time the writer read; when either is behind, nothing is written. With
     * `fold`, a save by the same author within that many milliseconds of their
     * own unpublished version rewrites it instead of adding one. With
     * `migration`, the draft is at that step, and a published copy stored at
     * an older one is brought up to it in the same transaction. With `hold`,
     * the author holds the document for that many milliseconds, and a
     * document someone else holds is refused with `DocumentHeldError`.
     */
    async saveDraft(input: {
        kind: DocumentKind;
        key: string;
        site?: string;
        locale?: string;
        draft: Content;
        author: string;
        summary?: string;
        ifMatch?: {
            version: number;
            savedAt?: number;
        };
        fold?: number;
        refs?: readonly Ref[];
        migration?: Migration;
        hold?: number;
    }): Promise<{ document: DocumentRow; version: number }> {
        return this.db.transaction(async (tx) => {
            const now = new Date();
            const [existing] = await tx
                .select()
                .from(cmsDocuments)
                .where(identity(input.kind, input.key, input.site, input.locale))
                .for('update');
            if (existing === undefined) {
                const [trashed] = await tx
                    .select()
                    .from(cmsDocuments)
                    .where(stored(input.kind, input.key, input.site, input.locale))
                    .limit(1);
                if (trashed !== undefined) throw new DocumentTrashedError(toRow(trashed));
            }
            const id = existing?.id ?? randomUUID();
            const latest = existing === undefined ? 0 : await this.latestVersionIn(tx, id);
            const stale =
                input.ifMatch !== undefined &&
                (input.ifMatch.version !== latest ||
                    (input.ifMatch.savedAt !== undefined &&
                        existing !== undefined &&
                        existing.updatedAt.getTime() !== input.ifMatch.savedAt));
            if (stale) {
                throw new VersionConflictError(input.ifMatch!.version, latest);
            }
            const holder = holderOf(existing, now);
            if (input.hold !== undefined && holder !== null && holder !== input.author) {
                throw new DocumentHeldError(holder, existing!.heldUntil!);
            }
            const held =
                input.hold === undefined
                    ? {}
                    : {
                          heldBy: input.author,
                          heldSince: holder === input.author ? existing!.heldSince : now,
                          heldUntil: new Date(now.getTime() + input.hold),
                      };
            const [previous] =
                input.fold === undefined || existing === undefined || existing.publishedVersion === latest
                    ? []
                    : await tx
                          .select()
                          .from(cmsVersions)
                          .where(and(eq(cmsVersions.documentId, id), eq(cmsVersions.version, latest)))
                          .limit(1);
            const via = actingAgent();
            const folds =
                previous !== undefined &&
                previous.createdBy === input.author &&
                previous.via === via &&
                now.getTime() - previous.createdAt.getTime() < input.fold!;
            const version = folds ? latest : latest + 1;
            const raises = existing !== undefined && input.migration !== undefined && input.migration.version > existing.migrationVersion;
            const draftStep = input.migration?.version ?? existing?.migrationVersion ?? 0;
            if (existing === undefined) {
                await tx.insert(cmsDocuments).values({
                    id,
                    kind: input.kind,
                    site: input.site ?? SITE,
                    locale: input.locale ?? SOURCE_LOCALE,
                    key: input.key,
                    draft: input.draft,
                    migrationVersion: draftStep,
                    updatedAt: now,
                    updatedBy: input.author,
                    updatedVia: actingAgent(),
                    ...held,
                });
            } else {
                await tx
                    .update(cmsDocuments)
                    .set({
                        draft: input.draft,
                        updatedAt: now,
                        updatedBy: input.author,
                        updatedVia: actingAgent(),
                        ...held,
                        ...(raises
                            ? {
                                  migrationVersion: input.migration!.version,
                                  published:
                                      existing.published === null
                                          ? null
                                          : input.migration!.run(existing.published as Content, existing.migrationVersion),
                              }
                            : {}),
                    })
                    .where(eq(cmsDocuments.id, id));
            }
            if (folds) {
                await tx
                    .update(cmsVersions)
                    .set({
                        data: input.draft,
                        migrationVersion: draftStep,
                        createdAt: now,
                        ...(input.summary === undefined
                            ? {}
                            : {
                                  summary: input.summary,
                              }),
                    })
                    .where(and(eq(cmsVersions.documentId, id), eq(cmsVersions.version, version)));
            } else {
                await tx.insert(cmsVersions).values({
                    documentId: id,
                    version,
                    data: input.draft,
                    summary: input.summary ?? null,
                    createdAt: now,
                    createdBy: input.author,
                    via,
                    migrationVersion: draftStep,
                });
            }
            if (input.refs !== undefined) await this.replaceRefsIn(tx, id, input.refs);
            const [row] = await tx.select().from(cmsDocuments).where(eq(cmsDocuments.id, id)).limit(1);
            return {
                document: toRow(row!),
                version,
            };
        });
    }

    /**
     * Points `published` at the current draft and its version.
     */
    async publish(kind: DocumentKind, key: string, author: string, site = SITE, locale = SOURCE_LOCALE): Promise<DocumentRow | undefined> {
        return this.db.transaction(async (tx) => {
            const [existing] = await tx
                .select()
                .from(cmsDocuments)
                .where(identity(kind, key, site, locale))
                .for('update');
            if (existing === undefined || existing.draft === null) return undefined;
            const latest = await this.latestVersionIn(tx, existing.id);
            const now = new Date();
            await tx
                .update(cmsDocuments)
                .set({
                    published: existing.draft,
                    publishedVersion: latest,
                    publishedAt: now,
                    updatedAt: now,
                    updatedBy: author,
                    updatedVia: actingAgent(),
                })
                .where(eq(cmsDocuments.id, existing.id));
            await tx
                .update(cmsVersions)
                .set({
                    publishedAt: now,
                })
                .where(and(eq(cmsVersions.documentId, existing.id), eq(cmsVersions.version, latest)));
            await this.publishRefsIn(tx, existing.id);
            const [row] = await tx.select().from(cmsDocuments).where(eq(cmsDocuments.id, existing.id)).limit(1);
            return toRow(row!);
        });
    }

    /**
     * Approves a review and publishes the draft it is about in one
     * transaction, so neither happens without the other. Refuses, changing
     * nothing, when the review was answered or the draft moved past the
     * version the reviewer saw.
     */
    async approveAndPublish(
        kind: DocumentKind,
        key: string,
        approval: { review: string; by: string; version: number },
        site = SITE,
        locale = SOURCE_LOCALE
    ): Promise<DocumentRow | 'answered' | 'changed' | undefined> {
        return this.db.transaction(async (tx) => {
            const [existing] = await tx
                .select()
                .from(cmsDocuments)
                .where(identity(kind, key, site, locale))
                .for('update');
            if (existing === undefined || existing.draft === null) return undefined;
            const [review] = await tx.select().from(cmsReviews).where(eq(cmsReviews.id, approval.review)).for('update');
            if (review?.status !== 'open') return 'answered';
            const latest = await this.latestVersionIn(tx, existing.id);
            if (latest !== approval.version) return 'changed';
            const now = new Date();
            await tx
                .update(cmsReviews)
                .set({
                    status: 'approved',
                    decidedBy: approval.by,
                    decisionNote: null,
                    decidedAt: now,
                    version: latest,
                })
                .where(eq(cmsReviews.id, approval.review));
            await tx
                .update(cmsDocuments)
                .set({
                    published: existing.draft,
                    publishedVersion: latest,
                    publishedAt: now,
                    updatedAt: now,
                    updatedBy: approval.by,
                    updatedVia: actingAgent(),
                })
                .where(eq(cmsDocuments.id, existing.id));
            await tx
                .update(cmsVersions)
                .set({
                    publishedAt: now,
                })
                .where(and(eq(cmsVersions.documentId, existing.id), eq(cmsVersions.version, latest)));
            await this.publishRefsIn(tx, existing.id);
            const [row] = await tx.select().from(cmsDocuments).where(eq(cmsDocuments.id, existing.id)).limit(1);
            return toRow(row!);
        });
    }

    /**
     * Clears the published copy and keeps the draft and every version, so
     * publishing again brings it back. Answers `undefined` when nothing was
     * published.
     */
    async unpublish(
        kind: DocumentKind,
        key: string,
        author: string,
        site = SITE,
        locale = SOURCE_LOCALE
    ): Promise<DocumentRow | undefined> {
        return this.db.transaction(async (tx) => {
            const [existing] = await tx
                .select()
                .from(cmsDocuments)
                .where(identity(kind, key, site, locale))
                .for('update');
            if (existing === undefined || existing.published === null) return undefined;
            const now = new Date();
            await tx
                .update(cmsDocuments)
                .set({
                    draft: existing.draft ?? existing.published,
                    published: null,
                    publishedVersion: null,
                    publishedAt: null,
                    updatedAt: now,
                    updatedBy: author,
                    updatedVia: actingAgent(),
                })
                .where(eq(cmsDocuments.id, existing.id));
            await tx.delete(cmsRefs).where(and(eq(cmsRefs.documentId, existing.id), eq(cmsRefs.published, true)));
            const [row] = await tx.select().from(cmsDocuments).where(eq(cmsDocuments.id, existing.id)).limit(1);
            return toRow(row!);
        });
    }

    /**
     * Rewrites both stored copies at a definition's latest migration step, in
     * place: no version is added and nothing is published, since the content
     * means what it meant. Answers whether the document was behind.
     */
    async migrateStored(id: string, migration: Migration, refsOf: (content: Content) => readonly Ref[], author: string): Promise<boolean> {
        return this.db.transaction(async (tx) => {
            const [existing] = await tx.select().from(cmsDocuments).where(eq(cmsDocuments.id, id)).for('update');
            if (existing === undefined || existing.migrationVersion >= migration.version) return false;
            const published = existing.published === null ? null : migration.run(existing.published as Content, existing.migrationVersion);
            const draft = existing.draft === null ? null : migration.run(existing.draft as Content, existing.migrationVersion);
            await tx
                .update(cmsDocuments)
                .set({
                    published,
                    draft,
                    migrationVersion: migration.version,
                    updatedAt: new Date(),
                    updatedBy: author,
                    updatedVia: actingAgent(),
                })
                .where(eq(cmsDocuments.id, id));
            await this.replaceRefsIn(tx, id, refsOf(draft ?? published ?? {}));
            await this.replaceRefsIn(tx, id, published === null ? [] : refsOf(published), true);
            return true;
        });
    }

    /**
     * Rebuilds a document's refs from its draft and its published content,
     * for content indexed before images were.
     */
    async reindexRefs(id: string, draft: readonly Ref[], published: readonly Ref[]): Promise<void> {
        await this.db.transaction(async (tx) => {
            await this.replaceRefsIn(tx, id, draft);
            await this.replaceRefsIn(tx, id, published, true);
        });
    }

    /**
     * Every source document holding any of these ids of a brand, every id
     * when `refIds` is left out, with the field and whether the published
     * content holds it.
     */
    async holders(
        brand: string,
        refIds?: readonly string[]
    ): Promise<Array<{ document: DocumentRow; refId: string; fieldPath: string; published: boolean }>> {
        if (refIds !== undefined && refIds.length === 0) return [];
        const rows = await this.db
            .select({
                document: cmsDocuments,
                refId: cmsRefs.refId,
                fieldPath: cmsRefs.fieldPath,
                published: cmsRefs.published,
            })
            .from(cmsRefs)
            .innerJoin(cmsDocuments, eq(cmsDocuments.id, cmsRefs.documentId))
            .where(
                and(
                    eq(cmsRefs.brand, brand),
                    eq(cmsDocuments.locale, SOURCE_LOCALE),
                    live,
                    ...(refIds === undefined ? [] : [inArray(cmsRefs.refId, [...refIds])])
                )
            )
            .orderBy(asc(cmsDocuments.site), asc(cmsDocuments.key), asc(cmsRefs.fieldPath));
        return rows.map((row) => ({
            document: toRow(row.document),
            refId: row.refId,
            fieldPath: row.fieldPath,
            published: row.published,
        }));
    }

    /**
     * The documents holding one branded id.
     */
    async whereUsed(brand: string, refId: string): Promise<Array<DocumentRow & { fieldPaths: string[] }>> {
        const rows = await this.db
            .select({
                document: cmsDocuments,
                fieldPath: cmsRefs.fieldPath,
            })
            .from(cmsRefs)
            .innerJoin(cmsDocuments, eq(cmsDocuments.id, cmsRefs.documentId))
            .where(and(eq(cmsRefs.brand, brand), eq(cmsRefs.refId, refId), live))
            .orderBy(asc(cmsDocuments.key), asc(cmsRefs.fieldPath));
        const byId = new Map<string, DocumentRow & { fieldPaths: string[] }>();
        for (const row of rows) {
            const held = byId.get(row.document.id);
            if (held) {
                if (!held.fieldPaths.includes(row.fieldPath)) held.fieldPaths.push(row.fieldPath);
                continue;
            }
            byId.set(row.document.id, {
                ...toRow(row.document),
                fieldPaths: [row.fieldPath],
            });
        }
        return [...byId.values()];
    }

    /**
     * Writes or replaces a media document. Media has no draft: its metadata
     * is published the moment it exists.
     */
    async saveMedia(key: string, data: Content, author: string, site = SITE): Promise<DocumentRow> {
        return this.saveRecord('media', key, data, author, site);
    }

    /**
     * Writes or replaces a media folder, published the moment it exists like
     * an image.
     */
    async saveFolder(key: string, data: Content, author: string, site = SITE): Promise<DocumentRow> {
        return this.saveRecord('folder', key, data, author, site);
    }

    /**
     * Moves a media document or folder into another library, keeping its key.
     */
    async moveToSite(kind: 'media' | 'folder', key: string, site = SITE): Promise<void> {
        await this.db
            .update(cmsDocuments)
            .set({
                site,
            })
            .where(and(eq(cmsDocuments.kind, kind), eq(cmsDocuments.locale, SOURCE_LOCALE), eq(cmsDocuments.key, key)));
    }

    private async saveRecord(kind: 'media' | 'folder', key: string, data: Content, author: string, site: string): Promise<DocumentRow> {
        return this.db.transaction(async (tx) => {
            const now = new Date();
            const [existing] = await tx
                .select()
                .from(cmsDocuments)
                .where(identity(kind, key, site))
                .for('update');
            const id = existing?.id ?? randomUUID();
            const latest = existing === undefined ? 0 : await this.latestVersionIn(tx, id);
            if (existing === undefined) {
                await tx.insert(cmsDocuments).values({
                    id,
                    kind,
                    site,
                    key,
                    published: data,
                    publishedVersion: latest + 1,
                    updatedAt: now,
                    updatedBy: author,
                    updatedVia: actingAgent(),
                });
            } else {
                await tx
                    .update(cmsDocuments)
                    .set({
                        published: data,
                        publishedVersion: latest + 1,
                        updatedAt: now,
                        updatedBy: author,
                        updatedVia: actingAgent(),
                    })
                    .where(eq(cmsDocuments.id, id));
            }
            await tx.insert(cmsVersions).values({
                documentId: id,
                version: latest + 1,
                data,
                summary: null,
                createdAt: now,
                createdBy: author,
            });
            const [row] = await tx.select().from(cmsDocuments).where(eq(cmsDocuments.id, id)).limit(1);
            return toRow(row!);
        });
    }

    /**
     * Documents under a key prefix, filtered and sorted by indexed fields, a
     * page at a time. Sorting breaks ties on the document id, so a cursor is
     * stable while the list changes.
     */
    async query(input: ListQuery): Promise<{ rows: DocumentRow[]; next: string | undefined }> {
        const copy =
            input.copy === 'published' ? sql`${cmsDocuments.published}` : sql`coalesce(${cmsDocuments.draft}, ${cmsDocuments.published})`;
        const read = (field: ListField) =>
            field.type === 'text'
                ? sql`(${copy} ->> ${field.field})`
                : field.type === 'numeric'
                  ? sql`((${copy} ->> ${field.field})::numeric)`
                  : sql`((${copy} ->> ${field.field})::boolean)`;
        const sortExpression =
            input.orderBy === undefined || input.orderBy === 'publishedAt'
                ? sql`${cmsDocuments.publishedAt}`
                : input.orderBy === 'updatedAt'
                  ? sql`${cmsDocuments.updatedAt}`
                  : read(input.orderBy);
        const direction = input.direction ?? (input.orderBy === undefined || typeof input.orderBy === 'string' ? 'desc' : 'asc');
        const conditions = [
            eq(cmsDocuments.kind, input.kind),
            eq(cmsDocuments.site, input.site ?? SITE),
            eq(cmsDocuments.locale, SOURCE_LOCALE),
            live,
            sql`${cmsDocuments.key} like ${likePrefix(input.keyPrefix)}`,
            input.copy === 'published'
                ? sql`${cmsDocuments.published} is not null`
                : sql`(${cmsDocuments.draft} is not null or ${cmsDocuments.published} is not null)`,
            ...(input.where ?? []).map((filter) => sql`${read(filter)} = ${filter.type === 'text' ? String(filter.value) : filter.value}`),
            ...(input.holds === undefined
                ? []
                : [sql`coalesce((${copy} -> ${input.holds.field}) @> ${JSON.stringify([input.holds.value])}::jsonb, false)`]),
        ];
        const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor);
        if (cursor !== undefined) {
            const value = cursor.value === null ? null : cursor.value;
            conditions.push(
                direction === 'desc'
                    ? sql`(${sortExpression}, ${cmsDocuments.id}) < (${value}, ${cursor.id})`
                    : sql`(${sortExpression}, ${cmsDocuments.id}) > (${value}, ${cursor.id})`
            );
        }
        const rows = await this.db
            .select({
                document: cmsDocuments,
                sortValue: sql<unknown>`${sortExpression}`,
            })
            .from(cmsDocuments)
            .where(and(...conditions))
            .orderBy(
                direction === 'desc' ? sql`${sortExpression} desc nulls last` : sql`${sortExpression} asc nulls last`,
                direction === 'desc' ? desc(cmsDocuments.id) : asc(cmsDocuments.id)
            )
            .limit(input.limit + 1);
        const page = rows.slice(0, input.limit);
        const last = page[page.length - 1];
        return {
            rows: page.map((row) => toRow(row.document)),
            next:
                rows.length > input.limit && last !== undefined
                    ? encodeCursor({
                          value: last.sortValue instanceof Date ? last.sortValue.toISOString() : last.sortValue,
                          id: last.document.id,
                      })
                    : undefined,
        };
    }

    /**
     * Documents under a key prefix as the editing list asks for them, by the
     * draft where there is one: filtered by sets of conditions, searched,
     * sorted with ties broken on the id, and one page of them, with each
     * one's latest version and how many match in all.
     */
    async editingQuery(input: EditingQuery): Promise<{ rows: Array<DocumentRow & { latestVersion: number }>; total: number }> {
        const copy = sql`coalesce(${cmsDocuments.draft}, ${cmsDocuments.published})`;
        const read = (field: ListField) =>
            field.type === 'text'
                ? sql`(${copy} ->> ${field.field})`
                : field.type === 'numeric'
                  ? sql`((${copy} ->> ${field.field})::numeric)`
                  : sql`((${copy} ->> ${field.field})::boolean)`;
        const latest = sql`coalesce((select max(${cmsVersions.version}) from ${cmsVersions} where ${cmsVersions.documentId} = ${cmsDocuments.id}), 0)`;
        const status = sql`(case when ${cmsDocuments.draft} is null and ${cmsDocuments.published} is null then 'empty' when ${cmsDocuments.published} is null then 'draft' when ${cmsDocuments.publishedVersion} = ${latest} or jsonb_strip_nulls(${cmsDocuments.draft}) = jsonb_strip_nulls(${cmsDocuments.published}) then 'published' else 'changed' end)`;
        const listOf = (values: readonly unknown[]) =>
            sql.join(
                values.map((value) => sql`${value}`),
                sql`, `
            );
        const holds = (condition: EditingCondition) => {
            if (condition.kind === 'status') return sql`${status} in (${listOf(condition.values)})`;
            if (!condition.list) return sql`coalesce(${read(condition.field)} in (${listOf(condition.values)}), false)`;
            const held = sql`(${copy} -> ${condition.field.field})`;
            return sql`(jsonb_typeof(${held}) = 'array' and exists (select 1 from jsonb_array_elements_text(${held}) as element(value) where element.value in (${listOf(condition.values.map(String))})))`;
        };
        const groups = input.groups.filter((group) => group.length > 0);
        const conditions = [
            eq(cmsDocuments.kind, input.kind),
            eq(cmsDocuments.site, input.site ?? SITE),
            eq(cmsDocuments.locale, SOURCE_LOCALE),
            live,
            sql`${cmsDocuments.key} like ${likePrefix(input.keyPrefix)}`,
            ...(groups.length === 0
                ? []
                : [
                      sql`(${sql.join(
                          groups.map(
                              (group) =>
                                  sql`(${sql.join(
                                      group.map((condition) => (condition.negate ? sql`not ${holds(condition)}` : holds(condition))),
                                      sql` and `
                                  )})`
                          ),
                          sql` or `
                      )})`,
                  ]),
            ...(input.search === undefined || input.search.term === '' || input.search.fields.length === 0
                ? []
                : [
                      sql`(${sql.join(
                          input.search.fields.map(
                              (field) =>
                                  sql`(${copy} ->> ${field}) ilike ${`%${input.search!.term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`}`
                          ),
                          sql` or `
                      )})`,
                  ]),
        ];
        const sortExpression =
            input.orderBy === 'updatedAt'
                ? sql`${cmsDocuments.updatedAt}`
                : input.orderBy === 'key'
                  ? sql`${cmsDocuments.key}`
                  : input.orderBy === 'status'
                    ? sql`array_position(array[${listOf(STATUS_RANK)}]::text[], ${status})`
                    : input.orderBy.type === 'text'
                      ? sql`lower(${read(input.orderBy)})`
                      : read(input.orderBy);
        const where = and(...conditions);
        const [rows, counted] = await Promise.all([
            this.db
                .select({
                    document: cmsDocuments,
                    latestVersion: sql<number>`${latest}`,
                })
                .from(cmsDocuments)
                .where(where)
                .orderBy(
                    input.direction === 'desc' ? sql`${sortExpression} desc nulls last` : sql`${sortExpression} asc nulls last`,
                    asc(cmsDocuments.id)
                )
                .limit(input.limit ?? Number.MAX_SAFE_INTEGER)
                .offset(input.offset),
            this.db
                .select({
                    total: sql<number>`count(*)`,
                })
                .from(cmsDocuments)
                .where(where),
        ]);
        return {
            rows: rows.map((row) => ({
                ...toRow(row.document),
                latestVersion: Number(row.latestVersion),
            })),
            total: Number(counted[0]?.total ?? 0),
        };
    }

    /**
     * Moves a document to another key, its translations, versions and refs
     * with it.
     */
    async rekey(kind: DocumentKind, from: string, to: string, site = SITE): Promise<boolean> {
        const moved = await this.db
            .update(cmsDocuments)
            .set({ key: to })
            .where(and(eq(cmsDocuments.kind, kind), eq(cmsDocuments.site, site), eq(cmsDocuments.key, from)))
            .returning({ id: cmsDocuments.id });
        return moved.length > 0;
    }

    /**
     * Points every review of a document at the ref it is now addressed by.
     */
    async readdressReviews(documentId: string, ref: string): Promise<void> {
        await this.db
            .update(cmsReviews)
            .set({
                ref,
            })
            .where(eq(cmsReviews.documentId, documentId));
    }

    /**
     * Removes a document with its translations, versions and references.
     */
    async delete(kind: DocumentKind, key: string, site = SITE): Promise<boolean> {
        return this.db.transaction(async (tx) => {
            const found = await tx
                .select()
                .from(cmsDocuments)
                .where(and(eq(cmsDocuments.kind, kind), eq(cmsDocuments.site, site), eq(cmsDocuments.key, key)))
                .for('update');
            if (!found.some((row) => row.locale === SOURCE_LOCALE)) return false;
            await this.eraseIn(tx, found);
            return true;
        });
    }

    /**
     * Moves documents to the trash with `root`, the one deleted: each key's
     * source and translations and, with `everySite`, each site's values on
     * it. Nothing reads them there, and each keeps its key, versions and
     * references for a restore to bring back. Answers the root as it went,
     * or `undefined` when it is not there to delete.
     */
    async trash(input: {
        kind: DocumentKind;
        root: string;
        keys: readonly string[];
        site: string;
        everySite: boolean;
        by: string;
    }): Promise<DocumentRow | undefined> {
        return this.db.transaction(async (tx) => {
            const found = await tx
                .select()
                .from(cmsDocuments)
                .where(
                    and(
                        eq(cmsDocuments.kind, input.kind),
                        inArray(cmsDocuments.key, [...new Set([input.root, ...input.keys])]),
                        live,
                        ...(input.everySite ? [] : [eq(cmsDocuments.site, input.site)])
                    )
                )
                .for('update');
            const root = found.find((row) => row.key === input.root && row.site === input.site && row.locale === SOURCE_LOCALE);
            if (root === undefined) return undefined;
            await tx
                .update(cmsDocuments)
                .set({
                    trashedAt: new Date(),
                    trashedBy: input.by,
                    trashedWith: root.id,
                    heldBy: null,
                    heldSince: null,
                    heldUntil: null,
                })
                .where(
                    inArray(
                        cmsDocuments.id,
                        found.map((row) => row.id)
                    )
                );
            const [row] = await tx.select().from(cmsDocuments).where(eq(cmsDocuments.id, root.id)).limit(1);
            return toRow(row!);
        });
    }

    /**
     * A document in the trash, by where it was stored, or `undefined` when
     * it is live or gone.
     */
    async trashed(kind: DocumentKind, key: string, site = SITE, locale = SOURCE_LOCALE): Promise<DocumentRow | undefined> {
        const [row] = await this.db
            .select()
            .from(cmsDocuments)
            .where(and(stored(kind, key, site, locale), isNotNull(cmsDocuments.trashedAt)))
            .limit(1);
        return row === undefined ? undefined : toRow(row);
    }

    /**
     * Each delete in one site's trash, or the shared content's, newest
     * first: the document deleted, with how many went with it.
     */
    async trashEntries(kind: DocumentKind, site = SITE): Promise<TrashEntry[]> {
        const rows = await this.db
            .select({
                document: cmsDocuments,
                under: sql<number>`(select count(*) from cms_documents as branch where branch.trashed_with = cms_documents.id and branch.id <> cms_documents.id and branch.site = cms_documents.site and branch.locale = ${SOURCE_LOCALE})`,
            })
            .from(cmsDocuments)
            .where(
                and(
                    eq(cmsDocuments.kind, kind),
                    eq(cmsDocuments.site, site),
                    eq(cmsDocuments.locale, SOURCE_LOCALE),
                    isNotNull(cmsDocuments.trashedAt),
                    eq(cmsDocuments.trashedWith, cmsDocuments.id)
                )
            )
            .orderBy(desc(cmsDocuments.trashedAt), asc(cmsDocuments.key));
        return rows.map((row) => ({
            document: toRow(row.document),
            under: Number(row.under),
        }));
    }

    /**
     * Every document one delete took to the trash, the deleted one among
     * them: in every language and on every site.
     */
    async trashedWith(root: string): Promise<DocumentRow[]> {
        const rows = await this.db
            .select()
            .from(cmsDocuments)
            .where(and(eq(cmsDocuments.trashedWith, root), isNotNull(cmsDocuments.trashedAt)))
            .orderBy(asc(cmsDocuments.site), asc(cmsDocuments.key), asc(cmsDocuments.locale));
        return rows.map(toRow);
    }

    /**
     * Brings back every document one delete took to the trash, as it was,
     * and the images they hold that went to the trash after them, which
     * `mediaBrand` names. Answers what came back.
     */
    async restore(root: string, mediaBrand: string): Promise<DocumentRow[]> {
        return this.db.transaction(async (tx) => {
            const found = await tx
                .select()
                .from(cmsDocuments)
                .where(and(eq(cmsDocuments.trashedWith, root), isNotNull(cmsDocuments.trashedAt)))
                .for('update');
            if (found.length === 0) return [];
            const ids = found.map((row) => row.id);
            const held = tx
                .select({
                    refId: cmsRefs.refId,
                })
                .from(cmsRefs)
                .where(and(eq(cmsRefs.brand, mediaBrand), inArray(cmsRefs.documentId, ids)));
            const back = {
                trashedAt: null,
                trashedBy: null,
                trashedWith: null,
            };
            await tx
                .update(cmsDocuments)
                .set(back)
                .where(and(eq(cmsDocuments.kind, 'media'), isNotNull(cmsDocuments.trashedAt), inArray(cmsDocuments.key, held)));
            await tx.update(cmsDocuments).set(back).where(inArray(cmsDocuments.id, ids));
            return found.map((row) => ({
                ...toRow(row),
                ...back,
            }));
        });
    }

    /**
     * Deletes for good every document one delete took to the trash, with
     * their versions, references, reviews and comments. Answers what went.
     */
    async erase(root: string): Promise<DocumentRow[]> {
        return this.db.transaction(async (tx) => {
            const found = await tx
                .select()
                .from(cmsDocuments)
                .where(and(eq(cmsDocuments.trashedWith, root), isNotNull(cmsDocuments.trashedAt)))
                .for('update');
            await this.eraseIn(tx, found);
            return found.map(toRow);
        });
    }

    /**
     * The deletes in the trash since before `before`, by the id of the
     * document each deleted. Images are left to `unheldTrashedMedia`.
     */
    async trashedBefore(before: Date): Promise<string[]> {
        const rows = await this.db
            .select({
                id: cmsDocuments.id,
            })
            .from(cmsDocuments)
            .where(and(ne(cmsDocuments.kind, 'media'), lt(cmsDocuments.trashedAt, before), eq(cmsDocuments.trashedWith, cmsDocuments.id)));
        return rows.map((row) => row.id);
    }

    /**
     * Whether a document in the trash holds a branded id, in its draft or
     * its published content.
     */
    async heldInTrash(brand: string, refId: string): Promise<boolean> {
        const [row] = await this.db
            .select({
                id: cmsRefs.documentId,
            })
            .from(cmsRefs)
            .innerJoin(cmsDocuments, eq(cmsDocuments.id, cmsRefs.documentId))
            .where(and(eq(cmsRefs.brand, brand), eq(cmsRefs.refId, refId), isNotNull(cmsDocuments.trashedAt)))
            .limit(1);
        return row !== undefined;
    }

    /**
     * Moves an image to the trash, keeping its stored file for a document
     * in the trash that holds it.
     */
    async trashMedia(key: string, by: string): Promise<void> {
        await this.db
            .update(cmsDocuments)
            .set({
                trashedAt: new Date(),
                trashedBy: by,
                trashedWith: sql`${cmsDocuments.id}`,
            })
            .where(and(eq(cmsDocuments.kind, 'media'), eq(cmsDocuments.key, key), live));
    }

    /**
     * The images in the trash that no document holds any longer, live or in
     * the trash, which `mediaBrand` names.
     */
    async unheldTrashedMedia(mediaBrand: string): Promise<DocumentRow[]> {
        const held = this.db
            .select({
                refId: cmsRefs.refId,
            })
            .from(cmsRefs)
            .where(eq(cmsRefs.brand, mediaBrand));
        const rows = await this.db
            .select()
            .from(cmsDocuments)
            .where(and(eq(cmsDocuments.kind, 'media'), isNotNull(cmsDocuments.trashedAt), notInArray(cmsDocuments.key, held)));
        return rows.map(toRow);
    }

    /**
     * Deletes stored documents with their translations' source versions,
     * versions, references, reviews and comments.
     */
    private async eraseIn(tx: CmsDatabase, documents: ReadonlyArray<typeof cmsDocuments.$inferSelect>): Promise<void> {
        for (const existing of documents) {
            await tx.delete(cmsRefs).where(eq(cmsRefs.documentId, existing.id));
            await tx.delete(cmsVersions).where(eq(cmsVersions.documentId, existing.id));
            await tx.delete(cmsComments).where(eq(cmsComments.documentId, existing.id));
            await tx.delete(cmsReviews).where(eq(cmsReviews.documentId, existing.id));
            if (existing.locale !== SOURCE_LOCALE) await tx.delete(cmsTranslations).where(eq(cmsTranslations.documentId, existing.id));
            await tx.delete(cmsDocuments).where(eq(cmsDocuments.id, existing.id));
        }
    }

    private async latestVersionIn(tx: CmsDatabase, documentId: string): Promise<number> {
        const [row] = await tx
            .select({
                latest: max(cmsVersions.version),
            })
            .from(cmsVersions)
            .where(eq(cmsVersions.documentId, documentId));
        return Number(row?.latest ?? 0);
    }

    /**
     * Replaces the refs of a document's draft, or with `published` those of
     * its published content.
     */
    private async replaceRefsIn(tx: CmsDatabase, documentId: string, refs: readonly Ref[], published = false): Promise<void> {
        await tx.delete(cmsRefs).where(and(eq(cmsRefs.documentId, documentId), eq(cmsRefs.published, published)));
        if (refs.length === 0) return;
        await tx.insert(cmsRefs).values(
            refs.map((ref) => ({
                documentId,
                brand: ref.brand,
                refId: ref.refId,
                fieldPath: ref.fieldPath,
                published,
            }))
        );
    }

    /**
     * Publishing makes the draft the published content, so its refs become
     * the published refs too.
     */
    private async publishRefsIn(tx: CmsDatabase, documentId: string): Promise<void> {
        await tx.delete(cmsRefs).where(and(eq(cmsRefs.documentId, documentId), eq(cmsRefs.published, true)));
        await tx.execute(
            sql`insert into cms_refs (document_id, brand, ref_id, field_path, published) select document_id, brand, ref_id, field_path, true from cms_refs where document_id = ${documentId} and published = false`
        );
    }
}
