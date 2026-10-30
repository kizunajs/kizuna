import { and, eq, gte, inArray, lte, ne, or } from 'drizzle-orm';
import type { CmsService } from './cms.js';
import { DEFAULT_SITE } from './options.js';
import { formatRef } from './refs.js';
import { documentLabel, peopleOf } from './reviews.js';
import { cmsDocuments, cmsRefs, cmsVersions } from './storage/schema.js';
import type { RefreshRecord } from './storage/store.js';
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
 * Every refresh that ran since `from`, oldest first.
 */
export const refreshesSince = (cms: CmsService, from: Date): Promise<RefreshRecord[]> => cms.store.refreshesSince(from);

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
