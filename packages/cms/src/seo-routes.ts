import { z } from 'zod';
import { Kizuna, type RouteAuth } from 'kizunajs';
import { route } from 'kizunajs/plugin';
import { ProblemDetailsSchema } from 'kizunajs/schemas';
import { readMeta, unwrapOptionalWrappers } from 'kizunajs/generator';
import { CmsHttpError, type CmsService, type DraftState } from './cms.js';
import type { EditingArgs, Guarded } from './action-routes.js';
import { DEFAULT_SITE } from './options.js';
import { formatRef, parseRef, sourceRefOf, type DocumentRef } from './refs.js';
import { contentLinks, linkHref, linkTargetAt, type LinkTarget } from './link-targets.js';
import { LINK_REF } from './links.js';
import { documentLabel } from './reviews.js';
import { dataFields } from './field.js';
import { SEO_GOALS } from './seo.js';
import type { PageSeoData, SeoCheck, SeoData, SeoScores, SiteSeoData } from './seo-data.js';
import type { ContentDefinition } from './definitions.js';

const ScoresSchema = z.object({
    search: z.number().describe('How well it does in search results, from 0 to 100. 80 and over is good, under 50 poor.'),
    answers: z.number().describe('How well AI answers cite it, from 0 to 100.'),
});

const CheckSchema = z.object({
    level: z.enum(['urgent', 'suggested']),
    text: z.string().describe('What is wrong and what to do about it.'),
    field: z.string().optional().describe('The field to fix it in, like `seo` or `body`.'),
});

const KeywordSchema = z.object({
    keyword: z.string(),
    position: z.number().optional().describe('Where it ranks in search results, 1 at the top.'),
    volume: z.number().optional().describe('How many people search for it each month.'),
    change: z.number().optional().describe('How many places it moved since the last check, up when positive.'),
});

const CitationSchema = z.object({
    question: z.string(),
    engines: z.array(z.string()).describe('The AI search engines whose answers cite it.'),
});

const LinkEndSchema = z.object({
    kind: z.enum(['page', 'external', 'broken']),
    ref: z.string().optional().describe('The page or item, for a link inside the CMS.'),
    title: z.string(),
    path: z.string().optional(),
    domain: z.string().optional().describe('The other site, for an external link.'),
    url: z.string().optional().describe('The full address, for an external link.'),
    anchor: z.string().optional().describe('The words the link shows.'),
    reason: z.enum(['unpublished', 'trash', 'missing']).optional().describe('Why a broken link goes nowhere.'),
});

export const PageSeoSchema = Kizuna.model({
    title: 'CMS.PageSeo',
    schema: z.object({
        checkedAt: z.string(),
        label: z.string().nullable().describe('The service the scores, keywords and AI answers come from, or null without one.'),
        scores: ScoresSchema.nullable(),
        checks: z.array(CheckSchema).describe("The CMS's own checks first, then the service's."),
        keywords: z.array(KeywordSchema),
        citations: z.array(CitationSchema),
        links: z.object({
            in: z.array(LinkEndSchema),
            out: z.array(LinkEndSchema),
        }),
        couldLinkHere: z
            .array(
                z.object({
                    ref: z.string(),
                    title: z.string(),
                    phrase: z.string().describe('The words in that page that could carry the link.'),
                })
            )
            .describe('Pages that mention this one but do not link to it.'),
    }),
});

export const SiteSeoSchema = Kizuna.model({
    title: 'CMS.SiteSeo',
    schema: z.object({
        checkedAt: z.string(),
        label: z.string().nullable(),
        scores: ScoresSchema.nullable(),
        mostToFix: z.array(
            z.object({
                ref: z.string(),
                title: z.string(),
                path: z.string(),
                checks: z.int().describe('How many things there are to fix on it.'),
                score: z.number().describe("Its search score, or without a service, the CMS's own from its checks."),
            })
        ),
        keywords: z.array(
            KeywordSchema.extend({
                url: z.string(),
            })
        ),
        citations: z.array(
            CitationSchema.extend({
                url: z.string(),
            })
        ),
        pages: z.int().describe('How many pages and items the site shows at an address.'),
        backlinkDomains: z.array(
            z.object({
                domain: z.string(),
                links: z.int(),
                favicon: z.string().optional(),
            })
        ),
        competing: z.array(
            z.object({
                keyword: z.string(),
                volume: z.number(),
                urls: z.array(
                    z.object({
                        url: z.string(),
                        position: z.number().optional(),
                        similarity: z.number().optional(),
                    })
                ),
            })
        ),
    }),
});

export const LinkMapSchema = Kizuna.model({
    title: 'CMS.LinkMap',
    schema: z.object({
        nodes: z.array(
            z.object({
                id: z
                    .string()
                    .describe('What edges name it by: the ref of a page or item, `external:<domain>`, or the ref a broken link holds.'),
                kind: z.enum(['page', 'external', 'broken']),
                ref: z.string().optional(),
                site: z.string().nullable().optional().describe('For a page or item, its site, or null for shared content.'),
                title: z.string(),
                path: z.string().optional(),
                linksIn: z.int().optional(),
                brokenOut: z.int().optional(),
                domain: z.string().optional(),
                favicon: z.string().optional(),
                reason: z.enum(['unpublished', 'trash', 'missing']).optional(),
            })
        ),
        edges: z.array(
            z.object({
                from: z.string(),
                to: z.string(),
                broken: z.boolean(),
                external: z.boolean(),
                anchor: z.string().optional(),
            })
        ),
    }),
});

export const PageScoresSchema = Kizuna.model({
    title: 'CMS.PageScores',
    schema: z.object({
        scores: z.record(z.string(), ScoresSchema).describe('By ref, for each page and item on the site the service has scores for.'),
    }),
});

const SimilarPageSchema = z.object({
    ref: z.string(),
    title: z.string(),
    path: z.string(),
    position: z.number().optional().describe('Where it ranks for the search, 1 at the top.'),
});

export const SimilarPagesSchema = Kizuna.model({
    title: 'CMS.SimilarPages',
    schema: z.object({
        checkedAt: z.string(),
        label: z.string().nullable(),
        searches: z
            .array(
                z.object({
                    keyword: z.string(),
                    volume: z.number().describe('How many people search for it each month.'),
                    winner: SimilarPageSchema.describe('The page that ranks best, which the others give way to.'),
                    others: z.array(
                        SimilarPageSchema.extend({
                            similarity: z.number().describe('How alike it is to the winner, from 0 to 1.'),
                        })
                    ),
                    fix: z
                        .enum(['merge', 'link'])
                        .describe('`merge` when another page is 85% or more the same as the winner, otherwise `link`.'),
                    why: z.string().describe('One sentence on what the competing costs.'),
                })
            )
            .describe('Largest search first.'),
    }),
});

type LinkEnd = z.output<typeof LinkEndSchema>;
type LinkNode = z.output<typeof LinkMapSchema>['nodes'][number];
type LinkEdge = z.output<typeof LinkMapSchema>['edges'][number];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A link a document holds, wherever it sits: to a page or an item by `ref`,
 * or to a URL by `href`, with the words it shows.
 */
interface HeldLink {
    path: string;
    ref?: string;
    href?: string;
    anchor?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const targetOf = (value: Record<string, unknown>): { ref: string } | { href: string } | undefined => {
    if (typeof value['ref'] === 'string' && LINK_REF.test(value['ref'])) {
        return {
            ref: value['ref'],
        };
    }
    if (typeof value['href'] === 'string') {
        return {
            href: value['href'],
        };
    }
    return undefined;
};

/**
 * Every link in a document's content, read from its shape: a rich text
 * mark with the words it marks, and a link field with its label.
 */
export const heldLinksOf = (content: Record<string, unknown>): HeldLink[] => {
    const found: HeldLink[] = [];
    const visit = (value: unknown, path: string): void => {
        if (Array.isArray(value)) {
            value.forEach((item, index) => visit(item, `${path}.${index}`));
            return;
        }
        if (!isRecord(value)) return;
        if (value['_type'] === 'block' && Array.isArray(value['markDefs'])) {
            const spans = Array.isArray(value['children']) ? (value['children'] as unknown[]).filter(isRecord) : [];
            value['markDefs'].forEach((mark, index) => {
                if (!isRecord(mark)) return;
                const target = targetOf(mark);
                if (target === undefined) return;
                const anchor = spans
                    .filter((span) => Array.isArray(span['marks']) && span['marks'].includes(mark['_key']))
                    .map((span) => String(span['text'] ?? ''))
                    .join('')
                    .trim();
                found.push({
                    path: `${path}.markDefs.${index}`,
                    ...target,
                    ...(anchor === ''
                        ? {}
                        : {
                              anchor,
                          }),
                });
            });
            return;
        }
        const target = targetOf(value);
        if (target !== undefined) {
            found.push({
                path,
                ...target,
                ...(typeof value['label'] === 'string' && value['label'] !== ''
                    ? {
                          anchor: value['label'],
                      }
                    : {}),
            });
        }
        for (const [key, child] of Object.entries(value)) visit(child, path === '' ? key : `${path}.${key}`);
    };
    visit(content, '');
    return found;
};

const SKIPPED_TEXT = new Set(['_key', '_type', 'ref', 'href', 'style', 'listItem', 'marks', 'markDefs', 'slug', 'id', 'image']);

/**
 * The words a document shows, from every text it holds, for finding the
 * phrases that could carry a link.
 */
const textOf = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(textOf).join(' ');
    if (!isRecord(value)) return '';
    return Object.entries(value)
        .filter(([key]) => !SKIPPED_TEXT.has(key))
        .map(([, child]) => textOf(child))
        .join(' ');
};

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A phrase as the text writes it, matched as whole words in any case.
 */
const phraseIn = (text: string, phrase: string): string | undefined =>
    new RegExp(`(?<![\\p{L}\\p{N}])${escaped(phrase)}(?![\\p{L}\\p{N}])`, 'iu').exec(text)?.[0];

const isSeoSchema = (schema: z.core.$ZodType): boolean =>
    (readMeta(schema)?.['x-kizuna'] ?? readMeta(unwrapOptionalWrappers(schema).inner)?.['x-kizuna']) === 'seo';

/**
 * The field holding a page's search title and description, made with
 * `SeoSchema`.
 */
const seoFieldOf = (definition: ContentDefinition): string | undefined =>
    dataFields(definition.fields).find((field) => isSeoSchema(field.schema))?.name;

/**
 * The checks on a search title and description, against the lengths search
 * results show in full.
 */
const seoFieldChecks = (field: string, value: unknown): SeoCheck[] => {
    const seo = isRecord(value) ? value : {};
    const title = typeof seo['title'] === 'string' ? seo['title'].trim() : '';
    const description = typeof seo['description'] === 'string' ? seo['description'].trim() : '';
    const checks: SeoCheck[] = [];
    if (title === '') {
        checks.push({
            level: 'urgent',
            text: `The page has no search title. Write one of ${SEO_GOALS.title.min} to ${SEO_GOALS.title.max} characters.`,
            field,
        });
    } else if (title.length > SEO_GOALS.title.max) {
        checks.push({
            level: 'urgent',
            text: `The search title is ${title.length} characters, and search results cut it after ${SEO_GOALS.title.max}. Shorten it.`,
            field,
        });
    } else if (title.length < SEO_GOALS.title.min) {
        checks.push({
            level: 'suggested',
            text: `The search title is ${title.length} characters. Lengthen it to at least ${SEO_GOALS.title.min} so it says what the page is about.`,
            field,
        });
    }
    if (description === '') {
        checks.push({
            level: 'suggested',
            text: `The page has no search description, so search results pick a sentence of their own. Write one of ${SEO_GOALS.description.min} to ${SEO_GOALS.description.max} characters.`,
            field,
        });
    } else if (description.length > SEO_GOALS.description.max) {
        checks.push({
            level: 'suggested',
            text: `The search description is ${description.length} characters, and search results cut it after ${SEO_GOALS.description.max}. Shorten it.`,
            field,
        });
    } else if (description.length < SEO_GOALS.description.min) {
        checks.push({
            level: 'suggested',
            text: `The search description is ${description.length} characters. Lengthen it to at least ${SEO_GOALS.description.min} so it says what a visitor finds.`,
            field,
        });
    }
    return checks;
};

/**
 * A score from the CMS's own checks, for a site without a service.
 */
const ownScoreOf = (checks: readonly SeoCheck[]): number =>
    Math.max(0, 100 - checks.reduce((sum, check) => sum + (check.level === 'urgent' ? 20 : 8), 0));

const reasonOf = (status: LinkTarget['status']): 'unpublished' | 'trash' | 'missing' =>
    status === 'trashed' ? 'trash' : status === 'unpublished' ? 'unpublished' : 'missing';

/**
 * Runs `fn` over every item, a few at a time, so a service is not asked
 * about a whole site at once.
 */
const eachLimited = async <Item>(items: readonly Item[], limit: number, fn: (item: Item) => Promise<void>): Promise<void> => {
    let next = 0;
    const worker = async (): Promise<void> => {
        while (next < items.length) await fn(items[next++]!);
    };
    await Promise.all(
        Array.from(
            {
                length: Math.min(limit, items.length),
            },
            worker
        )
    );
};

/**
 * What one call works from: the CMS, the site being read, who may see what,
 * and what it has looked up so far.
 */
interface SeoContext {
    cms: CmsService;
    site: string;
    sees: (site: string) => boolean;
    targets: Map<string, LinkTarget>;
}

/**
 * The address a site's URLs start from, without a trailing slash: its
 * `url`, or `preview.url` without sites.
 */
const siteBaseOf = (cms: CmsService, site: string): string | undefined => {
    const url = site === DEFAULT_SITE ? cms.options.preview?.url : cms.siteInfo(site)['url'];
    return typeof url === 'string' && URL.canParse(url) ? url.replace(/\/+$/, '') : undefined;
};

/**
 * The language a site is read in when none is asked for: its first.
 */
const localeOf = (cms: CmsService, site: string, locale?: string): string => locale ?? cms.siteLocales(site)[0] ?? cms.locales()[0] ?? 'en';

/**
 * The site a call reads: the one asked for, `default` for a CMS without
 * sites, refused as if it did not exist when the caller may not open it.
 */
const siteFrom = (cms: CmsService, args: EditingArgs, requested: string | undefined): string => {
    const names = cms.siteNames();
    const site = requested ?? (names.length === 0 ? DEFAULT_SITE : undefined);
    const known = site !== undefined && (names.length === 0 ? site === DEFAULT_SITE : names.includes(site));
    if (!known) {
        throw new CmsHttpError(404, {
            detail:
                site === undefined
                    ? `Name the site to read, one of ${names.join(', ')}.`
                    : names.length === 0
                      ? `There is no site named '${site}'. A CMS without sites reads 'default'.`
                      : `There is no site named '${site}'.`,
        });
    }
    cms.access(args.auth).assertSees(site);
    return site;
};

/**
 * The pages and items a site shows at an address, with their titles.
 */
const pagesOn = async (cms: CmsService, site: string): Promise<Array<{ ref: string; title: string; path: string; status: string }>> => {
    const summaries = (await cms.summaries()).filter((summary) => summary.site === site);
    const items = await cms.linkTargets({
        refs: summaries.filter((summary) => summary.ref.startsWith('item:')).map((summary) => summary.ref),
    });
    const itemLabels = new Map(items.map((item) => [item.ref, item.label]));
    return summaries.map((summary) => ({
        ref: summary.ref,
        title:
            itemLabels.get(summary.ref) ??
            summary.label ??
            summary.name
                .replace(/Page$/, '')
                .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
                .toLowerCase()
                .replace(/^./, (first) => first.toUpperCase()),
        path: summary.path,
        status: summary.status,
    }));
};

/**
 * Where a link a document holds goes, as the overview shows it, with the
 * check a broken one raises.
 */
const endOf = async (
    context: SeoContext,
    link: HeldLink,
    outbound: ReadonlyMap<string, number>
): Promise<{ end: LinkEnd; check?: SeoCheck } | undefined> => {
    const field = link.path.split('.')[0]!;
    if (link.ref !== undefined) {
        if (!context.targets.has(link.ref)) {
            const [described] = await context.cms.linkTargets({
                refs: [link.ref],
            });
            if (described !== undefined) context.targets.set(link.ref, described);
        }
        const target = context.targets.get(link.ref);
        if (target === undefined) return undefined;
        const known = target.label !== link.ref;
        if (target.status === 'published') {
            return {
                end: {
                    kind: 'page',
                    ref: link.ref,
                    title: target.label,
                    ...(target.path === null
                        ? {}
                        : {
                              path: target.path,
                          }),
                    ...(link.anchor === undefined
                        ? {}
                        : {
                              anchor: link.anchor,
                          }),
                },
            };
        }
        const reason = reasonOf(target.status);
        return {
            end: {
                kind: 'broken',
                ref: link.ref,
                title: known ? target.label : 'A page that is gone',
                reason,
                ...(link.anchor === undefined
                    ? {}
                    : {
                          anchor: link.anchor,
                      }),
            },
            check: {
                level: 'urgent',
                text:
                    reason === 'unpublished'
                        ? `A link goes to ${target.label}, which is not published. Publish it or link somewhere else.`
                        : reason === 'trash'
                          ? `A link goes to ${known ? target.label : 'a page'}, which is in the trash. Link somewhere else or remove the link.`
                          : 'A link goes to a page that no longer exists. Link somewhere else or remove the link.',
                field,
            },
        };
    }
    if (link.href === undefined || !/^https?:\/\//i.test(link.href) || !URL.canParse(link.href)) return undefined;
    const url = new URL(link.href);
    const ours = [DEFAULT_SITE, ...context.cms.siteNames()]
        .map((site) => siteBaseOf(context.cms, site))
        .some((base) => base !== undefined && new URL(base).origin === url.origin);
    if (ours) {
        const target = await linkTargetAt(context.cms, link.href, context.sees);
        if (target !== undefined) {
            return {
                end: {
                    kind: 'page',
                    ref: target.ref,
                    title: target.label,
                    ...(target.path === null
                        ? {}
                        : {
                              path: target.path,
                          }),
                    ...(link.anchor === undefined
                        ? {}
                        : {
                              anchor: link.anchor,
                          }),
                },
            };
        }
    }
    const status = outbound.get(link.href);
    return {
        end: {
            kind: 'external',
            title: url.hostname,
            domain: url.hostname,
            path: `${url.pathname}${url.search}`,
            url: link.href,
            ...(link.anchor === undefined
                ? {}
                : {
                      anchor: link.anchor,
                  }),
        },
        ...(status === undefined || status < 400
            ? {}
            : {
                  check: {
                      level: 'urgent',
                      text: `A link to ${link.href} answers ${status}. Fix the address or remove the link.`,
                      field,
                  },
              }),
    };
};

/**
 * How alike another page has to be to the winner before merging it beats
 * linking it.
 */
export const MERGE_SIMILARITY = 0.85;

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

const listed = (titles: readonly string[]): string =>
    titles.length <= 1 ? (titles[0] ?? '') : `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;

/**
 * One sentence on what competing for a search costs: how the searches split,
 * and whether any page reaches the first page of results.
 */
export const similarWhy = (input: {
    volume: number;
    fix: 'merge' | 'link';
    winner: { title: string; position?: number };
    others: ReadonlyArray<{ title: string }>;
}): string => {
    const count = input.others.length + 1;
    const pages = `${NUMBER_WORDS[count] ?? count} pages`;
    const volume = new Intl.NumberFormat('en').format(input.volume);
    const others = listed(input.others.map((page) => page.title));
    const verb = input.others.length === 1 ? 's' : '';
    const outcome =
        input.winner.position !== undefined && input.winner.position <= 10
            ? `only ${input.winner.title} reaches the first page`
            : 'none reaches the first page';
    return input.fix === 'merge'
        ? `${others} say${verb} nearly what ${input.winner.title} says, so search splits the ${volume} searches between ${pages} and ${outcome}.`
        : `${others} compete${verb} with ${input.winner.title} for the ${volume} searches, so search cannot tell which of the ${pages} to show and ${outcome}.`;
};

/**
 * The SEO overview's answers, asked of `seoData` and kept for a day per
 * address, so the admin can show them without asking each time.
 */
const seoCache = () => {
    const entries = new Map<string, { at: number; value: Promise<unknown> }>();
    return <Value>(key: string, refresh: boolean, ask: () => Promise<Value>): Promise<Value> => {
        const known = entries.get(key);
        if (!refresh && known !== undefined && Date.now() - known.at < DAY_MS) return known.value as Promise<Value>;
        const value = ask();
        entries.set(key, {
            at: Date.now(),
            value,
        });
        value.catch(() => {
            if (entries.get(key)?.value === value) entries.delete(key);
        });
        return value;
    };
};

/**
 * What one page or item answers: the CMS's own checks on its search title,
 * description and links, its links in and out, and what `seoData` says of
 * its address.
 */
const pageReport = async (
    context: SeoContext,
    input: {
        source: DocumentRef;
        state: DraftState;
        seoContent: Record<string, unknown>;
        url: string | undefined;
        locale: string;
        data: PageSeoData | undefined;
        linkedHere: number;
        path: string | undefined;
    }
): Promise<{ checks: SeoCheck[]; out: LinkEnd[] }> => {
    const content = input.state.row?.draft ?? input.state.row?.published ?? {};
    const outbound = new Map((input.data?.outboundStatus ?? []).map((entry) => [entry.url, entry.status]));
    const checks: SeoCheck[] = [];
    const seoField = seoFieldOf(input.state.target.definition);
    if (seoField !== undefined) checks.push(...seoFieldChecks(seoField, input.seoContent[seoField]));
    const out: LinkEnd[] = [];
    const seen = new Set<string>();
    for (const link of heldLinksOf(content)) {
        const found = await endOf(context, link, outbound);
        if (found === undefined) continue;
        if (found.check !== undefined) checks.push(found.check);
        const key = `${found.end.kind} ${found.end.ref ?? found.end.url}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(found.end);
    }
    if (input.linkedHere === 0 && input.path !== '/') {
        checks.push({
            level: 'suggested',
            text: 'No page links here, so search engines find it only through the menu or the sitemap. Link to it from a page on the same topic.',
        });
    }
    checks.push(...(input.data?.checks ?? []));
    return {
        checks: [...checks.filter((check) => check.level === 'urgent'), ...checks.filter((check) => check.level === 'suggested')],
        out,
    };
};

/**
 * The SEO overview's routes: one page, one site, the site's link map, and
 * the scores the lists show.
 */
export const seoRoutes = (input: { editor: RouteAuth; editingBase: `/${string}`; guarded: Guarded }) => {
    const cached = seoCache();

    const pageData = (seoData: SeoData, url: string, locale: string, refresh: boolean): Promise<PageSeoData> =>
        cached(`page ${locale} ${url}`, refresh, () =>
            seoData.page({
                url,
                locale,
            })
        );

    const siteData = (seoData: SeoData, origin: string, locale: string, refresh: boolean): Promise<SiteSeoData> =>
        cached(`site ${locale} ${origin}`, refresh, () =>
            seoData.site({
                origin,
                locale,
            })
        );

    /**
     * What `seoData` says of a page, or `undefined` without it or an address.
     * A service that fails answers 502.
     */
    const askPage = async (
        cms: CmsService,
        url: string | undefined,
        locale: string,
        refresh: boolean
    ): Promise<PageSeoData | undefined> => {
        const seoData = cms.options.seoData;
        if (seoData === undefined || url === undefined) return undefined;
        try {
            return await pageData(seoData, url, locale, refresh);
        } catch (error) {
            throw new CmsHttpError(502, {
                detail: `${seoData.label} did not answer for ${url}: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    };

    const contextFor = (cms: CmsService, args: EditingArgs, site: string): SeoContext => {
        const access = cms.access(args.auth);
        return {
            cms,
            site,
            sees: (candidate) => access.sees(candidate),
            targets: new Map(),
        };
    };

    const pageSeo = route({
        method: 'GET',
        path: `${input.editingBase}/seo/page`,
        auth: input.editor,
        summary: 'Read how a page or an item does in search and AI answers, and what to fix',
        description:
            "The CMS's own checks on the search title, the description and the links, the links to it and from it, and pages that mention it without a link. With `seoData` on cms(), also its scores, keywords and the questions whose AI answers cite it, kept for a day unless `refresh` asks again.",
        tool: true,
        query: z.object({
            ref: z.string().describe('The page or item, like page:uk:plantCarePage or item:offices:k3j9x2, with @nb for a language.'),
            site: z.string().optional().describe('The site to read a shared item on. Without it, the first that shows it.'),
            refresh: z.boolean().optional().describe('Ask the service again rather than answer what it said today.'),
        }),
        responses: {
            200: {
                body: PageSeoSchema,
                cache: 'no-store',
            },
            400: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
            502: ProblemDetailsSchema,
        },
    }).handler(
        input.guarded(async (cms, args) => {
            const query = args.query as { ref: string; site?: string; refresh?: boolean };
            const ref = parseRef(query.ref);
            if (ref === undefined || ref.type === 'global') {
                throw new CmsHttpError(400, {
                    detail: `'${query.ref}' is not the ref of a page or an item.`,
                });
            }
            const access = cms.access(args.auth);
            access.assertSeesRef(ref);
            const source = sourceRefOf(ref);
            const state = await cms.draftState(source);
            const listing = source.type === 'item' ? cms.listingOf(source) : undefined;
            const site =
                query.site !== undefined
                    ? siteFrom(cms, args, query.site)
                    : source.type === 'page'
                      ? state.target.site
                      : listing !== undefined && listing.site !== DEFAULT_SITE
                        ? listing.site
                        : (listing?.routes[0]?.site ?? cms.siteNames()[0] ?? DEFAULT_SITE);
            const context = contextFor(cms, args, site);
            const locale = localeOf(cms, site, ref.locale);
            const href = await linkHref(
                cms,
                formatRef(source),
                {
                    site,
                    locale: ref.locale,
                },
                'draft'
            );
            const base = siteBaseOf(cms, site);
            const url =
                href === undefined ? undefined : /^https?:\/\//i.test(href) ? href : base === undefined ? undefined : `${base}${href}`;
            const refresh = query.refresh === true;
            const data = await askPage(cms, url, locale, refresh);
            const content = state.row?.draft ?? state.row?.published ?? {};
            let seoContent = content;
            if (ref.locale !== undefined) {
                const translated = (await cms.document(ref)).row;
                seoContent = {
                    ...content,
                    ...(translated?.draft ?? translated?.published ?? {}),
                };
            }

            const value = formatRef(source);
            const linksIn: LinkEnd[] = [];
            const holders = new Set<string>();
            for (const edge of await contentLinks(cms, value)) {
                if (!context.sees(edge.fromSite) || holders.has(edge.from)) continue;
                holders.add(edge.from);
                let holder: DraftState;
                try {
                    holder = await cms.draftState(parseRef(edge.from)!);
                } catch {
                    continue;
                }
                const held = holder.row?.draft ?? holder.row?.published ?? {};
                const anchor = heldLinksOf(held).find((link) => link.ref === value && edge.fieldPaths.includes(link.path))?.anchor;
                const path = cms.addressOf(holder.target, held);
                linksIn.push({
                    kind: 'page',
                    ref: edge.from,
                    title: documentLabel(holder),
                    ...(path === undefined
                        ? {}
                        : {
                              path,
                          }),
                    ...(anchor === undefined
                        ? {}
                        : {
                              anchor,
                          }),
                });
            }
            for (const backlink of data?.backlinks ?? []) {
                const path = URL.canParse(backlink.url) ? new URL(backlink.url).pathname : undefined;
                linksIn.push({
                    kind: 'external',
                    title: backlink.domain,
                    domain: backlink.domain,
                    url: backlink.url,
                    ...(path === undefined
                        ? {}
                        : {
                              path,
                          }),
                    ...(backlink.anchor === undefined
                        ? {}
                        : {
                              anchor: backlink.anchor,
                          }),
                });
            }

            const path = cms.addressOf(state.target, content);
            const report = await pageReport(context, {
                source,
                state,
                seoContent,
                url,
                locale,
                data,
                linkedHere: holders.size,
                path,
            });

            const title = documentLabel(state);
            const phrases = [
                title,
                ...[...(data?.keywords ?? [])]
                    .sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0))
                    .slice(0, 3)
                    .map((keyword) => keyword.keyword),
            ].filter((phrase, index, all) => phrase.trim().length >= 4 && phrase !== 'Untitled' && all.indexOf(phrase) === index);
            const couldLinkHere: Array<{ ref: string; title: string; phrase: string }> = [];
            if (phrases.length > 0) {
                for (const page of await pagesOn(cms, site)) {
                    if (couldLinkHere.length >= 10) break;
                    if (page.ref === value || holders.has(page.ref)) continue;
                    const candidate = (await cms.document(parseRef(page.ref)!)).row;
                    const text = textOf(candidate?.draft ?? candidate?.published ?? {});
                    for (const phrase of phrases) {
                        const found = phraseIn(text, phrase);
                        if (found === undefined) continue;
                        couldLinkHere.push({
                            ref: page.ref,
                            title: page.title,
                            phrase: found,
                        });
                        break;
                    }
                }
            }

            return {
                status: 200,
                body: {
                    checkedAt: data?.checkedAt ?? new Date().toISOString(),
                    label: cms.options.seoData?.label ?? null,
                    scores: data?.scores ?? null,
                    checks: report.checks,
                    keywords: data?.keywords ?? [],
                    citations: data?.citations ?? [],
                    links: {
                        in: linksIn,
                        out: report.out,
                    },
                    couldLinkHere,
                },
            };
        }) as never
    );

    /**
     * Every page and item on a site with what `seoData` says of its address,
     * leaving out the ones it fails on.
     */
    const pagesWithData = async (
        cms: CmsService,
        site: string,
        refresh: boolean
    ): Promise<Array<{ page: Awaited<ReturnType<typeof pagesOn>>[number]; data: PageSeoData | undefined }>> => {
        const pages = await pagesOn(cms, site);
        const base = siteBaseOf(cms, site);
        const seoData = cms.options.seoData;
        const locale = localeOf(cms, site);
        const found = new Map<string, PageSeoData>();
        if (seoData !== undefined && base !== undefined) {
            await eachLimited(pages, 6, async (page) => {
                try {
                    found.set(page.ref, await pageData(seoData, `${base}${page.path}`, locale, refresh));
                } catch {
                    // A page the service fails on shows without its scores.
                }
            });
        }
        return pages.map((page) => ({
            page,
            data: found.get(page.ref),
        }));
    };

    const siteSeo = route({
        method: 'GET',
        path: `${input.editingBase}/seo/site`,
        auth: input.editor,
        summary: 'Read how a site does in search and AI answers, and which pages have the most to fix',
        description:
            "The site's pages and items with the most to fix, by the CMS's own checks and the service's. With `seoData` on cms(), also the site's scores, keywords, the questions whose AI answers cite it, and searches where several of its pages compete. Kept for a day unless `refresh` asks again.",
        tool: true,
        query: z.object({
            site: z.string().optional().describe("The site, like uk, or 'default' for a CMS without sites."),
            refresh: z.boolean().optional().describe('Ask the service again rather than answer what it said today.'),
        }),
        responses: {
            200: {
                body: SiteSeoSchema,
                cache: 'no-store',
            },
            404: ProblemDetailsSchema,
            502: ProblemDetailsSchema,
        },
    }).handler(
        input.guarded(async (cms, args) => {
            const query = (args.query ?? {}) as { site?: string; refresh?: boolean };
            const site = siteFrom(cms, args, query.site);
            const context = contextFor(cms, args, site);
            const refresh = query.refresh === true;
            const locale = localeOf(cms, site);
            const linked = new Set((await contentLinks(cms)).filter((edge) => context.sees(edge.fromSite)).map((edge) => edge.to));
            const rows: Array<{ ref: string; title: string; path: string; checks: number; score: number }> = [];
            for (const { page, data } of await pagesWithData(cms, site, refresh)) {
                const ref = parseRef(page.ref)!;
                const state = await cms.draftState(ref);
                const report = await pageReport(context, {
                    source: ref,
                    state,
                    seoContent: state.row?.draft ?? state.row?.published ?? {},
                    url: undefined,
                    locale,
                    data,
                    linkedHere: linked.has(page.ref) ? 1 : 0,
                    path: page.path,
                });
                rows.push({
                    ref: page.ref,
                    title: page.title,
                    path: page.path,
                    checks: report.checks.length,
                    score: data?.scores.search ?? ownScoreOf(report.checks),
                });
            }
            const seoData = cms.options.seoData;
            const base = siteBaseOf(cms, site);
            let data: SiteSeoData | undefined;
            if (seoData !== undefined && base !== undefined) {
                try {
                    data = await siteData(seoData, new URL(base).origin, locale, refresh);
                } catch (error) {
                    throw new CmsHttpError(502, {
                        detail: `${seoData.label} did not answer for ${base}: ${error instanceof Error ? error.message : String(error)}`,
                    });
                }
            }
            return {
                status: 200,
                body: {
                    checkedAt: data?.checkedAt ?? new Date().toISOString(),
                    label: seoData?.label ?? null,
                    scores: (data?.scores ?? null) satisfies SeoScores | null,
                    mostToFix: rows
                        .filter((row) => row.checks > 0)
                        .sort((left, right) => left.score - right.score || right.checks - left.checks)
                        .slice(0, 10),
                    keywords: data?.keywords ?? [],
                    citations: data?.citations ?? [],
                    pages: rows.length,
                    backlinkDomains: data?.backlinkDomains ?? [],
                    competing: data?.competing ?? [],
                },
            };
        }) as never
    );

    const linkMap = route({
        method: 'GET',
        path: `${input.editingBase}/seo/link-map`,
        auth: input.editor,
        summary: "Map the links between a site's pages, to other sites, and to pages that are gone",
        description:
            'Every page and item on the site, the links between them read from their content, the other sites they link to and, with `seoData` on cms(), the other sites that link to them. A link to a page that is unpublished, in the trash or gone is `broken`, and its target is a node of its own.',
        tool: true,
        query: z.object({
            site: z.string().optional().describe("The site, like uk, or 'default' for a CMS without sites."),
        }),
        responses: {
            200: {
                body: LinkMapSchema,
                cache: 'no-store',
            },
            404: ProblemDetailsSchema,
        },
    }).handler(
        input.guarded(async (cms, args) => {
            const query = (args.query ?? {}) as { site?: string };
            const site = siteFrom(cms, args, query.site);
            const context = contextFor(cms, args, site);
            const pages = await pagesWithData(cms, site, false);
            const nodes = new Map<string, LinkNode>();
            for (const { page } of pages) {
                nodes.set(page.ref, {
                    id: page.ref,
                    kind: 'page',
                    ref: page.ref,
                    site: parseRef(page.ref)?.site ?? null,
                    title: page.title,
                    path: page.path,
                    linksIn: 0,
                    brokenOut: 0,
                });
            }
            const live = new Map(pages.map(({ page }) => [page.ref, page.status === 'published' || page.status === 'changed']));
            const favicons = new Map<string, string>();
            const seoData = cms.options.seoData;
            const base = siteBaseOf(cms, site);
            if (seoData !== undefined && base !== undefined) {
                try {
                    const data = await siteData(seoData, new URL(base).origin, localeOf(cms, site), false);
                    for (const domain of data.backlinkDomains ?? [])
                        if (domain.favicon !== undefined) favicons.set(domain.domain, domain.favicon);
                } catch {
                    // Without the site's data, other sites show without their icons.
                }
            }
            const external = (domain: string, path: string): string => {
                const id = `external:${domain}`;
                if (!nodes.has(id)) {
                    const favicon = favicons.get(domain);
                    nodes.set(id, {
                        id,
                        kind: 'external',
                        title: domain,
                        domain,
                        path,
                        ...(favicon === undefined
                            ? {}
                            : {
                                  favicon,
                              }),
                    });
                }
                return id;
            };
            const edges = new Map<string, LinkEdge>();
            const addEdge = (edge: LinkEdge): void => {
                const key = `${edge.from} ${edge.to}`;
                if (!edges.has(key)) edges.set(key, edge);
            };
            for (const { page, data } of pages) {
                const row = (await cms.document(parseRef(page.ref)!)).row;
                const outbound = new Map((data?.outboundStatus ?? []).map((entry) => [entry.url, entry.status]));
                for (const link of heldLinksOf(row?.draft ?? row?.published ?? {})) {
                    const found = await endOf(context, link, outbound);
                    if (found === undefined) continue;
                    const anchor =
                        found.end.anchor === undefined
                            ? {}
                            : {
                                  anchor: found.end.anchor,
                              };
                    if (found.end.kind === 'external') {
                        addEdge({
                            from: page.ref,
                            to: external(found.end.domain!, found.end.path ?? '/'),
                            broken: found.check !== undefined,
                            external: true,
                            ...anchor,
                        });
                        continue;
                    }
                    const to = found.end.ref!;
                    if (found.end.kind === 'page' && !nodes.has(to)) {
                        // A live page of another site, which a visitor reaches at its own address.
                        const href = await linkHref(
                            cms,
                            to,
                            {
                                site,
                                locale: undefined,
                            },
                            'published'
                        );
                        if (href === undefined || !/^https?:\/\//i.test(href)) continue;
                        const url = new URL(href);
                        addEdge({
                            from: page.ref,
                            to: external(url.hostname, url.pathname),
                            broken: false,
                            external: true,
                            ...anchor,
                        });
                        continue;
                    }
                    if (found.end.kind === 'broken' && !nodes.has(to)) {
                        nodes.set(to, {
                            id: to,
                            kind: 'broken',
                            ref: to,
                            title: found.end.title,
                            reason: found.end.reason!,
                        });
                    }
                    addEdge({
                        from: page.ref,
                        to,
                        broken: found.end.kind === 'broken' || live.get(to) === false,
                        external: false,
                        ...anchor,
                    });
                }
                for (const backlink of data?.backlinks ?? []) {
                    const path = URL.canParse(backlink.url) ? new URL(backlink.url).pathname : '/';
                    addEdge({
                        from: external(backlink.domain, path),
                        to: page.ref,
                        broken: false,
                        external: true,
                        ...(backlink.anchor === undefined
                            ? {}
                            : {
                                  anchor: backlink.anchor,
                              }),
                    });
                }
            }
            for (const edge of edges.values()) {
                const target = nodes.get(edge.to);
                if (target?.kind === 'page') target.linksIn = (target.linksIn ?? 0) + 1;
                const holder = nodes.get(edge.from);
                if (edge.broken && holder?.kind === 'page') holder.brokenOut = (holder.brokenOut ?? 0) + 1;
            }
            return {
                status: 200,
                body: {
                    nodes: [...nodes.values()],
                    edges: [...edges.values()],
                },
            };
        }) as never
    );

    const pageScores = route({
        method: 'GET',
        path: `${input.editingBase}/seo/page-scores`,
        auth: input.editor,
        summary: "Read the search and AI answer scores of a site's pages and items",
        description:
            'The scores `seoData` on cms() gives each page and item on the site, by ref, for the lists to show. Empty without `seoData`.',
        query: z.object({
            site: z.string().optional().describe("The site, like uk, or 'default' for a CMS without sites."),
        }),
        responses: {
            200: {
                body: PageScoresSchema,
                cache: 'no-store',
            },
            404: ProblemDetailsSchema,
        },
    }).handler(
        input.guarded(async (cms, args) => {
            const query = (args.query ?? {}) as { site?: string };
            const site = siteFrom(cms, args, query.site);
            const scores: Record<string, SeoScores> = {};
            if (cms.options.seoData !== undefined) {
                for (const { page, data } of await pagesWithData(cms, site, false)) {
                    if (data !== undefined) {
                        scores[page.ref] = {
                            search: data.scores.search,
                            answers: data.scores.answers,
                        };
                    }
                }
            }
            return {
                status: 200,
                body: {
                    scores,
                },
            };
        }) as never
    );

    const similarPages = route({
        method: 'GET',
        path: `${input.editingBase}/seo/similar-pages`,
        auth: input.editor,
        summary: "List the searches several of a site's pages compete for, with the page to keep and the fix",
        description:
            'From `seoData` on cms(): each search more than one page or item of the site ranks for, the page ranking best as `winner`, and how alike each other page is to it. `fix` is `merge` when one is 85% or more the same, otherwise `link`, and `why` says what the competing costs. Empty without `seoData`.',
        tool: true,
        query: z.object({
            site: z.string().optional().describe("The site, like uk, or 'default' for a CMS without sites."),
            refresh: z.boolean().optional().describe('Ask the service again rather than answer what it said today.'),
        }),
        responses: {
            200: {
                body: SimilarPagesSchema,
                cache: 'no-store',
            },
            404: ProblemDetailsSchema,
            502: ProblemDetailsSchema,
        },
    }).handler(
        input.guarded(async (cms, args) => {
            const query = (args.query ?? {}) as { site?: string; refresh?: boolean };
            const site = siteFrom(cms, args, query.site);
            const seoData = cms.options.seoData;
            const base = siteBaseOf(cms, site);
            if (seoData === undefined || base === undefined) {
                return {
                    status: 200,
                    body: {
                        checkedAt: new Date().toISOString(),
                        label: seoData?.label ?? null,
                        searches: [],
                    },
                };
            }
            const refresh = query.refresh === true;
            const pages = await pagesWithData(cms, site, refresh);
            const baseUrl = new URL(base);
            const prefix = baseUrl.pathname.replace(/\/+$/, '');
            const byAddress = new Map(pages.map(({ page }) => [`${base}${page.path}`, page]));
            const byPath = new Map(pages.map(({ page }) => [`${prefix}${page.path}`, page]));
            const pageAt = (address: string) => {
                const exact = byAddress.get(address);
                if (exact !== undefined || !URL.canParse(address)) return exact;
                const url = new URL(address);
                return url.origin === baseUrl.origin ? byPath.get(url.pathname) : undefined;
            };
            let data: SiteSeoData;
            try {
                data = await siteData(seoData, baseUrl.origin, localeOf(cms, site), refresh);
            } catch (error) {
                throw new CmsHttpError(502, {
                    detail: `${seoData.label} did not answer for ${base}: ${error instanceof Error ? error.message : String(error)}`,
                });
            }
            const searches = [];
            for (const competing of data.competing ?? []) {
                const matched = new Map<
                    string,
                    { page: Awaited<ReturnType<typeof pagesOn>>[number]; position?: number; similarity?: number }
                >();
                for (const entry of competing.urls) {
                    const page = pageAt(entry.url);
                    if (page === undefined || matched.has(page.ref)) continue;
                    matched.set(page.ref, {
                        page,
                        ...(entry.position === undefined
                            ? {}
                            : {
                                  position: entry.position,
                              }),
                        ...(entry.similarity === undefined
                            ? {}
                            : {
                                  similarity: entry.similarity,
                              }),
                    });
                }
                if (matched.size < 2) continue;
                const [best, ...rest] = [...matched.values()].sort(
                    (left, right) => (left.position ?? Number.POSITIVE_INFINITY) - (right.position ?? Number.POSITIVE_INFINITY)
                );
                const shown = (entry: NonNullable<typeof best>) => ({
                    ref: entry.page.ref,
                    title: entry.page.title,
                    path: entry.page.path,
                    ...(entry.position === undefined
                        ? {}
                        : {
                              position: entry.position,
                          }),
                });
                const winner = shown(best!);
                const others = rest.map((entry) => ({
                    ...shown(entry),
                    similarity: entry.similarity ?? 0,
                }));
                const fix: 'merge' | 'link' = others.some((other) => other.similarity >= MERGE_SIMILARITY) ? 'merge' : 'link';
                searches.push({
                    keyword: competing.keyword,
                    volume: competing.volume,
                    winner,
                    others,
                    fix,
                    why: similarWhy({
                        volume: competing.volume,
                        fix,
                        winner,
                        others,
                    }),
                });
            }
            return {
                status: 200,
                body: {
                    checkedAt: data.checkedAt,
                    label: seoData.label,
                    searches: searches.sort((left, right) => right.volume - left.volume),
                },
            };
        }) as never
    );

    return {
        pageSeo,
        siteSeo,
        linkMap,
        pageScores,
        similarPages,
    };
};
