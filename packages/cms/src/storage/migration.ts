/**
 * The tables the CMS owns, as `kizuna cms migrate` writes them into the app's
 * migrations folder. The CMS never runs DDL at startup.
 */
export const CMS_MIGRATION_SQL = `create table cms_documents (
    id text primary key,
    kind text not null,
    site text not null default 'default',
    locale text not null default 'default',
    key text not null,
    published jsonb,
    draft jsonb,
    published_version int,
    migration_version int not null default 0,
    updated_at timestamptz not null,
    updated_by text not null,
    constraint cms_documents_identity unique (kind, site, locale, key)
);

create table cms_versions (
    document_id text not null references cms_documents (id),
    version int not null,
    data jsonb not null,
    summary text,
    created_at timestamptz not null,
    created_by text not null,
    primary key (document_id, version)
);

create table cms_refs (
    document_id text not null references cms_documents (id),
    brand text not null,
    ref_id text not null,
    field_path text not null
);

create index cms_refs_lookup on cms_refs (brand, ref_id);
`;
