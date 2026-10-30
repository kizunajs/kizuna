import type { CmsService } from './cms.js';
import { translationOf } from './locales.js';
import { DEFAULT_SITE } from './options.js';
import { servesCollection } from './page.js';
import { formatRef, type DocumentRef } from './refs.js';
import { documentLabel } from './reviews.js';

/**
 * One translation that waits on someone: fields whose source changed since
 * they were translated, and fields its source has that it lacks.
 */
export interface WaitingTranslation {
    /**
     * The translation, like `page:norway:frontPage@en`.
     */
    ref: string;
    /**
     * The document it translates.
     */
    source: string;
    locale: string;
    label: string;
    changed: string[];
    missing: string[];
}

/**
 * Every document with a translated field, among the sites `sees` lets
 * through and the shared content.
 */
const translatedDocuments = async (cms: CmsService, sees: (site: string) => boolean): Promise<DocumentRef[]> => {
    const refs: DocumentRef[] = [];
    const onSite = (site: string): Record<string, never> | { site: string } =>
        site === DEFAULT_SITE
            ? {}
            : {
                  site,
              };
    for (const [site, pages] of Object.entries(cms.sites)) {
        if (!sees(site)) continue;
        for (const [name, entry] of Object.entries(pages)) {
            if (servesCollection(entry.page) || translationOf(entry.page) === undefined) continue;
            refs.push({
                type: 'page',
                name,
                ...onSite(site),
            });
        }
    }
    for (const global of Object.values(cms.globals)) {
        if (translationOf(global) === undefined) continue;
        refs.push({
            type: 'global',
            name: global.name,
        });
    }
    for (const [site, globals] of Object.entries(cms.siteGlobals)) {
        if (!sees(site)) continue;
        for (const global of Object.values(globals)) {
            if (translationOf(global) === undefined) continue;
            refs.push({
                type: 'global',
                name: global.name,
                site,
            });
        }
    }
    for (const listing of cms.listings()) {
        if (!sees(listing.site) || translationOf(listing.definition) === undefined) continue;
        for (const row of await cms.store.list('item', listing.site)) {
            if (row.key.startsWith(listing.keyPrefix)) refs.push(listing.refOf(row.key.slice(listing.keyPrefix.length)));
        }
    }
    return refs;
};

/**
 * The translations that wait on someone, in every language a document is
 * written in besides its source, on the sites `sees` lets through and the
 * shared content.
 */
export const waitingTranslations = async (cms: CmsService, sees: (site: string) => boolean): Promise<WaitingTranslation[]> => {
    const waiting: WaitingTranslation[] = [];
    for (const ref of await translatedDocuments(cms, sees)) {
        const locales = await cms.documentLocales(ref).catch(() => undefined);
        if (locales === undefined) continue;
        const label = documentLabel(await cms.draftState(ref));
        for (const locale of locales.locales) {
            if (locale.code === locales.source || (locale.changed.length === 0 && locale.missing.length === 0)) continue;
            waiting.push({
                ref: formatRef({
                    ...ref,
                    locale: locale.code,
                }),
                source: formatRef(ref),
                locale: locale.code,
                label,
                changed: locale.changed,
                missing: locale.missing,
            });
        }
    }
    return waiting;
};
