import { createHash } from 'node:crypto';
/**
 * The tables the CMS owns, as `kizuna cms migrate` writes them into the app's
 * migrations folder. The CMS never runs DDL at startup. Every statement may run
 * again, so a later migration brings an older database up to date.
 */
export const CMS_MIGRATION_SQL = `create table if not exists cms_documents (
    id text primary key,
    kind text not null,
    site text not null default 'default',
    locale text not null default 'default',
    key text not null,
    published jsonb,
    draft jsonb,
    published_version int,
    published_at timestamptz,
    migration_version int not null default 0,
    updated_at timestamptz not null,
    updated_by text not null,
    constraint cms_documents_identity unique (kind, site, locale, key)
);

create table if not exists cms_versions (
    document_id text not null references cms_documents (id),
    version int not null,
    data jsonb not null,
    summary text,
    created_at timestamptz not null,
    created_by text not null,
    migration_version int not null default 0,
    published_at timestamptz,
    primary key (document_id, version)
);

create table if not exists cms_refs (
    document_id text not null references cms_documents (id),
    brand text not null,
    ref_id text not null,
    field_path text not null
);

create index if not exists cms_refs_lookup on cms_refs (brand, ref_id);

alter table cms_refs add column if not exists published boolean not null default false;

alter table cms_documents add column if not exists owner text;

alter table cms_documents add column if not exists held_by text;
alter table cms_documents add column if not exists held_since timestamptz;
alter table cms_documents add column if not exists held_until timestamptz;

alter table cms_documents add column if not exists trashed_at timestamptz;
alter table cms_documents add column if not exists trashed_by text;
alter table cms_documents add column if not exists trashed_with text;

create index if not exists cms_documents_trash on cms_documents (trashed_with);

create table if not exists cms_reviews (
    id text primary key,
    request_id text not null,
    ref text not null,
    document_id text not null references cms_documents (id),
    version int not null,
    reviewers jsonb not null,
    requested_by text not null,
    note text,
    created_at timestamptz not null,
    status text not null,
    decided_by text,
    decision_note text,
    decided_at timestamptz
);

create index if not exists cms_reviews_document on cms_reviews (document_id, created_at);

update cms_reviews set status = 'published-past-review', decision_note = null where status = 'approved' and decision_note like 'Published past the review by %';

alter table if exists cms_review_comments rename to cms_comments;

alter index if exists cms_review_comments_review rename to cms_comments_review;

create table if not exists cms_comments (
    id text primary key,
    document_id text references cms_documents (id),
    review_id text references cms_reviews (id),
    path text not null,
    text text not null,
    created_by text not null,
    created_at timestamptz not null,
    resolved_by text,
    resolved_at timestamptz
);

alter table cms_comments add column if not exists document_id text references cms_documents (id);
update cms_comments set document_id = (select document_id from cms_reviews where cms_reviews.id = cms_comments.review_id) where document_id is null;
alter table cms_comments alter column document_id set not null;
alter table cms_comments alter column review_id drop not null;
alter table cms_comments add column if not exists reply_to text;
alter table cms_comments add column if not exists anchor text;
alter table cms_comments add column if not exists mentions jsonb not null default '[]';
alter table cms_comments add column if not exists assignee text;
alter table cms_comments add column if not exists via text;

create index if not exists cms_comments_review on cms_comments (review_id, created_at);

create index if not exists cms_comments_document on cms_comments (document_id, created_at);

create table if not exists cms_refreshes (
    id text primary key,
    batch text not null,
    ref text not null,
    target text not null,
    subject text not null,
    status text not null,
    attempts int not null default 0,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create index if not exists cms_refreshes_subject on cms_refreshes (target, subject);

create index if not exists cms_refreshes_ref on cms_refreshes (ref, created_at);

create index if not exists cms_refreshes_updated on cms_refreshes (updated_at);

create table if not exists cms_translations (
    document_id text primary key,
    source_versions jsonb not null
);

create table if not exists cms_releases (
    id text primary key,
    name text not null,
    at timestamptz,
    status text not null,
    force boolean not null default false,
    created_by text not null,
    created_at timestamptz not null,
    scheduled_by text,
    published_at timestamptz,
    published_by text
);

create table if not exists cms_schedules (
    id text primary key,
    ref text not null,
    document_id text not null,
    action text not null,
    at timestamptz,
    release_id text references cms_releases (id),
    force boolean not null default false,
    status text not null,
    created_by text not null,
    created_at timestamptz not null,
    ran_at timestamptz,
    ran_version int
);

create unique index if not exists cms_schedules_one on cms_schedules (document_id) where status in ('scheduled', 'running');

create index if not exists cms_schedules_due on cms_schedules (status, at);

create index if not exists cms_schedules_release on cms_schedules (release_id);

alter table cms_documents add column if not exists updated_via text;
alter table cms_versions add column if not exists via text;
alter table cms_reviews add column if not exists requested_via text;
alter table cms_releases add column if not exists created_via text;
`;

/**
 * How an indexed field is read out of a document for filtering and sorting.
 */
export type IndexType = 'text' | 'numeric' | 'boolean';

export interface IndexedField {
    kind: string;
    keyPrefix: string;
    field: string;
    type: IndexType;
}

/**
 * A key prefix as a `LIKE` pattern. A route folder like `[campaign_slug]`
 * holds `_`, which `LIKE` reads as any character.
 */
export const likePrefix = (prefix: string): string => `${prefix.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;

const indexName = (index: IndexedField): string => {
    const name = `cms_index_${index.keyPrefix.replace(/[^A-Za-z0-9]+/g, '_')}_${index.field}`
        .toLowerCase()
        .replace(/_+/g, '_')
        .replace(/_$/, '');
    // Postgres cuts names past 63 bytes, and two cut names would collide.
    return name.length <= 52 ? name : `${name.slice(0, 43)}_${createHash('sha256').update(name).digest('hex').slice(0, 8)}`;
};

const COPIES: Array<'published' | 'draft'> = ['published', 'draft'];

/**
 * One expression index per indexed field, over both the published and the
 * draft copy, scoped to the documents of that collection.
 */
export const indexSql = (indexes: readonly IndexedField[]): string =>
    indexes
        .flatMap((index) =>
            COPIES.map((copy) => {
                const expression =
                    index.type === 'text' ? `(${copy} ->> '${index.field}')` : `((${copy} ->> '${index.field}')::${index.type})`;
                return `create index if not exists ${indexName(index)}_${copy} on cms_documents (${expression}) where kind = '${index.kind}' and key like '${likePrefix(index.keyPrefix).replace(/'/g, "''")}';`;
            })
        )
        .join('\n');
