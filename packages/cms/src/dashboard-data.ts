import { and, desc, eq, gte, inArray, isNotNull, lte, ne, or } from 'drizzle-orm';
import type { CmsService } from './cms.js';
import { DEFAULT_SITE } from './options.js';
import { formatRef, type DocumentRef } from './refs.js';
import { documentLabel, peopleOf } from './reviews.js';
import { cmsDocuments, cmsRefs, cmsVersions } from './storage/schema.js';
import type { DashboardPeriod } from './dashboard.js';

/**
 * How many shared items the reach widget ranks.
 */
const REACH_SHOWN = 6;

/**
 * How many editors the editors widget lists.
 */
const EDITORS_SHOWN = 8;

/**
 * One refresh of a site or a partner after a publish, as the refresh jobs
 * record it.
 */
export interface RefreshRecord {
    /**
     * The site's key or the partner's name.
     */
    target: string;
    status: 'answered' | 'failed' | 'retrying';
    attempts: number;
    /**
     * When it answered, or was last tried.
     */
    at: Date;
}

/**
 * Where the refresh jobs' answers are read from.
 */
interface RefreshSource {
    refreshesSince: (from: Date) => Promise<readonly RefreshRecord[]>;
}

/**
 * Every refresh since `from`, oldest first, or none while the store keeps no
 * refreshes.
 */
export const refreshesSince = async (cms: CmsService, from: Date): Promise<RefreshRecord[]> => {
    const source = cms.store as unknown as Partial<RefreshSource>;
    if (typeof source.refreshesSince !== 'function') return [];
    const records = await source.refreshesSince(from);
    return [...records].sort((first, second) => first.at.getTime() - second.at.getTime());
};

/**
 * Each target's latest refresh, and how many of its refreshes answered.
 */
export const refreshSummaries = (
    records: readonly RefreshRecord[]
): Map<string, { last: RefreshRecord; answered: number; total: number }> => {
    const summaries = new Map<string, { last: RefreshRecord; answered: number; total: number }>();
    for (const record of records) {
        const held = summaries.get(record.target);
        summaries.set(record.target, {
            last: record,
            answered: (held?.answered ?? 0) + (record.status === 'answered' ? 1 : 0),
            total: (held?.total ?? 0) + 1,
        });
    }
    return summaries;
};

/**
 * The ref of a stored document.
 */
const refOfStored = (row: { kind: string; site: string; key: string }): DocumentRef | undefined => {
    const site =
        row.site === DEFAULT_SITE
            ? {}
            : {
                  site: row.site,
              };
    if (row.kind === 'page' || row.kind === 'global') {
        return {
            type: row.kind,
            name: row.key,
            ...site,
        };
    }
    if (row.kind !== 'item') return undefined;
    const slash = row.key.indexOf('/');
    return {
        type: 'item',
        collection: row.key.slice(0, slash),
        id: row.key.slice(slash + 1),
        ...site,
    };
};

/**
 * What editors call a stored document, or `undefined` for one the config no
 * longer declares.
 */
const labelOf = async (cms: CmsService, ref: DocumentRef): Promise<string | undefined> => {
    const state = await cms.draftState(ref).catch(() => undefined);
    return state === undefined ? undefined : documentLabel(state);
};

/**
 * Each site's latest publish: the document, who published it and when.
 */
export const lastPublishes = async (
    cms: CmsService,
    sites: readonly string[]
): Promise<Map<string, { ref: string; label: string; by: string | null; at: string }>> => {
    const found = new Map<string, { ref: string; label: string; by: string | null; at: string }>();
    if (sites.length === 0) return found;
    const rows = await cms.options.db
        .selectDistinctOn([cmsDocuments.site])
        .from(cmsDocuments)
        .where(and(inArray(cmsDocuments.site, [...sites]), ne(cmsDocuments.kind, 'media'), isNotNull(cmsDocuments.publishedAt)))
        .orderBy(cmsDocuments.site, desc(cmsDocuments.publishedAt));
    const people = await peopleOf(cms);
    for (const row of rows) {
        const ref = refOfStored(row);
        if (ref === undefined || row.publishedAt === null) continue;
        // The publisher is the last to write the row, unless a draft came after.
        const publisher = row.updatedAt.getTime() === row.publishedAt.getTime() ? row.updatedBy : undefined;
        found.set(row.site, {
            ref: formatRef(ref),
            label: (await labelOf(cms, ref)) ?? row.key,
            by: publisher === undefined ? null : (people.find((person) => person.id === publisher)?.name ?? publisher),
            at: row.publishedAt.toISOString(),
        });
    }
    return found;
};

/**
 * Shared items ranked by how many pages show them, on how many sites, read
 * from the ids each document holds.
 */
export const reachOf = async (
    cms: CmsService
): Promise<Array<{ ref: string; label: string; kind: string; pages: number; sites: number; changed: boolean }>> => {
    const listings = new Map(
        cms
            .listings()
            .filter((listing) => listing.site === DEFAULT_SITE)
            .map((listing) => [listing.brand, listing])
    );
    if (listings.size === 0) return [];
    const held = await cms.options.db
        .selectDistinct({
            brand: cmsRefs.brand,
            refId: cmsRefs.refId,
        })
        .from(cmsRefs)
        .where(inArray(cmsRefs.brand, [...listings.keys()]));
    const counted = await Promise.all(
        held.map(async (reference) => {
            const used = await cms.whereUsed(reference.brand, reference.refId);
            return {
                ...reference,
                pages: new Set(used.map((use) => `${use.site} ${use.path}`)).size,
                sites: new Set(used.map((use) => use.site)).size,
            };
        })
    );
    const ranked = counted
        .filter((reference) => reference.pages > 0)
        .sort((first, second) => second.pages - first.pages || second.sites - first.sites);
    const items = [];
    for (const reference of ranked) {
        if (items.length === REACH_SHOWN) break;
        const listing = listings.get(reference.brand)!;
        const ref = listing.refOf(reference.refId);
        const state = await cms.draftState(ref).catch(() => undefined);
        if (state?.row === undefined) continue;
        items.push({
            ref: formatRef(ref),
            label: documentLabel(state),
            kind: listing.definition.label ?? listing.name,
            pages: reference.pages,
            sites: reference.sites,
            changed: state.status === 'changed' || state.status === 'draft',
        });
    }
    return items;
};

const listOf = (role: string | readonly string[] | undefined): string[] =>
    role === undefined ? [] : typeof role === 'string' ? [role] : [...role];

/**
 * Each editor's changes over the period, most first, with their roles, and
 * how many changes were made and published in all.
 */
export const editorsOf = async (
    cms: CmsService,
    period: DashboardPeriod
): Promise<{
    changes: number;
    published: number;
    editors: Array<{
        id: string;
        name: string;
        image?: string;
        roles: string[];
        sites: Array<{
            label: string;
            roles: string[];
        }>;
        changes: number;
        lastActive: string;
    }>;
}> => {
    const within = (column: typeof cmsVersions.createdAt | typeof cmsVersions.publishedAt) =>
        and(gte(column, period.from), lte(column, period.to));
    const rows = await cms.options.db
        .select({
            by: cmsVersions.createdBy,
            createdAt: cmsVersions.createdAt,
            publishedAt: cmsVersions.publishedAt,
        })
        .from(cmsVersions)
        .innerJoin(cmsDocuments, eq(cmsDocuments.id, cmsVersions.documentId))
        .where(and(ne(cmsDocuments.kind, 'media'), or(within(cmsVersions.createdAt), within(cmsVersions.publishedAt))));
    const inPeriod = (date: Date | null): boolean => date !== null && date >= period.from && date <= period.to;
    const byEditor = new Map<string, { changes: number; lastActive: Date }>();
    for (const row of rows) {
        if (!inPeriod(row.createdAt)) continue;
        const held = byEditor.get(row.by);
        byEditor.set(row.by, {
            changes: (held?.changes ?? 0) + 1,
            lastActive: held === undefined || row.createdAt > held.lastActive ? row.createdAt : held.lastActive,
        });
    }
    const people = await peopleOf(cms);
    const values = cms.options.sites?.values ?? {};
    const editors = [...byEditor]
        .sort(([, first], [, second]) => second.changes - first.changes || second.lastActive.getTime() - first.lastActive.getTime())
        .slice(0, EDITORS_SHOWN)
        .map(([id, counted]) => {
            const person = people.find((candidate) => candidate.id === id);
            return {
                id,
                name: person?.name ?? id,
                ...(person?.image === undefined
                    ? {}
                    : {
                          image: person.image,
                      }),
                roles: [...(person?.roles ?? [])],
                sites: Object.entries(person?.sites ?? {}).flatMap(([site, role]) =>
                    values[site] === undefined || listOf(role).length === 0
                        ? []
                        : [
                              {
                                  label: values[site]!.label,
                                  roles: listOf(role),
                              },
                          ]
                ),
                changes: counted.changes,
                lastActive: counted.lastActive.toISOString(),
            };
        });
    return {
        changes: rows.filter((row) => inPeriod(row.createdAt)).length,
        published: rows.filter((row) => inPeriod(row.publishedAt)).length,
        editors,
    };
};
