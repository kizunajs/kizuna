import { z } from 'zod';
import { Kizuna, cron } from 'kizunajs';
import { CmsHttpError, type CmsService, type Listing } from './cms.js';
import { IMAGE_BRAND } from './content.js';
import { DEFAULT_SITE, type Person } from './options.js';
import { formatRef, type DocumentRef } from './refs.js';
import { queueRefreshes } from './refresh.js';
import { documentLabel, viewOf, type PersonView } from './reviews.js';
import { SOURCE_LOCALE, type DocumentRow } from './storage/store.js';
import { descendantsOf, loadParents, parentIn } from './tree.js';
import { PersonSchema } from './wire.js';
import { TRASH_DAYS } from './trash-window.js';
import { contentEvent, fireContentEvents } from './content-events.js';
import { touchTargets } from './redirects.js';

export { TRASH_DAYS };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One delete in the trash, as an editor reads it.
 */
export interface TrashEntryView {
    ref: string;
    collection: string;
    id: string;
    label: string;
    deletedAt: string;
    deletedBy: PersonView;
    /**
     * When the daily job deletes it for good.
     */
    erasedAt: string;
    /**
     * How many items under it in a tree went with it.
     */
    under: number;
    /**
     * Whether it was published, and so comes back published.
     */
    published: boolean;
}

export const TrashSchema = Kizuna.model({
    title: 'CMS.Trash',
    schema: z.object({
        days: z.int().describe('How many days a delete waits in the trash before it is deleted for good.'),
        items: z
            .array(
                z.object({
                    ref: z.string(),
                    collection: z.string(),
                    id: z.string(),
                    label: z.string(),
                    deletedAt: z.iso.datetime(),
                    deletedBy: PersonSchema,
                    erasedAt: z.iso.datetime().describe('When it is deleted for good.'),
                    under: z.int().describe('How many items under it in a tree went to the trash with it, and come back with it.'),
                    published: z.boolean().describe('Whether it was published, and so comes back published.'),
                })
            )
            .describe('Each item deleted, newest first.'),
    }),
});

const keyOf = (listing: Listing, id: string): string => `${listing.keyPrefix}${id}`;

const idOf = (listing: Listing, row: DocumentRow): string => row.key.slice(listing.keyPrefix.length);

/**
 * Moves an item to the trash, with every item under it in a tree, their
 * translations and, for a shared item, each site's values on it. Its address
 * stops answering, and the sites that showed it refresh.
 */
export const trashItem = async (cms: CmsService, name: string, id: string, site: string, by: string): Promise<void> => {
    const listing = cms.listing(name, site);
    const under =
        listing.definition.tree === undefined
            ? []
            : [...descendantsOf(await loadParents(cms, listing, 'latest'), id)].filter((each) => each !== id);
    const refs = [id, ...under].map((each) => listing.refOf(each));
    const showing = await Promise.all(refs.map((ref) => cms.sitesShowing(ref, ['published'])));
    const root = await cms.store.trash({
        kind: 'item',
        root: keyOf(listing, id),
        keys: under.map((each) => keyOf(listing, each)),
        site: listing.site,
        everySite: listing.site === DEFAULT_SITE,
        by,
    });
    if (root === undefined) throw new CmsHttpError(404, { detail: `There is no item '${id}' in '${listing.name}'.` });
    for (const row of await cms.store.trashedWith(root.id)) await cms.schedules.endFor(row.id);
    await touchTargets(cms, refs);
    for (const [index, ref] of refs.entries()) {
        await cms.revalidateDocument(ref, showing[index]);
        await queueRefreshes(cms, ref, showing[index]);
    }
    await fireContentEvents(
        cms,
        refs.map((ref) => contentEvent(cms, cms.target(ref), 'trashed', by))
    );
};

/**
 * The delete an item went to the trash with, refused when it is not there
 * or went with the item above it in a tree.
 */
const entryOf = async (cms: CmsService, listing: Listing, id: string): Promise<DocumentRow> => {
    const root = await cms.store.trashed('item', keyOf(listing, id), listing.site);
    if (root === undefined) throw new CmsHttpError(404, { detail: `There is no item '${id}' of '${listing.name}' in the trash.` });
    if (root.trashedWith === root.id) return root;
    const deleted = (await cms.store.trashedWith(root.trashedWith!)).find(
        (row) => row.locale === SOURCE_LOCALE && row.site === listing.site
    );
    throw new CmsHttpError(409, {
        detail: `Item '${id}' went to the trash with '${deleted === undefined ? root.trashedWith : idOf(listing, deleted)}', which sits above it. Restore or delete that one.`,
    });
};

/**
 * The items one delete took to the trash in its own collection, the deleted
 * one first: their sources, without translations or each site's values.
 */
const itemsOf = async (cms: CmsService, listing: Listing, root: DocumentRow): Promise<DocumentRow[]> => {
    const branch = (await cms.store.trashedWith(root.id)).filter(
        (row) => row.locale === SOURCE_LOCALE && row.site === listing.site && row.key.startsWith(listing.keyPrefix)
    );
    return [root, ...branch.filter((row) => row.id !== root.id)];
};

/**
 * Brings an item back from the trash as it was, with what went with it: a
 * published item comes back published, and a draft as a draft. Refused
 * while the item above it in a tree is in the trash, or when another item
 * now has its address.
 */
export const restoreItem = async (cms: CmsService, name: string, id: string, site: string, by: string): Promise<void> => {
    const listing = cms.listing(name, site);
    const root = await entryOf(cms, listing, id);
    const items = await itemsOf(cms, listing, root);
    const tree = listing.definition.tree;
    const latest = cms.migrated(cms.target(listing.refOf(id)), root)!;
    const parent = tree === undefined ? undefined : parentIn(latest.draft ?? latest.published, tree);
    if (parent !== undefined) {
        const above = await cms.store.trashed('item', keyOf(listing, parent), listing.site);
        if (above !== undefined) {
            throw new CmsHttpError(409, {
                detail: `Item '${id}' sits under '${parent}', which is in the trash. Restore '${parent}' first.`,
            });
        }
    }
    for (const row of items) {
        const migrated = cms.migrated(cms.target(listing.refOf(idOf(listing, row))), row)!;
        for (const content of [migrated.draft, migrated.published]) {
            if (content !== null) await cms.assertFreeAddress(listing, row.key, content);
        }
    }
    await cms.store.restore(root.id, IMAGE_BRAND);
    await touchTargets(
        cms,
        items.map((row) => listing.refOf(idOf(listing, row)))
    );
    for (const row of items) {
        if (row.published === null) continue;
        const ref = listing.refOf(idOf(listing, row));
        const showing = await cms.sitesShowing(ref, ['published']);
        await cms.revalidateDocument(ref, showing);
        await queueRefreshes(cms, ref, showing);
    }
    await fireContentEvents(
        cms,
        items.map((row) => contentEvent(cms, cms.target(listing.refOf(idOf(listing, row))), 'restored', by))
    );
};

/**
 * One `deleted` event per item a delete took for good: their sources, without
 * translations or each site's values, credited to `by`, or to no one when
 * the daily job erased them.
 */
const fireErased = async (cms: CmsService, root: string, rows: readonly DocumentRow[], by: string | null): Promise<void> => {
    const site = rows.find((row) => row.id === root)?.site;
    const events = rows
        .filter((row) => row.locale === SOURCE_LOCALE && row.site === site)
        .flatMap((row) => {
            const listing = cms.storedListing(row.key.slice(0, row.key.indexOf('/')), row.site);
            return listing === undefined ? [] : [contentEvent(cms, cms.target(listing.refOf(idOf(listing, row))), 'deleted', by)];
        });
    await fireContentEvents(cms, events);
};

/**
 * Deletes an item in the trash for good, with what went with it, and the
 * images in the trash only they held.
 */
export const eraseItem = async (cms: CmsService, name: string, id: string, site: string, by: string): Promise<void> => {
    const listing = cms.listing(name, site);
    const root = await entryOf(cms, listing, id);
    const erased = await cms.store.erase(root.id);
    await cms.media.eraseUnheld();
    await fireErased(cms, root.id, erased, by);
};

/**
 * Each delete in the trash of a site's own collections, or of the shared
 * ones, newest first.
 */
export const trashOf = async (cms: CmsService, site: string, people: readonly Person[]): Promise<TrashEntryView[]> => {
    const entries = [];
    for (const { document, under } of await cms.store.trashEntries('item', site)) {
        const collection = document.key.slice(0, document.key.indexOf('/'));
        const listing = cms.storedListing(collection, site);
        if (listing === undefined) continue;
        const ref: DocumentRef = listing.refOf(idOf(listing, document));
        const target = cms.target(ref);
        const deletedAt = document.trashedAt!;
        entries.push({
            ref: formatRef(ref),
            collection,
            id: idOf(listing, document),
            label: documentLabel({
                target,
                row: cms.migrated(target, document),
            }),
            deletedAt: deletedAt.toISOString(),
            deletedBy: viewOf(people, document.trashedBy ?? ''),
            erasedAt: new Date(deletedAt.getTime() + TRASH_DAYS * DAY_MS).toISOString(),
            under,
            published: document.published !== null,
        });
    }
    return entries;
};

/**
 * Deletes for good everything in the trash of a site's own collections, or
 * of the shared ones. Answers how many deletes went.
 */
export const emptyTrash = async (cms: CmsService, site: string, by: string): Promise<number> => {
    const entries = await cms.store.trashEntries('item', site);
    const erased: Array<[string, DocumentRow[]]> = [];
    for (const { document } of entries) erased.push([document.id, await cms.store.erase(document.id)]);
    await cms.media.eraseUnheld();
    for (const [root, rows] of erased) await fireErased(cms, root, rows, by);
    return entries.length;
};

/**
 * Deletes for good what has waited in the trash for `TRASH_DAYS`, and the
 * images in the trash nothing holds any longer.
 */
export const eraseExpired = async (cms: CmsService, now = new Date()): Promise<{ erased: number }> => {
    const expired = await cms.store.trashedBefore(new Date(now.getTime() - TRASH_DAYS * DAY_MS));
    const erased: Array<[string, DocumentRow[]]> = [];
    for (const root of expired) erased.push([root, await cms.store.erase(root)]);
    await cms.media.eraseUnheld();
    for (const [root, rows] of erased) await fireErased(cms, root, rows, null);
    return {
        erased: expired.length,
    };
};

const k = new Kizuna();

/**
 * The job that runs once a day and deletes for good what has waited in the
 * trash for `TRASH_DAYS`.
 */
export const emptyTrashJob = (slug: string) =>
    k
        .job({
            summary: `Delete for good what has been in the trash for ${TRASH_DAYS} days`,
            schedule: cron.daily('03:00'),
            result: z.object({
                erased: z.int(),
            }),
        })
        .handler(async (args) => {
            const plugins = (args as unknown as { plugins: Record<string, { service: CmsService } | undefined> }).plugins;
            const service = plugins[slug]?.service;
            if (service === undefined) throw new Error(`The trash job found no CMS at plugins.${slug}.`);
            return {
                status: 200,
                body: await eraseExpired(service),
            };
        });
