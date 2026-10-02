import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, max, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { cmsDocuments, cmsRefs, cmsVersions } from './schema.js';
import { CMS_MIGRATION_SQL, likePrefix, type IndexType } from './migration.js';

/**
 * Any Drizzle Postgres database: node-postgres, postgres.js, Neon, PGlite.
 */
export type CmsDatabase = PgDatabase<PgQueryResultHKT, any, any>;

/**
 * What a document is: a page, a global, an item of a collection, or a media
 * item's metadata.
 */
export type DocumentKind = 'page' | 'global' | 'item' | 'media';

/**
 * Content as stored: one value per field.
 */
export type Content = Record<string, unknown>;

export interface DocumentRow {
    id: string;
    kind: DocumentKind;
    /**
     * The site a page belongs to; `default` for everything else.
     */
    site: string;
    key: string;
    published: Content | null;
    draft: Content | null;
    publishedVersion: number | null;
    publishedAt: Date | null;
    migrationVersion: number;
    updatedAt: Date;
    updatedBy: string;
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
     * `published` lists published documents only; `draft` lists every document
     * by its draft where it has one.
     */
    copy: 'published' | 'draft';
    where?: ReadonlyArray<ListField & { value: unknown }>;
    orderBy?: ListField | 'publishedAt' | 'updatedAt';
    direction?: 'asc' | 'desc';
    limit: number;
    cursor?: string;
}

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
}

export interface VersionWithData extends VersionRow {
    data: Content;
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

const SITE = 'default';
const LOCALE = 'default';

const identity = (kind: DocumentKind, key: string, site = SITE) =>
    and(eq(cmsDocuments.kind, kind), eq(cmsDocuments.site, site), eq(cmsDocuments.locale, LOCALE), eq(cmsDocuments.key, key));

const toRow = (row: typeof cmsDocuments.$inferSelect): DocumentRow => ({
    id: row.id,
    kind: row.kind as DocumentKind,
    site: row.site,
    key: row.key,
    published: row.published as Content | null,
    draft: row.draft as Content | null,
    publishedVersion: row.publishedVersion,
    publishedAt: row.publishedAt,
    migrationVersion: row.migrationVersion,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
});

/**
 * The three tables the CMS owns, read and written through the app's Drizzle
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

    async get(kind: DocumentKind, key: string, site = SITE): Promise<DocumentRow | undefined> {
        const [row] = await this.db
            .select()
            .from(cmsDocuments)
            .where(identity(kind, key, site))
            .limit(1);
        return row === undefined ? undefined : toRow(row);
    }

    async getById(id: string): Promise<DocumentRow | undefined> {
        const [row] = await this.db.select().from(cmsDocuments).where(eq(cmsDocuments.id, id)).limit(1);
        return row === undefined ? undefined : toRow(row);
    }

    async list(kind: DocumentKind): Promise<DocumentRow[]> {
        const rows = await this.db.select().from(cmsDocuments).where(eq(cmsDocuments.kind, kind)).orderBy(asc(cmsDocuments.key));
        return rows.map(toRow);
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
            data: row.data as Content,
        };
    }

    /**
     * Writes the draft and records a version. `ifMatch` is the version and save
     * time the writer read; when either is behind, nothing is written. With
     * `fold`, a save by the same author within that many milliseconds of their
     * own unpublished version rewrites it instead of adding one.
     */
    async saveDraft(input: {
        kind: DocumentKind;
        key: string;
        site?: string;
        draft: Content;
        author: string;
        summary?: string;
        ifMatch?: {
            version: number;
            savedAt?: number;
        };
        fold?: number;
        refs?: readonly Ref[];
        migrationVersion?: number;
    }): Promise<{ document: DocumentRow; version: number }> {
        return this.db.transaction(async (tx) => {
            const now = new Date();
            const [existing] = await tx
                .select()
                .from(cmsDocuments)
                .where(identity(input.kind, input.key, input.site))
                .for('update');
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
            const [previous] =
                input.fold === undefined || existing === undefined || existing.publishedVersion === latest
                    ? []
                    : await tx
                          .select()
                          .from(cmsVersions)
                          .where(and(eq(cmsVersions.documentId, id), eq(cmsVersions.version, latest)))
                          .limit(1);
            const folds =
                previous !== undefined && previous.createdBy === input.author && now.getTime() - previous.createdAt.getTime() < input.fold!;
            const version = folds ? latest : latest + 1;
            if (existing === undefined) {
                await tx.insert(cmsDocuments).values({
                    id,
                    kind: input.kind,
                    site: input.site ?? SITE,
                    key: input.key,
                    draft: input.draft,
                    migrationVersion: input.migrationVersion ?? 0,
                    updatedAt: now,
                    updatedBy: input.author,
                });
            } else {
                await tx
                    .update(cmsDocuments)
                    .set({
                        draft: input.draft,
                        updatedAt: now,
                        updatedBy: input.author,
                        ...(input.migrationVersion === undefined
                            ? {}
                            : {
                                  migrationVersion: input.migrationVersion,
                              }),
                    })
                    .where(eq(cmsDocuments.id, id));
            }
            if (folds) {
                await tx
                    .update(cmsVersions)
                    .set({
                        data: input.draft,
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
    async publish(kind: DocumentKind, key: string, author: string, site = SITE): Promise<DocumentRow | undefined> {
        return this.db.transaction(async (tx) => {
            const [existing] = await tx
                .select()
                .from(cmsDocuments)
                .where(identity(kind, key, site))
                .for('update');
            if (existing === undefined || existing.draft === null) return undefined;
            const latest = await this.latestVersionIn(tx, existing.id);
            await tx
                .update(cmsDocuments)
                .set({
                    published: existing.draft,
                    publishedVersion: latest,
                    publishedAt: new Date(),
                    updatedAt: new Date(),
                    updatedBy: author,
                })
                .where(eq(cmsDocuments.id, existing.id));
            const [row] = await tx.select().from(cmsDocuments).where(eq(cmsDocuments.id, existing.id)).limit(1);
            return toRow(row!);
        });
    }

    /**
     * Writes a migrated document: both copies, the step it reached, and one
     * version recording the result.
     */
    async saveMigrated(input: {
        id: string;
        published: Content | null;
        draft: Content | null;
        migrationVersion: number;
        author: string;
        refs: readonly Ref[];
    }): Promise<DocumentRow> {
        return this.db.transaction(async (tx) => {
            const now = new Date();
            const latest = await this.latestVersionIn(tx, input.id);
            await tx
                .update(cmsDocuments)
                .set({
                    published: input.published,
                    draft: input.draft,
                    migrationVersion: input.migrationVersion,
                    ...(input.published === null
                        ? {}
                        : {
                              publishedVersion: latest + 1,
                          }),
                    updatedAt: now,
                    updatedBy: input.author,
                })
                .where(eq(cmsDocuments.id, input.id));
            await tx.insert(cmsVersions).values({
                documentId: input.id,
                version: latest + 1,
                data: input.draft ?? input.published ?? {},
                summary: `Migrated to version ${input.migrationVersion}`,
                createdAt: now,
                createdBy: input.author,
            });
            await this.replaceRefsIn(tx, input.id, input.refs);
            const [row] = await tx.select().from(cmsDocuments).where(eq(cmsDocuments.id, input.id)).limit(1);
            return toRow(row!);
        });
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
            .where(and(eq(cmsRefs.brand, brand), eq(cmsRefs.refId, refId)))
            .orderBy(asc(cmsDocuments.key), asc(cmsRefs.fieldPath));
        const byId = new Map<string, DocumentRow & { fieldPaths: string[] }>();
        for (const row of rows) {
            const held = byId.get(row.document.id);
            if (held) {
                held.fieldPaths.push(row.fieldPath);
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
    async saveMedia(key: string, data: Content, author: string): Promise<DocumentRow> {
        return this.db.transaction(async (tx) => {
            const now = new Date();
            const [existing] = await tx.select().from(cmsDocuments).where(identity('media', key)).for('update');
            const id = existing?.id ?? randomUUID();
            const latest = existing === undefined ? 0 : await this.latestVersionIn(tx, id);
            if (existing === undefined) {
                await tx.insert(cmsDocuments).values({
                    id,
                    kind: 'media',
                    key,
                    published: data,
                    publishedVersion: latest + 1,
                    updatedAt: now,
                    updatedBy: author,
                });
            } else {
                await tx
                    .update(cmsDocuments)
                    .set({
                        published: data,
                        publishedVersion: latest + 1,
                        updatedAt: now,
                        updatedBy: author,
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
            sql`${cmsDocuments.key} like ${likePrefix(input.keyPrefix)}`,
            input.copy === 'published'
                ? sql`${cmsDocuments.published} is not null`
                : sql`(${cmsDocuments.draft} is not null or ${cmsDocuments.published} is not null)`,
            ...(input.where ?? []).map((filter) => sql`${read(filter)} = ${filter.type === 'text' ? String(filter.value) : filter.value}`),
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
     * Removes a document with its versions and references.
     */
    async delete(kind: DocumentKind, key: string, site = SITE): Promise<boolean> {
        return this.db.transaction(async (tx) => {
            const [existing] = await tx
                .select()
                .from(cmsDocuments)
                .where(identity(kind, key, site))
                .for('update');
            if (existing === undefined) return false;
            await tx.delete(cmsRefs).where(eq(cmsRefs.documentId, existing.id));
            await tx.delete(cmsVersions).where(eq(cmsVersions.documentId, existing.id));
            await tx.delete(cmsDocuments).where(eq(cmsDocuments.id, existing.id));
            return true;
        });
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

    private async replaceRefsIn(tx: CmsDatabase, documentId: string, refs: readonly Ref[]): Promise<void> {
        await tx.delete(cmsRefs).where(eq(cmsRefs.documentId, documentId));
        if (refs.length === 0) return;
        await tx.insert(cmsRefs).values(
            refs.map((ref) => ({
                documentId,
                brand: ref.brand,
                refId: ref.refId,
                fieldPath: ref.fieldPath,
            }))
        );
    }
}
