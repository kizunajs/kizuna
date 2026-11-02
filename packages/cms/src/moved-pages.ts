import { and, desc, eq, isNotNull } from 'drizzle-orm';
import type { CmsService } from './cms.js';
import { formatRef, type DocumentRef } from './refs.js';
import { addressesOf, publishedCopy, renameChanges } from './redirects.js';
import { pageLiveAt } from './redirect-routes.js';
import { cmsDocuments, cmsVersions } from './storage/schema.js';
import { applyRedirectsIn, type PublishedAddress, type RedirectChanges } from './storage/redirect-store.js';
import type { CmsDatabase } from './storage/store.js';

/**
 * One address a page or an item left because its route moved in code: where
 * it last published, and where the code serves it now.
 */
export interface MovedAddress {
    ref: string;
    site: string;
    locale: string | null;
    from: string;
    to: string;
}

interface LastPublished {
    documentId: string;
    version: number;
    paths: PublishedAddress[];
}

/**
 * The paths each document last published at, by `kind`, `site` and `key`,
 * from the newest publish of its source or any of its translations.
 */
const lastPublishedPaths = async (db: CmsDatabase): Promise<Map<string, LastPublished>> => {
    const rows = await db
        .select({
            kind: cmsDocuments.kind,
            site: cmsDocuments.site,
            key: cmsDocuments.key,
            documentId: cmsVersions.documentId,
            version: cmsVersions.version,
            paths: cmsVersions.publishedPaths,
        })
        .from(cmsDocuments)
        .innerJoin(cmsVersions, and(eq(cmsVersions.documentId, cmsDocuments.id), eq(cmsVersions.version, cmsDocuments.publishedVersion)))
        .where(isNotNull(cmsVersions.publishedPaths))
        .orderBy(desc(cmsVersions.publishedAt));
    const found = new Map<string, LastPublished>();
    for (const row of rows) {
        const key = `${row.kind}\n${row.site}\n${row.key}`;
        if (found.has(key)) continue;
        found.set(key, {
            documentId: row.documentId,
            version: row.version,
            paths: row.paths as PublishedAddress[],
        });
    }
    return found;
};

interface Move {
    ref: DocumentRef;
    last: LastPublished;
    now: PublishedAddress[];
    changes: RedirectChanges;
}

const movesOf = async (cms: CmsService, author: string): Promise<Move[]> => {
    const last = await lastPublishedPaths(cms.options.db);
    const moves: Move[] = [];
    for (const { target, row } of await cms.declaredDocuments()) {
        if (row.kind === 'global') continue;
        const published = last.get(`${row.kind}\n${row.site}\n${row.key}`);
        if (published === undefined) continue;
        const now = await addressesOf(cms, target.ref, publishedCopy);
        const changes = renameChanges(target.ref, published.paths, now, author);
        const add = [];
        for (const redirect of changes.add) {
            // An address another page now serves stays that page's.
            if ((await pageLiveAt(cms, redirect.site, redirect.from)) === undefined) add.push(redirect);
        }
        if (add.length === 0) continue;
        moves.push({
            ref: target.ref,
            last: published,
            now,
            changes: {
                ...changes,
                add,
            },
        });
    }
    return moves;
};

const addressesMoved = (moves: readonly Move[]): MovedAddress[] =>
    moves.flatMap((move) =>
        move.changes.add.map((redirect) => ({
            ref: formatRef(move.ref),
            site: redirect.site,
            locale: redirect.locale,
            from: redirect.from,
            to: move.now.find((address) => address.site === redirect.site && address.locale === redirect.locale)?.path ?? redirect.from,
        }))
    );

/**
 * Every address a published page or item left because its path changed in
 * code since it last published, per site and language. An address another
 * page serves now is left out.
 */
export const movedAddresses = async (cms: CmsService, author: string): Promise<MovedAddress[]> =>
    addressesMoved(await movesOf(cms, author));

/**
 * Writes a `rename` redirect from each moved address to its document, and
 * records the addresses the code serves each one at on the version it last
 * published, so the next check finds the move handled. A redirect an editor
 * deletes later stays deleted.
 */
export const redirectMovedAddresses = async (cms: CmsService, author: string): Promise<MovedAddress[]> => {
    const moves = await movesOf(cms, author);
    if (moves.length === 0) return [];
    await cms.options.db.transaction(async (tx) => {
        const database = tx as unknown as CmsDatabase;
        for (const move of moves) {
            await applyRedirectsIn(database, move.changes);
            await database
                .update(cmsVersions)
                .set({
                    publishedPaths: move.now,
                })
                .where(and(eq(cmsVersions.documentId, move.last.documentId), eq(cmsVersions.version, move.last.version)));
        }
    });
    return addressesMoved(moves);
};
