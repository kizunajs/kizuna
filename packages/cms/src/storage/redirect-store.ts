import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { actingAgent } from '../agents.js';
import { cmsRedirects, cmsRedirectVersions } from './schema.js';
import type { CmsDatabase } from './store.js';

/**
 * Where a redirect sends visitors: a page or an item by ref, wherever it is
 * served when the redirect is read, a path on the same site, or a URL.
 */
export type RedirectTarget =
    | {
          type: 'document';
          ref: string;
      }
    | {
          type: 'path';
          path: string;
      }
    | {
          type: 'url';
          url: string;
      };

/**
 * Who made a redirect: a rename on publish, an editor by hand, or an import.
 */
export type RedirectOrigin = 'rename' | 'manual' | 'import';

/**
 * `308` keeps an address moved for good, `307` for now. Both keep the
 * request's method, RFC 9110 sections 15.4.8 and 15.4.9.
 */
export type RedirectStatus = 307 | 308;

/**
 * One stored redirect of a site.
 */
export interface RedirectRow {
    id: string;
    site: string;
    /**
     * The language `from` is in, or `null` on a site without languages.
     */
    locale: string | null;
    /**
     * The whole path a visitor asks for, language prefix included.
     */
    from: string;
    to: RedirectTarget;
    status: RedirectStatus;
    origin: RedirectOrigin;
    createdBy: string;
    createdVia: string | null;
    createdAt: Date;
}

/**
 * One address a document is served at: a site, the language, and the path
 * with the language prefix.
 */
export interface PublishedAddress {
    site: string;
    locale: string | null;
    path: string;
}

/**
 * A redirect a publish writes.
 */
export interface NewRedirect {
    site: string;
    locale: string | null;
    from: string;
    to: RedirectTarget;
    status: RedirectStatus;
    origin: RedirectOrigin;
    createdBy: string;
}

/**
 * What a publish changes in the redirects, applied in its transaction.
 */
export interface RedirectChanges {
    /**
     * Redirects from the addresses a document left.
     */
    add: readonly NewRedirect[];
    /**
     * Addresses going live, whose redirects are removed after `add` is
     * written, so two items that swap addresses keep neither redirect.
     */
    live: readonly Omit<PublishedAddress, 'locale'>[];
    /**
     * Sites where a document's address changed, so what their redirects to
     * it answer changed too.
     */
    touch: readonly string[];
}

const targetOf = (type: string, value: string): RedirectTarget => {
    if (type === 'document') {
        return {
            type,
            ref: value,
        };
    }
    if (type === 'path') {
        return {
            type,
            path: value,
        };
    }
    return {
        type: 'url',
        url: value,
    };
};

const valueOf = (target: RedirectTarget): string =>
    target.type === 'document' ? target.ref : target.type === 'path' ? target.path : target.url;

const toRow = (row: typeof cmsRedirects.$inferSelect): RedirectRow => ({
    id: row.id,
    site: row.site,
    locale: row.locale,
    from: row.from,
    to: targetOf(row.toType, row.toValue),
    status: row.status as RedirectStatus,
    origin: row.origin as RedirectOrigin,
    createdBy: row.createdBy,
    createdVia: row.createdVia,
    createdAt: row.createdAt,
});

/**
 * Moves each site's redirects version on by one.
 */
const touchIn = async (tx: CmsDatabase, sites: Iterable<string>): Promise<void> => {
    for (const site of new Set(sites)) {
        await tx
            .insert(cmsRedirectVersions)
            .values({
                site,
                version: 1,
            })
            .onConflictDoUpdate({
                target: cmsRedirectVersions.site,
                set: {
                    version: sql`${cmsRedirectVersions.version} + 1`,
                },
            });
    }
};

/**
 * Writes a publish's redirects inside its transaction: the new ones first,
 * then the removal of every redirect from an address going live, then the
 * version of each site whose redirects changed.
 */
export const applyRedirectsIn = async (tx: CmsDatabase, changes: RedirectChanges): Promise<void> => {
    const touched = new Set(changes.touch);
    const now = new Date();
    for (const redirect of changes.add) {
        const written = {
            locale: redirect.locale,
            toType: redirect.to.type,
            toValue: valueOf(redirect.to),
            status: redirect.status,
            origin: redirect.origin,
            createdBy: redirect.createdBy,
            createdVia: actingAgent(),
            createdAt: now,
        };
        await tx
            .insert(cmsRedirects)
            .values({
                id: randomUUID(),
                site: redirect.site,
                from: redirect.from,
                ...written,
            })
            .onConflictDoUpdate({
                target: [cmsRedirects.site, cmsRedirects.from],
                set: written,
            });
        touched.add(redirect.site);
    }
    for (const address of changes.live) {
        const removed = await tx
            .delete(cmsRedirects)
            .where(and(eq(cmsRedirects.site, address.site), eq(cmsRedirects.from, address.path)))
            .returning({
                id: cmsRedirects.id,
            });
        if (removed.length > 0) touched.add(address.site);
    }
    await touchIn(tx, touched);
};

/**
 * The redirects, in their own table, and each site's redirects version.
 */
export class RedirectStore {
    constructor(private readonly db: CmsDatabase) {}

    /**
     * A site's redirects, by `from`.
     */
    async list(site: string): Promise<RedirectRow[]> {
        const rows = await this.db.select().from(cmsRedirects).where(eq(cmsRedirects.site, site)).orderBy(asc(cmsRedirects.from));
        return rows.map(toRow);
    }

    /**
     * A site's redirects version, `0` before its first change.
     */
    async version(site: string): Promise<number> {
        const [row] = await this.db.select().from(cmsRedirectVersions).where(eq(cmsRedirectVersions.site, site)).limit(1);
        return row?.version ?? 0;
    }

    /**
     * The sites holding a redirect to a document, by its ref.
     */
    async sitesTargeting(refs: readonly string[]): Promise<string[]> {
        if (refs.length === 0) return [];
        const rows = await this.db
            .selectDistinct({
                site: cmsRedirects.site,
            })
            .from(cmsRedirects)
            .where(and(eq(cmsRedirects.toType, 'document'), inArray(cmsRedirects.toValue, [...refs])));
        return rows.map((row) => row.site);
    }

    /**
     * Writes redirects in a transaction of their own, as a publish does in
     * its.
     */
    async apply(changes: RedirectChanges): Promise<void> {
        await this.db.transaction(async (tx) => applyRedirectsIn(tx as unknown as CmsDatabase, changes));
    }

    /**
     * Moves each site's redirects version on, for a change that leaves the
     * rows as they are but not what they answer, like an unpublished target.
     */
    async touch(sites: readonly string[]): Promise<void> {
        if (sites.length === 0) return;
        await this.db.transaction(async (tx) => touchIn(tx as unknown as CmsDatabase, sites));
    }

    // Editing: an editor's redirects, one at a time, from the editing routes.

    /**
     * Writes an editor's redirect, new without `id` and changed with it, and
     * points each redirect in `repoint` at its new target, then moves the
     * site's redirects version on, in one transaction. A changed redirect
     * keeps who made it and how.
     */
    async saveEdit(
        edit: Omit<NewRedirect, 'origin'> & {
            id?: string;
        },
        repoint: ReadonlyArray<{
            id: string;
            to: RedirectTarget;
        }>
    ): Promise<RedirectRow> {
        return this.db.transaction(async (tx) => {
            const written = {
                locale: edit.locale,
                from: edit.from,
                toType: edit.to.type,
                toValue: valueOf(edit.to),
                status: edit.status,
            };
            const [row] =
                edit.id === undefined
                    ? await tx
                          .insert(cmsRedirects)
                          .values({
                              id: randomUUID(),
                              site: edit.site,
                              ...written,
                              origin: 'manual',
                              createdBy: edit.createdBy,
                              createdVia: actingAgent(),
                              createdAt: new Date(),
                          })
                          .returning()
                    : await tx
                          .update(cmsRedirects)
                          .set(written)
                          .where(and(eq(cmsRedirects.site, edit.site), eq(cmsRedirects.id, edit.id)))
                          .returning();
            for (const each of repoint) {
                await tx
                    .update(cmsRedirects)
                    .set({
                        toType: each.to.type,
                        toValue: valueOf(each.to),
                    })
                    .where(and(eq(cmsRedirects.site, edit.site), eq(cmsRedirects.id, each.id)));
            }
            await touchIn(tx as unknown as CmsDatabase, [edit.site]);
            return toRow(row!);
        });
    }

    /**
     * Deletes one redirect of a site and moves its redirects version on.
     * Answers whether there was one.
     */
    async deleteEdit(site: string, id: string): Promise<boolean> {
        return this.db.transaction(async (tx) => {
            const removed = await tx
                .delete(cmsRedirects)
                .where(and(eq(cmsRedirects.site, site), eq(cmsRedirects.id, id)))
                .returning({
                    id: cmsRedirects.id,
                });
            if (removed.length > 0) await touchIn(tx as unknown as CmsDatabase, [site]);
            return removed.length > 0;
        });
    }

    // Importing: the rows of a CSV, from `kizuna cms import-redirects`.

    /**
     * Writes imported redirects of one site, and points each redirect in
     * `repoint` at its new target, then moves the site's redirects version
     * on, in one transaction.
     */
    async saveImport(
        site: string,
        imported: ReadonlyArray<Omit<NewRedirect, 'site' | 'origin'>>,
        repoint: ReadonlyArray<{
            id: string;
            to: RedirectTarget;
        }>
    ): Promise<void> {
        if (imported.length === 0 && repoint.length === 0) return;
        await this.db.transaction(async (tx) => {
            const now = new Date();
            for (const redirect of imported) {
                await tx.insert(cmsRedirects).values({
                    id: randomUUID(),
                    site,
                    locale: redirect.locale,
                    from: redirect.from,
                    toType: redirect.to.type,
                    toValue: valueOf(redirect.to),
                    status: redirect.status,
                    origin: 'import',
                    createdBy: redirect.createdBy,
                    createdVia: actingAgent(),
                    createdAt: now,
                });
            }
            for (const each of repoint) {
                await tx
                    .update(cmsRedirects)
                    .set({
                        toType: each.to.type,
                        toValue: valueOf(each.to),
                    })
                    .where(and(eq(cmsRedirects.site, site), eq(cmsRedirects.id, each.id)));
            }
            await touchIn(tx as unknown as CmsDatabase, [site]);
        });
    }
}
