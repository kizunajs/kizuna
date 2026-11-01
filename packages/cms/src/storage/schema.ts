import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, index } from 'drizzle-orm/pg-core';

/**
 * One document: a page, a global, an item of a collection, or a media item.
 * `site` is `default` for shared content, and `locale` is `default` for the
 * source and a language code for a translation of it.
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
         * The agent that made the last change for `updatedBy`, like `Claude`.
         */
        updatedVia: text('updated_via'),
        /**
         * The person who looks after the document, by the id `people` gives them.
         */
        owner: text('owner'),
        /**
         * Who edits the document now, by the id `author` gives them, until
         * `heldUntil`. Anyone else's write is refused while it lasts.
         */
        heldBy: text('held_by'),
        heldSince: timestamp('held_since', {
            withTimezone: true,
            mode: 'date',
        }),
        heldUntil: timestamp('held_until', {
            withTimezone: true,
            mode: 'date',
        }),
        /**
         * When the document went to the trash, or `null` while it is live.
         * A trashed document keeps its key, so nothing else takes it.
         */
        trashedAt: timestamp('trashed_at', {
            withTimezone: true,
            mode: 'date',
        }),
        trashedBy: text('trashed_by'),
        /**
         * The id of the document whose delete took this one to the trash:
         * its own for the one deleted, and that one's for the items under it
         * in a tree, its translations and each site's values on it.
         */
        trashedWith: text('trashed_with'),
    },
    (table) => [
        unique('cms_documents_identity').on(table.kind, table.site, table.locale, table.key),
        index('cms_documents_trash').on(table.trashedWith),
    ]
);

/**
 * The source version each translated field of a translation was written
 * from, by field name.
 */
export const cmsTranslations = pgTable('cms_translations', {
    documentId: text('document_id').primaryKey(),
    sourceVersions: jsonb('source_versions').notNull(),
});

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
        /**
         * The agent that saved it for `createdBy`, like `Claude`.
         */
        via: text('via'),
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
 * Which branded ids and images each document holds, in its draft and, with
 * `published`, in its published content. Rebuilt on every save and publish. An
 * index, never the source of truth.
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
        published: boolean('published').notNull().default(false),
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
        /**
         * The agent that asked for `requestedBy`, like `Claude`.
         */
        requestedVia: text('requested_via'),
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

/**
 * A comment on one field of a document's draft, until someone resolves it.
 * It may quote a phrase of the field's text, start a thread or answer one,
 * mention people and name someone to deal with it. A comment left in a
 * review carries the review.
 */
export const cmsComments = pgTable(
    'cms_comments',
    {
        id: text('id').primaryKey(),
        documentId: text('document_id')
            .notNull()
            .references(() => cmsDocuments.id),
        reviewId: text('review_id').references(() => cmsReviews.id),
        path: text('path').notNull(),
        text: text('text').notNull(),
        createdBy: text('created_by').notNull(),
        createdAt: timestamp('created_at', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
        resolvedBy: text('resolved_by'),
        resolvedAt: timestamp('resolved_at', {
            withTimezone: true,
            mode: 'date',
        }),
        /**
         * The comment that starts the thread this one answers.
         */
        replyTo: text('reply_to'),
        /**
         * The phrase of the field's text the comment is about.
         */
        anchor: text('anchor'),
        mentions: jsonb('mentions').notNull().default([]),
        assignee: text('assignee'),
        /**
         * The agent that wrote it for `createdBy`, like `Claude`.
         */
        via: text('via'),
    },
    (table) => [
        index('cms_comments_review').on(table.reviewId, table.createdAt),
        index('cms_comments_document').on(table.documentId, table.createdAt),
    ]
);

/**
 * One site's or partner's refresh after a document published, unpublished or
 * was deleted, and how it went. One publish adds a row per target under one
 * `batch`.
 */
export const cmsRefreshes = pgTable(
    'cms_refreshes',
    {
        id: text('id').primaryKey(),
        batch: text('batch').notNull(),
        ref: text('ref').notNull(),
        target: text('target').notNull(),
        /**
         * What the call names, like `OfficeId:k3j9x2` or `global:footer`.
         */
        subject: text('subject').notNull(),
        status: text('status').notNull(),
        attempts: integer('attempts').notNull().default(0),
        createdAt: timestamp('created_at', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
        updatedAt: timestamp('updated_at', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
    },
    (table) => [
        index('cms_refreshes_subject').on(table.target, table.subject),
        index('cms_refreshes_ref').on(table.ref, table.createdAt),
        index('cms_refreshes_updated').on(table.updatedAt),
    ]
);

/**
 * A named set of drafts that publish together, at `at` or by hand.
 */
export const cmsReleases = pgTable('cms_releases', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    at: timestamp('at', {
        withTimezone: true,
        mode: 'date',
    }),
    /**
     * `open`, `running` or `published`.
     */
    status: text('status').notNull(),
    force: boolean('force').notNull().default(false),
    createdBy: text('created_by').notNull(),
    /**
     * The agent that made it for `createdBy`, like `Claude`.
     */
    createdVia: text('created_via'),
    createdAt: timestamp('created_at', {
        withTimezone: true,
        mode: 'date',
    }).notNull(),
    scheduledBy: text('scheduled_by'),
    publishedAt: timestamp('published_at', {
        withTimezone: true,
        mode: 'date',
    }),
    publishedBy: text('published_by'),
});

/**
 * One document set to publish or unpublish: at its own `at`, or with its
 * release. A done row keeps the version it published.
 */
export const cmsSchedules = pgTable(
    'cms_schedules',
    {
        id: text('id').primaryKey(),
        ref: text('ref').notNull(),
        documentId: text('document_id').notNull(),
        /**
         * `publish` or `unpublish`.
         */
        action: text('action').notNull(),
        at: timestamp('at', {
            withTimezone: true,
            mode: 'date',
        }),
        releaseId: text('release_id').references(() => cmsReleases.id),
        force: boolean('force').notNull().default(false),
        /**
         * `scheduled`, `running`, `done` or `cancelled`.
         */
        status: text('status').notNull(),
        createdBy: text('created_by').notNull(),
        createdAt: timestamp('created_at', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
        ranAt: timestamp('ran_at', {
            withTimezone: true,
            mode: 'date',
        }),
        ranVersion: integer('ran_version'),
    },
    (table) => [index('cms_schedules_due').on(table.status, table.at), index('cms_schedules_release').on(table.releaseId)]
);
