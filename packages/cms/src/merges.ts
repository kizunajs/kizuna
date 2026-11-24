import type { CmsService } from './cms.js';
import { formatRef, parseRef, sourceRefOf, type DocumentRef } from './refs.js';
import { mergeChanges } from './redirects.js';
import { trashItem } from './trash.js';

/**
 * Takes a merged page or item off the site: an item goes to the trash, and a
 * page, which the code declares, is unpublished.
 */
const takeOff = async (cms: CmsService, value: string, by: string): Promise<void> => {
    const ref = parseRef(value);
    if (ref === undefined) return;
    if (ref.type === 'item') {
        const listing = cms.listingOf(ref);
        if (listing === undefined || (await cms.trashed(ref)) !== undefined) return;
        await trashItem(cms, listing.name, ref.id, listing.site, by);
        return;
    }
    const { row } = await cms.document(ref);
    if (row?.published !== null && row?.published !== undefined) await cms.unpublish(ref, by);
};

/**
 * Finishes the merges waiting for these documents, once they published:
 * each page or item merged into one leaves the site, and the redirects to it
 * go to the document it merged into. Its own addresses redirected in the
 * publish's transaction.
 */
export const finishMerges = async (cms: CmsService, refs: readonly DocumentRef[], by: string): Promise<void> => {
    for (const ref of refs) {
        const canonical = cms.canonical(ref);
        if (canonical.locale !== undefined) continue;
        const into = formatRef(sourceRefOf(canonical));
        const merge = await cms.merges.pending(into);
        if (merge === undefined) continue;
        for (const value of merge.merged) {
            try {
                await takeOff(cms, value, by);
            } catch (error) {
                console.warn(
                    `[kizuna-cms] '${value}' merged into '${into}' stayed on the site: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
        await cms.redirects.repointDocuments(merge.merged, into);
        await cms.merges.finish(merge.id);
    }
};

/**
 * Runs a merge now, for a document with nothing new to publish: redirects
 * the merged pages' addresses to it, and takes them off the site.
 */
export const mergeNow = async (cms: CmsService, ref: DocumentRef, by: string): Promise<void> => {
    await cms.redirects.apply(await mergeChanges(cms, ref, by));
    await finishMerges(cms, [ref], by);
};
