import { and, count, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { CmsHttpError, collectionCacheTag, documentCacheTag, pageCacheTag, type CmsService } from './cms.js';
import { DEFAULT_SITE } from './options.js';
import { formatRef, parseRef } from './refs.js';
import { cmsDocuments, cmsRefs, cmsReviewComments, cmsReviews, cmsVersions } from './storage/schema.js';
import type { CmsDatabase } from './storage/store.js';

/**
 * How many rows of each CMS table belong to some documents.
 */
export interface TableCounts {
    cms_documents: number;
    cms_versions: number;
    cms_refs: number;
    cms_reviews: number;
    cms_review_comments: number;
}

/**
 * The documents a site owns. Under `default` that is the pages of a project
 * with one site, since its globals, items and media are shared.
 */
const ownedBy = (site: string): SQL =>
    site === DEFAULT_SITE ? and(eq(cmsDocuments.site, site), eq(cmsDocuments.kind, 'page'))! : eq(cmsDocuments.site, site);

const countsOf = async (db: CmsDatabase, owned: SQL): Promise<TableCounts> => {
    const documents = db
        .select({
            id: cmsDocuments.id,
        })
        .from(cmsDocuments)
        .where(owned);
    const reviews = db
        .select({
            id: cmsReviews.id,
        })
        .from(cmsReviews)
        .where(inArray(cmsReviews.documentId, documents));
    const total = async (rows: Promise<Array<{ total: number }>>): Promise<number> => Number((await rows)[0]?.total ?? 0);
    return {
        cms_documents: await total(
            db
                .select({
                    total: count(),
                })
                .from(cmsDocuments)
                .where(owned)
        ),
        cms_versions: await total(
            db
                .select({
                    total: count(),
                })
                .from(cmsVersions)
                .where(inArray(cmsVersions.documentId, documents))
        ),
        cms_refs: await total(
            db
                .select({
                    total: count(),
                })
                .from(cmsRefs)
                .where(inArray(cmsRefs.documentId, documents))
        ),
        cms_reviews: await total(
            db
                .select({
                    total: count(),
                })
                .from(cmsReviews)
                .where(inArray(cmsReviews.documentId, documents))
        ),
        cms_review_comments: await total(
            db
                .select({
                    total: count(),
                })
                .from(cmsReviewComments)
                .where(inArray(cmsReviewComments.reviewId, reviews))
        ),
    };
};

/**
 * The cache tags a moved document's reads carry at its new site.
 */
const tagsAt = (kind: string, key: string, site: string): string[] => {
    if (kind === 'page') return [pageCacheTag(key, site)];
    if (kind === 'global') {
        return [
            documentCacheTag({
                type: 'global',
                name: key,
                site,
            }),
        ];
    }
    if (kind !== 'item') return [];
    const [collection = key, ...rest] = key.split('/');
    return [
        collectionCacheTag(collection, site),
        documentCacheTag({
            type: 'item',
            collection,
            id: rest.join('/'),
            site,
        }),
    ];
};

/**
 * Moves everything stored under one site key to another, in one
 * transaction: its pages, its own globals and items, and its values on
 * shared content, with their versions, refs, reviews and comments. Shared
 * content stays. Under `default` a site owns its pages alone, so
 * `renameSite(service, 'default', 'group')` gives a single-site project's
 * pages to the site `group`. Returns what moved, or with `dryRun` what would.
 */
export const renameSite = async (
    service: CmsService,
    from: string,
    to: string,
    options: {
        dryRun: boolean;
    }
): Promise<TableCounts> => {
    if (from === to) {
        throw new CmsHttpError(400, {
            detail: `'${from}' and '${to}' are the same site.`,
        });
    }
    if (service.sites[from] !== undefined) {
        throw new CmsHttpError(409, {
            detail:
                from === DEFAULT_SITE
                    ? 'The config declares no sites, so its pages are still read from default. Declare the sites with declareSites() first.'
                    : `'${from}' is still a declared site, so its content stays. Rename it in declareSites() first.`,
        });
    }
    if (service.sites[to] === undefined) {
        throw new CmsHttpError(404, {
            detail: `No site named '${to}'. Known: ${Object.keys(service.sites).join(', ')}. Declare it with declareSites() first.`,
        });
    }
    const db = service.options.db;
    const moved = await db.transaction(async (tx) => {
        const counts = await countsOf(tx, ownedBy(from));
        if (counts.cms_documents === 0) {
            throw new CmsHttpError(404, {
                detail: `Nothing is stored under '${from}'.`,
            });
        }
        const existing = await countsOf(tx, ownedBy(to));
        if (existing.cms_documents > 0) {
            throw new CmsHttpError(409, {
                detail: `'${to}' has content of its own. Delete it before moving '${from}' there.`,
            });
        }
        if (options.dryRun) {
            return {
                counts,
                documents: [],
            };
        }
        const documents = tx
            .select({
                id: cmsDocuments.id,
            })
            .from(cmsDocuments)
            .where(ownedBy(from));
        const reviews = await tx
            .select({
                id: cmsReviews.id,
                ref: cmsReviews.ref,
            })
            .from(cmsReviews)
            .where(inArray(cmsReviews.documentId, documents));
        for (const review of reviews) {
            const ref = parseRef(review.ref);
            if (ref === undefined) continue;
            await tx
                .update(cmsReviews)
                .set({
                    ref: formatRef({
                        ...ref,
                        site: to,
                    }),
                })
                .where(eq(cmsReviews.id, review.id));
        }
        const rekeyed = await tx
            .update(cmsDocuments)
            .set({
                site: to,
            })
            .where(ownedBy(from))
            .returning({
                kind: cmsDocuments.kind,
                key: cmsDocuments.key,
            });
        return {
            counts,
            documents: rekeyed,
        };
    });
    await service.revalidateTags([...new Set(moved.documents.flatMap((document) => tagsAt(document.kind, document.key, to)))]);
    return moved.counts;
};

/**
 * Content stored under a site key the config does not declare.
 */
export interface OrphanedSite {
    site: string;
    tables: TableCounts;
}

/**
 * A page or global stored under a site the config declares, that nothing
 * in the config claims anymore.
 */
export interface OrphanedDocument {
    ref: string;
    updatedAt: string;
    published: boolean;
}

/**
 * The items of a collection the config no longer declares.
 */
export interface OrphanedCollection {
    site: string;
    collection: string;
    items: number;
}

export interface Orphans {
    sites: OrphanedSite[];
    documents: OrphanedDocument[];
    collections: OrphanedCollection[];
}

/**
 * Stored content nothing in the config claims: everything under a site key
 * it does not declare, pages and globals it no longer has, and the items of
 * a collection it removed. When the config declares sites, the pages a
 * single-site project left under `default` count as a site of their own.
 */
export const orphansOf = async (service: CmsService): Promise<Orphans> => {
    const db = service.options.db;
    const stored = await db
        .selectDistinct({
            site: cmsDocuments.site,
        })
        .from(cmsDocuments)
        .orderBy(cmsDocuments.site);
    const unclaimed = stored.map((row) => row.site).filter((site) => service.sites[site] === undefined);
    const sites: OrphanedSite[] = [];
    for (const site of unclaimed) {
        const tables = await countsOf(db, ownedBy(site));
        if (tables.cms_documents > 0) {
            sites.push({
                site,
                tables,
            });
        }
    }
    const claimed = [...new Set([...Object.keys(service.sites), DEFAULT_SITE])];

    const documents: OrphanedDocument[] = [];
    const rows = await db
        .select({
            kind: cmsDocuments.kind,
            site: cmsDocuments.site,
            key: cmsDocuments.key,
            updatedAt: cmsDocuments.updatedAt,
            publishedVersion: cmsDocuments.publishedVersion,
        })
        .from(cmsDocuments)
        .where(and(inArray(cmsDocuments.kind, ['page', 'global']), inArray(cmsDocuments.site, claimed)))
        .orderBy(cmsDocuments.site, cmsDocuments.kind, cmsDocuments.key);
    for (const row of rows) {
        const pages = service.sites[row.site];
        // Pages under a default no site claims are listed with the sites.
        if (row.kind === 'page' && pages === undefined) continue;
        const kept =
            row.kind === 'page'
                ? pages?.[row.key] !== undefined
                : service.globals[row.key] !== undefined || service.siteGlobals[row.site]?.[row.key] !== undefined;
        if (kept) continue;
        documents.push({
            ref: formatRef({
                type: row.kind as 'page' | 'global',
                name: row.key,
                site: row.site,
            }),
            updatedAt: row.updatedAt.toISOString(),
            published: row.publishedVersion !== null,
        });
    }

    const collection = sql<string>`split_part(${cmsDocuments.key}, '/', 1)`;
    const listed = await db
        .select({
            site: cmsDocuments.site,
            collection,
            items: count(),
        })
        .from(cmsDocuments)
        .where(and(eq(cmsDocuments.kind, 'item'), inArray(cmsDocuments.site, claimed)))
        .groupBy(cmsDocuments.site, collection)
        .orderBy(cmsDocuments.site, collection);
    const collections = listed
        .filter(
            (row) => service.collections[row.collection] === undefined && service.siteCollections[row.site]?.[row.collection] === undefined
        )
        .map((row) => ({
            site: row.site,
            collection: row.collection,
            items: Number(row.items),
        }));

    return {
        sites,
        documents,
        collections,
    };
};
