import { createHash } from 'node:crypto';
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
    published_at timestamptz,
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
