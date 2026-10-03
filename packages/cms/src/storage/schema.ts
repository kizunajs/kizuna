import { integer, jsonb, pgTable, primaryKey, text, timestamp, unique, index } from 'drizzle-orm/pg-core';

/**
 * One document: a page, a global, an item of a collection, or a media item. `site` and `locale` are fixed to
 * `default` in v1 and exist so later features need no data migration.
 */
export const cmsDocuments = pgTable(
    'cms_documents',
    {
        id: text('id').primaryKey(),
        kind: text('kind').notNull(),
        site: text('site').notNull().default('default'),
        locale: text('locale').notNull().default('default'),
        key: text('key').notNull(),
        published: jsonb('published'),
        draft: jsonb('draft'),
        publishedVersion: integer('published_version'),
        publishedAt: timestamp('published_at', {
            withTimezone: true,
            mode: 'date',
        }),
        migrationVersion: integer('migration_version').notNull().default(0),
        updatedAt: timestamp('updated_at', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
        updatedBy: text('updated_by').notNull(),
        /**
         * The person who looks after the document, by the id `people` gives them.
         */
        owner: text('owner'),
    },
    (table) => [unique('cms_documents_identity').on(table.kind, table.site, table.locale, table.key)]
);

/**
 * Every save of a document, with who made it, what they said about it, the
 * migration step its data is at, and when it went live, if it did.
 */
export const cmsVersions = pgTable(
    'cms_versions',
    {
        documentId: text('document_id')
            .notNull()
            .references(() => cmsDocuments.id),
        version: integer('version').notNull(),
        data: jsonb('data').notNull(),
        summary: text('summary'),
        createdAt: timestamp('created_at', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
        createdBy: text('created_by').notNull(),
        migrationVersion: integer('migration_version').notNull().default(0),
        publishedAt: timestamp('published_at', {
            withTimezone: true,
            mode: 'date',
        }),
    },
    (table) => [
        primaryKey({
            columns: [table.documentId, table.version],
        }),
    ]
);

/**
 * Which branded ids each document holds, rebuilt on every save. An index, never
 * the source of truth.
 */
export const cmsRefs = pgTable(
    'cms_refs',
    {
        documentId: text('document_id')
            .notNull()
            .references(() => cmsDocuments.id),
        brand: text('brand').notNull(),
        refId: text('ref_id').notNull(),
        fieldPath: text('field_path').notNull(),
    },
    (table) => [index('cms_refs_lookup').on(table.brand, table.refId)]
);

/**
 * A request for someone to look at a document's draft before it goes live,
 * and their answer. Documents asked about together share a `requestId`.
 */
export const cmsReviews = pgTable(
    'cms_reviews',
    {
        id: text('id').primaryKey(),
        requestId: text('request_id').notNull(),
        ref: text('ref').notNull(),
        documentId: text('document_id')
            .notNull()
            .references(() => cmsDocuments.id),
        version: integer('version').notNull(),
        reviewers: jsonb('reviewers').notNull(),
        requestedBy: text('requested_by').notNull(),
        note: text('note'),
        createdAt: timestamp('created_at', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
        status: text('status').notNull(),
        decidedBy: text('decided_by'),
        decisionNote: text('decision_note'),
        decidedAt: timestamp('decided_at', {
            withTimezone: true,
            mode: 'date',
        }),
    },
    (table) => [index('cms_reviews_document').on(table.documentId, table.createdAt)]
);
