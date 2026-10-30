import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { CmsHttpError, pageCacheTag, type CmsService } from './cms.js';
import { DEFAULT_SITE } from './options.js';
import { formatRef, type DocumentRef } from './refs.js';
import { servesCollection } from './page.js';
import { previewSecret, REFRESH_SIGNATURE_HEADER, signRefresh } from './preview-token.js';
import { InvalidateBodySchema, type InvalidateBody } from './wire.js';

/**
 * How many times the transport tries a site or partner that does not answer.
 */
export const REFRESH_ATTEMPTS = 5;

/**
 * The refresh job's key under `content`.
 */
export const REFRESH_JOB = 'refreshSite';

/**
 * A site or partner that hears a document's publishes.
 */
export interface RefreshTarget {
    key: string;
    kind: 'site' | 'partner';
    label: string;
}

/**
 * The sites that show a document and the partners that read it: every site
 * and partner for shared content, and for a site's own content or its values
 * on shared content, that site and the partners that read it. A page is
 * its own site's alone. `sites` narrows them to an item's `showsOn` and the
 * partners that read one of those sites.
 */
export const refreshTargets = (cms: CmsService, ref: DocumentRef, sites?: readonly string[]): RefreshTarget[] => {
    const names = cms.siteNames();
    if (names.length === 0) return [];
    const site = cms.target(ref).site;
    const shared = site === DEFAULT_SITE;
    const reached = shared ? names.filter((name) => sites === undefined || sites.includes(name)) : [site];
    return [
        ...reached.map(
            (key): RefreshTarget => ({
                key,
                kind: 'site',
                label: String(cms.siteInfo(key)['label']),
            })
        ),
        ...Object.entries(cms.options.partners ?? {})
            .filter(([, partner]) => (shared && sites === undefined) || partner.reads.some((read) => reached.includes(read)))
            .map(
                ([key, partner]): RefreshTarget => ({
                    key,
                    kind: 'partner',
                    label: partner.label,
                })
            ),
    ];
};

/**
 * What a site's or partner's `invalidate` hears about a document.
 */
export const invalidateBodyOf = (cms: CmsService, ref: DocumentRef): InvalidateBody => {
    if (ref.type === 'page') {
        return {
            page: ref.name,
        };
    }
    if (ref.type === 'global') {
        return {
            global: ref.name,
        };
    }
    return {
        brand: cms.servedListing(ref.collection, ref.site ?? DEFAULT_SITE).brand,
        id: ref.id,
    };
};

/**
 * What a refresh names, as its dedupe key and its rows record it:
 * `OfficeId:k3j9x2`, `global:footer` or `page:frontPage`.
 */
const subjectOf = (body: InvalidateBody): string =>
    'brand' in body ? `${body.brand}:${body.id}` : 'global' in body ? `global:${body.global}` : `page:${body.page}`;

/**
 * Queues one refresh per site and partner that shows a document, after it
 * published, unpublished or was deleted, and records each as queued.
 */
export const queueRefreshes = async (cms: CmsService, ref: DocumentRef, sites?: readonly string[]): Promise<void> => {
    const targets = refreshTargets(cms, ref, sites);
    const job = cms.refreshJob();
    if (targets.length === 0 || job === undefined) return;
    const body = invalidateBodyOf(cms, ref);
    const subject = subjectOf(body);
    const batch = randomUUID();
    await cms.store.addRefreshes(
        targets.map((target) => ({
            batch,
            ref: formatRef(ref),
            target: target.key,
            subject,
        }))
    );
    for (const target of targets) {
        try {
            await job.queue({
                input: {
                    target: target.key,
                    body,
                },
                dedupeKey: `${target.key}:${subject}`,
            });
        } catch (error) {
            console.warn(
                `[kizuna-cms] The refresh of ${target.label} could not be queued: ${error instanceof Error ? error.message : String(error)}`
            );
            await cms.store.recordRefresh(target.key, subject, 'failed');
        }
    }
};

/**
 * Where a target's `invalidate` is, and the headers the call carries: a
 * signature for your own sites, and what a partner asks for.
 */
const callOf = async (cms: CmsService, target: string, body: InvalidateBody): Promise<{ url: string; headers: Record<string, string> }> => {
    const partner = cms.options.partners?.[target];
    if (partner !== undefined) {
        return {
            url: partner.invalidate.url,
            headers: {
                ...(await partner.invalidate.headers?.()),
                'content-type': 'application/json',
            },
        };
    }
    const site = cms.siteInfo(target);
    return {
        url: `${String(site['url']).replace(/\/+$/, '')}${cms.options.apiPath ?? '/api'}${cms.basePath}/invalidate`,
        headers: {
            'content-type': 'application/json',
            [REFRESH_SIGNATURE_HEADER]: signRefresh(previewSecret(cms.options.previewSecret), body),
        },
    };
};

/**
 * Calls one target's `invalidate` and records how it went. Answers why it
 * failed, and whether another attempt may succeed: a `5xx`, a `429` or no
 * answer at all, while the transport still has attempts left.
 */
export const refresh = async (
    cms: CmsService,
    target: string,
    body: InvalidateBody
): Promise<{ detail: string; retry: boolean } | undefined> => {
    const subject = subjectOf(body);
    const label =
        cms.options.partners?.[target]?.label ?? (cms.siteNames().includes(target) ? String(cms.siteInfo(target)['label']) : target);
    let failure: { detail: string; retry: boolean };
    try {
        const call = await callOf(cms, target, body);
        const response = await fetch(call.url, {
            method: 'POST',
            headers: call.headers,
            body: JSON.stringify(body),
        });
        if (response.ok) {
            await cms.store.recordRefresh(target, subject, 'answered');
            return undefined;
        }
        failure = {
            detail: `${label} answered ${response.status}.`,
            retry: response.status >= 500 || response.status === 429,
        };
    } catch (error) {
        failure = {
            detail: `${label} did not answer: ${error instanceof Error ? error.message : String(error)}`,
            retry: true,
        };
    }
    const retrying = failure.retry && cms.retriesRefreshes();
    await cms.store.recordRefresh(target, subject, retrying ? 'retrying' : 'failed', REFRESH_ATTEMPTS);
    return {
        ...failure,
        retry: retrying,
    };
};

/**
 * Drops what a deployment caches of what an `invalidate` call names: the
 * pages holding an id, and an item's own reads, a global's, or a page's on
 * every site that has it. Answers the pages it refreshed.
 */
export const invalidate = async (cms: CmsService, body: InvalidateBody): Promise<string[]> => {
    if ('brand' in body) {
        const listing = cms.listingFor(body.brand);
        if (listing === undefined && cms.relationshipFor(body.brand) === undefined) {
            throw new CmsHttpError(404, {
                detail: `No collection or relationship holds ids of the brand '${body.brand}'.`,
            });
        }
        if (listing !== undefined) await cms.revalidateDocument(listing.refOf(body.id));
        return cms.invalidate(body.brand, body.id);
    }
    if ('global' in body) {
        const site =
            cms.globals[body.global] === undefined
                ? Object.keys(cms.siteGlobals).find((name) => cms.siteGlobals[name]?.[body.global] !== undefined)
                : DEFAULT_SITE;
        if (site === undefined) throw new CmsHttpError(404, { detail: `There is no global named '${body.global}'.` });
        await cms.revalidateDocument({
            type: 'global',
            name: body.global,
            ...(site === DEFAULT_SITE
                ? {}
                : {
                      site,
                  }),
        });
        return [];
    }
    const sites = Object.entries(cms.sites)
        .filter(([, pages]) => pages[body.page] !== undefined && !servesCollection(pages[body.page]!.page))
        .map(([site]) => site);
    if (sites.length === 0) throw new CmsHttpError(404, { detail: `There is no page named '${body.page}'.` });
    await cms.revalidateTags(sites.map((site) => pageCacheTag(body.page, site)));
    return sites.map((site) => (site === DEFAULT_SITE ? body.page : `${site}:${body.page}`));
};

const k = new Kizuna();

/**
 * The jobs the CMS declares under `content` once it serves several sites:
 * one refresh per site or partner that shows a document. Without an
 * identity, they run as the app's jobs do.
 */
export const refreshJobs = (slug: string, identity: string | undefined) => {
    const definitions = {
        refreshSite: k
            .job({
                summary: "Refresh one site's or partner's pages after a document changed",
                retry: REFRESH_ATTEMPTS,
                input: z.object({
                    target: z.string().describe('The site or partner, by its key.'),
                    body: InvalidateBodySchema,
                }),
            })
            .handler(async (args) => {
                const plugins = (args as unknown as { plugins: Record<string, { service: CmsService } | undefined> }).plugins;
                const service = plugins[slug]?.service;
                if (service === undefined) throw new Error(`The refresh job found no CMS at plugins.${slug}.`);
                const failed = await refresh(service, args.input.target, args.input.body);
                if (failed === undefined) return;
                args.throwError({
                    status: failed.retry ? 503 : 422,
                    body: {
                        detail: failed.detail,
                    },
                });
            }),
    };
    return identity === undefined ? k.jobs(definitions) : k.jobs(identity, definitions);
};

/**
 * The jobs `cms()` hands `content`.
 */
export type CmsJobs = ReturnType<typeof refreshJobs>;
