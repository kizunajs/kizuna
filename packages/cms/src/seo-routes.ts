import { z } from 'zod';
import { Kizuna, type RouteAuth } from 'kizunajs';
import { route } from 'kizunajs/plugin';
import { ProblemDetailsSchema, ValidationErrorSchema } from 'kizunajs/schemas';
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
import type { MergeRow } from './storage/merge-store.js';
import { mergeNow } from './merges.js';
import {
    mergedRichText,
    nodesOf,
    nodeText,
    partKindOf,
    richTextFieldsOf,
    topicMatchOf,
    unsaidNodes,
    withLinkAt,
    type RichTextNode,
    type TopicMatch,
} from './seo-fixes.js';

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
                            fixing: z
                                .enum(['merge', 'link'])
                                .nullable()
                                .describe(
                                    '`merge` when it merges into the winner once the winner publishes, `link` when its draft links to the winner, otherwise null.'
                                ),
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

const PlannedPageSchema = z.object({
    ref: z.string(),
    title: z.string(),
    path: z.string().nullable(),
    refusal: z.string().nullable().describe('Why it cannot take this fix, or null when it can.'),
});

export const MergePlanSchema = Kizuna.model({
    title: 'CMS.MergePlan',
    schema: z.object({
        winner: z.object({
            ref: z.string(),
            title: z.string(),
            field: z.string().nullable().describe('The rich text field the parts join, or null when the winner has none.'),
        }),
        pages: z.array(
            PlannedPageSchema.extend({
                parts: z
                    .array(
                        z.object({
                            id: z.string().describe('What `parts` names it by when merging, its field and `_key`, like body.k3j9x2.'),
                            kind: z.enum(['paragraph', 'heading', 'quote', 'listItem', 'image', 'block']),
                            text: z.string().describe('Its words, or for an image or a block without words, its type.'),
                            fits: z.boolean().describe("Whether the winner's rich text field can hold it."),
                        })
                    )
                    .describe("The paragraphs and blocks of its rich text the winner does not say, in the page's order."),
            })
        ),
    }),
});

export const MergeBodySchema = z.object({
    winner: z.string().describe('The page or item to keep, like page:uk:plantCarePage.'),
    pages: z
        .array(
            z.object({
                ref: z.string().describe('A page or item to merge into the winner.'),
                parts: z.array(z.string()).describe('The ids of the parts to move, from the merge plan.'),
            })
        )
        .min(1),
});

export const MergedSchema = Kizuna.model({
    title: 'CMS.Merged',
    schema: z.object({
        ref: z.string().describe('The winner, whose draft holds the moved parts.'),
        title: z.string(),
        moved: z.int().describe('How many parts joined its draft.'),
        merging: z.array(
            z.object({
                ref: z.string(),
                title: z.string(),
            })
        ),
        waitsForPublish: z
            .boolean()
            .describe(
                'True while the redirects and the trash wait for the winner to publish. False when the winner had nothing new to publish, so they happened now.'
            ),
    }),
});

export const LinkPlanSchema = Kizuna.model({
    title: 'CMS.LinkPlan',
    schema: z.object({
        winner: z.object({
            ref: z.string(),
            title: z.string(),
        }),
        pages: z.array(
            PlannedPageSchema.extend({
                sentence: z
                    .object({
                        text: z.string(),
                        phrase: z.string().describe('The words in it that carry the link.'),
                        at: z.int().describe('Where the words start in `text`.'),
                    })
                    .nullable()
                    .describe('The sentence where it repeats the topic, or null when none does.'),
            })
        ),
    }),
});

export const LinkBodySchema = z.object({
    winner: z.string().describe('The page or item to link to, like page:uk:plantCarePage.'),
    keyword: z.string().describe('The search the pages compete for, the first words a link goes on.'),
    pages: z.array(z.string()).min(1).describe('The pages and items to add the link to.'),
});

export const LinkedSchema = Kizuna.model({
    title: 'CMS.Linked',
    schema: z.object({
        drafts: z
            .array(
                z.object({
                    ref: z.string(),
                    title: z.string(),
                })
            )
            .describe('The drafts that now link to the winner.'),
        skipped: z.array(
            z.object({
                ref: z.string(),
                title: z.string(),
                reason: z.string(),
            })
        ),
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
 * A page or item a fix names, as its source, refused when it is neither or
 * the caller may not open it.
 */
const fixRefOf = (cms: CmsService, args: EditingArgs, value: string): DocumentRef => {
    const ref = parseRef(value);
    if (ref === undefined || ref.type === 'global') {
        throw new CmsHttpError(400, {
            detail: `'${value}' is not the ref of a page or an item.`,
        });
    }
    return sourceRefOf(cms.canonical(cms.access(args.auth).assertSeesRef(ref)));
};

/**
 * A page or item a fix reads and writes: its draft, or its published copy
 * before it has one, its title and its address.
 */
interface FixDocument {
    ref: DocumentRef;
    value: string;
    state: DraftState;
    title: string;
    content: Record<string, unknown>;
    path: string | null;
}

const fixDocumentOf = async (cms: CmsService, args: EditingArgs, value: string): Promise<FixDocument> => {
    const ref = fixRefOf(cms, args, value);
    const formatted = formatRef(ref);
    if ((await cms.trashed(ref)) !== undefined) {
        throw new CmsHttpError(404, {
            detail: `'${formatted}' is in the trash.`,
        });
    }
    const state = await cms.draftState(ref);
    if (state.row === undefined) {
        throw new CmsHttpError(404, {
            detail: `'${formatted}' has no content yet.`,
        });
    }
    const content = state.row.draft ?? state.row.published ?? {};
    return {
        ref,
        value: formatted,
        state,
        title: documentLabel(state),
        content,
        path: cms.addressOf(state.target, content) ?? null,
    };
};

/**
 * Each rich text field of a document with the nodes it holds.
 */
const richTextOf = (document: FixDocument): Array<{ field: string; nodes: RichTextNode[] }> =>
    richTextFieldsOf(document.state.target.definition).map((field) => ({
        field,
        nodes: nodesOf(document.content[field]),
    }));

const typeWords = (type: string): string =>
    type
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .replace(/^./, (first) => first.toUpperCase());

/**
 * The parts of a page's rich text the winner does not say, each named by its
 * field and `_key`, and whether the winner's field can hold it.
 */
const unsaidPartsOf = (winner: FixDocument, field: string | null, page: FixDocument) => {
    const said = richTextOf(winner).flatMap((each) => each.nodes);
    const schema =
        field === null ? undefined : dataFields(winner.state.target.definition.fields).find((candidate) => candidate.name === field)?.schema;
    return richTextOf(page).flatMap((each) =>
        unsaidNodes(said, each.nodes)
            .filter((node) => typeof node['_key'] === 'string')
            .map((node) => {
                const text = nodeText(node);
                return {
                    id: `${each.field}.${String(node['_key'])}`,
                    kind: partKindOf(node),
                    text: text === '' ? typeWords(String(node['_type'])) : text,
                    fits: schema !== undefined && schema.safeParse([node]).success,
                    node,
                };
            })
    );
};

/**
 * Why a page cannot merge into the winner, or null when it can: it is the
 * winner, the site's front page, shared content the caller may not take off
 * every site, or part of another merge.
 */
const mergeRefusalOf = (
    cms: CmsService,
    args: EditingArgs,
    winner: FixDocument,
    page: FixDocument,
    pending: readonly MergeRow[]
): string | null => {
    if (page.value === winner.value) return `${page.title} is the page to keep.`;
    if (page.ref.type === 'page' && page.path === '/') return `${page.title} is the front page of its site, so it stays.`;
    if (!cms.mayPublish(cms.access(args.auth), page.ref)) {
        return `${page.title} is shared by every site, so only an admin over every site can take it off them.`;
    }
    if (pending.some((merge) => merge.ref === page.value)) {
        return `Other pages merge into ${page.title} when it publishes. Publish it first.`;
    }
    if (pending.some((merge) => merge.ref !== winner.value && merge.merged.includes(page.value))) {
        return `${page.title} already merges into another page when that page publishes.`;
    }
    return null;
};

/**
 * The words a link to the winner goes on, the search first, then the
 * winner's title.
 */
const topicPhrases = (keyword: string | undefined, winner: FixDocument): string[] =>
    [keyword ?? '', winner.title].filter((phrase, index, all) => phrase.trim().length >= 3 && all.indexOf(phrase) === index);

/**
 * Where a page repeats the topic, or why it takes no link: it links to the
 * winner already, or no sentence says the topic.
 */
const linkPlanOf = (
    winner: FixDocument,
    page: FixDocument,
    keyword: string | undefined
): { match: TopicMatch; refusal: null } | { match: undefined; refusal: string } => {
    if (page.value === winner.value) {
        return {
            match: undefined,
            refusal: `${page.title} is the page they link to.`,
        };
    }
    if (heldLinksOf(page.content).some((link) => link.ref === winner.value)) {
        return {
            match: undefined,
            refusal: `${page.title} links to ${winner.title} already.`,
        };
    }
    const match = topicMatchOf(richTextOf(page), topicPhrases(keyword, winner));
    return match === undefined
        ? {
              match: undefined,
              refusal: `No sentence in ${page.title} says ${topicPhrases(keyword, winner)
                  .map((phrase) => `"${phrase}"`)
                  .join(' or ')}.`,
          }
        : {
              match,
              refusal: null,
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
            // A page has its address before it holds any content, as the lists show it.
            const href =
                (await linkHref(
                    cms,
                    formatRef(source),
                    {
                        site,
                        locale: ref.locale,
                    },
                    'draft'
                )) ?? (source.type === 'page' && ref.locale === undefined ? state.target.path : undefined);
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
            refresh: z.boolean().optional().describe('Ask the service again rather than answer what it said today.'),
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
            const query = (args.query ?? {}) as { site?: string; refresh?: boolean };
            const site = siteFrom(cms, args, query.site);
            const context = contextFor(cms, args, site);
            const refresh = query.refresh === true;
            const pages = await pagesWithData(cms, site, refresh);
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
                    const data = await siteData(seoData, new URL(base).origin, localeOf(cms, site), refresh);
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
            refresh: z.boolean().optional().describe('Ask the service again rather than answer what it said today.'),
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
            const query = (args.query ?? {}) as { site?: string; refresh?: boolean };
            const site = siteFrom(cms, args, query.site);
            const scores: Record<string, SeoScores> = {};
            if (cms.options.seoData !== undefined) {
                for (const { page, data } of await pagesWithData(cms, site, query.refresh === true)) {
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
            const pending = await cms.merges.allPending();
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
                const others = [];
                for (const entry of rest) {
                    let fixing: 'merge' | 'link' | null = null;
                    if (pending.some((merge) => merge.ref === winner.ref && merge.merged.includes(entry.page.ref))) {
                        fixing = 'merge';
                    } else {
                        const row = (await cms.document(parseRef(entry.page.ref)!)).row;
                        if (heldLinksOf(row?.draft ?? row?.published ?? {}).some((link) => link.ref === winner.ref)) fixing = 'link';
                    }
                    others.push({
                        ...shown(entry),
                        similarity: entry.similarity ?? 0,
                        fixing,
                    });
                }
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

    const mergePlan = route({
        method: 'GET',
        path: `${input.editingBase}/seo/merge-plan`,
        auth: input.editor,
        summary: 'List what each page to merge says that the page to keep does not',
        description:
            "For each page or item in `pages`, the paragraphs and blocks of its rich text the winner does not say already, compared by their words, and why a page cannot merge, like being the site's front page. Read it before `editing_merge_pages`, which takes the ids of the parts to move.",
        tool: true,
        query: z.object({
            winner: z.string().describe('The page or item to keep, like page:uk:plantCarePage.'),
            pages: z.array(z.string()).describe('The pages and items to merge into it.'),
        }),
        responses: {
            200: {
                body: MergePlanSchema,
                cache: 'no-store',
            },
            400: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
        },
    }).handler(
        input.guarded(async (cms, args) => {
            const query = args.query as { winner: string; pages: string[] };
            const winner = await fixDocumentOf(cms, args, query.winner);
            const field = richTextFieldsOf(winner.state.target.definition)[0] ?? null;
            const pending = await cms.merges.allPending();
            const pages = [];
            for (const value of [query.pages].flat()) {
                const page = await fixDocumentOf(cms, args, value);
                pages.push({
                    ref: page.value,
                    title: page.title,
                    path: page.path,
                    refusal: mergeRefusalOf(cms, args, winner, page, pending),
                    parts: unsaidPartsOf(winner, field, page).map(({ node: _node, ...part }) => part),
                });
            }
            return {
                status: 200,
                body: {
                    winner: {
                        ref: winner.value,
                        title: winner.title,
                        field,
                    },
                    pages,
                },
            };
        }) as never
    );

    const mergePages = route({
        method: 'POST',
        path: `${input.editingBase}/seo/merge`,
        auth: input.editor,
        summary: 'Merge pages into the page to keep, which takes them over when it publishes',
        description:
            "Moves the parts named in each page's `parts`, ids from `editing_merge_plan`, into the winner's draft at the end of its rich text, under a heading with that page's title. When the winner publishes, each merged page's address redirects to it, a merged item goes to the trash and a merged page is unpublished. Until then the site stays as it is. A winner with nothing new to publish takes them over now. The person confirms before this runs.",
        tool: {
            needsApproval: true,
        },
        body: MergeBodySchema,
        responses: {
            200: {
                body: MergedSchema,
                cache: 'no-store',
            },
            400: ProblemDetailsSchema,
            403: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
            409: ProblemDetailsSchema,
            422: ValidationErrorSchema,
        },
    }).handler(
        input.guarded(async (cms, args) => {
            const body = args.body as z.output<typeof MergeBodySchema>;
            const author = cms.author(args.auth?.[cms.identity]);
            const access = cms.access(args.auth);
            const winner = await fixDocumentOf(cms, args, body.winner);
            const field = richTextFieldsOf(winner.state.target.definition)[0];
            const pending = await cms.merges.allPending();
            const sections: Array<{ title: string; nodes: RichTextNode[] }> = [];
            const merging: Array<{ ref: string; title: string }> = [];
            for (const asked of body.pages) {
                const page = await fixDocumentOf(cms, args, asked.ref);
                if (merging.some((each) => each.ref === page.value)) continue;
                const refusal = mergeRefusalOf(cms, args, winner, page, pending);
                if (refusal !== null) {
                    throw new CmsHttpError(422, {
                        detail: refusal,
                        errors: [],
                    });
                }
                const chosen = new Set(asked.parts);
                const parts = field === undefined ? [] : unsaidPartsOf(winner, field, page).filter((part) => chosen.has(part.id));
                const unfit = parts.find((part) => !part.fits);
                if (unfit !== undefined) {
                    throw new CmsHttpError(422, {
                        detail: `${winner.title} cannot hold the ${unfit.kind === 'block' ? unfit.text.toLowerCase() : unfit.kind} '${unfit.id}' of ${page.title}. Leave it out.`,
                        errors: [],
                    });
                }
                if (asked.parts.length > 0 && field === undefined) {
                    throw new CmsHttpError(422, {
                        detail: `${winner.title} has no rich text field to move the parts into.`,
                        errors: [],
                    });
                }
                sections.push({
                    title: page.title,
                    nodes: parts.map((part) => part.node),
                });
                merging.push({
                    ref: page.value,
                    title: page.title,
                });
            }
            const moved = sections.reduce((sum, section) => sum + section.nodes.length, 0);
            if (moved > 0 && field !== undefined) {
                await cms.assertNotHeld(winner.ref, author);
                await cms.update({
                    ref: winner.ref,
                    changes: {
                        [field]: mergedRichText(nodesOf(winner.content[field]), sections),
                    },
                    caller: access.callerFor(winner.ref),
                    access,
                    author,
                    summary: `Merged ${merging.map((page) => page.title).join(', ')} into this page`,
                });
            }
            await cms.merges.record(
                winner.value,
                merging.map((page) => page.ref),
                author
            );
            const status = (await cms.draftState(winner.ref)).status;
            const waitsForPublish = status !== 'published';
            if (!waitsForPublish) await mergeNow(cms, winner.ref, author);
            return {
                status: 200,
                body: {
                    ref: winner.value,
                    title: winner.title,
                    moved,
                    merging,
                    waitsForPublish,
                },
            };
        }) as never
    );

    const linkPlan = route({
        method: 'GET',
        path: `${input.editingBase}/seo/link-plan`,
        auth: input.editor,
        summary: 'Find the sentence where each competing page repeats the topic, to link it to the page to keep',
        description:
            "For each page or item in `pages`, the first sentence of its rich text that says the search or the winner's title, with the words a link to the winner goes on, or why it takes no link. Read it before `editing_link_pages`.",
        tool: true,
        query: z.object({
            winner: z.string().describe('The page or item to link to, like page:uk:plantCarePage.'),
            keyword: z.string().optional().describe('The search the pages compete for.'),
            pages: z.array(z.string()).describe('The pages and items to link from.'),
        }),
        responses: {
            200: {
                body: LinkPlanSchema,
                cache: 'no-store',
            },
            400: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
        },
    }).handler(
        input.guarded(async (cms, args) => {
            const query = args.query as { winner: string; keyword?: string; pages: string[] };
            const winner = await fixDocumentOf(cms, args, query.winner);
            const pages = [];
            for (const value of [query.pages].flat()) {
                const page = await fixDocumentOf(cms, args, value);
                const plan = linkPlanOf(winner, page, query.keyword);
                pages.push({
                    ref: page.value,
                    title: page.title,
                    path: page.path,
                    refusal: plan.refusal,
                    sentence:
                        plan.match === undefined
                            ? null
                            : {
                                  text: plan.match.sentence,
                                  phrase: plan.match.phrase,
                                  at: plan.match.at,
                              },
                });
            }
            return {
                status: 200,
                body: {
                    winner: {
                        ref: winner.value,
                        title: winner.title,
                    },
                    pages,
                },
            };
        }) as never
    );

    const linkPages = route({
        method: 'POST',
        path: `${input.editingBase}/seo/link`,
        auth: input.editor,
        summary: 'Link competing pages to the page to keep, in their drafts',
        description:
            "Writes a draft of each page or item in `pages` with a link to the winner on the words where it repeats the topic, as `editing_link_plan` finds them. A page that links to the winner already, or says the topic nowhere, is skipped and named in `skipped`. Nothing goes live until each draft is published.",
        tool: true,
        body: LinkBodySchema,
        responses: {
            200: {
                body: LinkedSchema,
                cache: 'no-store',
            },
            400: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
            422: ValidationErrorSchema,
        },
    }).handler(
        input.guarded(async (cms, args) => {
            const body = args.body as z.output<typeof LinkBodySchema>;
            const author = cms.author(args.auth?.[cms.identity]);
            const access = cms.access(args.auth);
            const winner = await fixDocumentOf(cms, args, body.winner);
            const drafts: Array<{ ref: string; title: string }> = [];
            const skipped: Array<{ ref: string; title: string; reason: string }> = [];
            for (const value of [...new Set(body.pages)]) {
                const page = await fixDocumentOf(cms, args, value);
                const plan = linkPlanOf(winner, page, body.keyword);
                const linked =
                    plan.match === undefined ? undefined : withLinkAt(nodesOf(page.content[plan.match.field]), plan.match, winner.value);
                if (plan.match === undefined || linked === undefined) {
                    skipped.push({
                        ref: page.value,
                        title: page.title,
                        reason: plan.refusal ?? `${page.title} changed. Look again.`,
                    });
                    continue;
                }
                try {
                    await cms.assertNotHeld(page.ref, author);
                } catch (error) {
                    if (!(error instanceof CmsHttpError)) throw error;
                    skipped.push({
                        ref: page.value,
                        title: page.title,
                        reason: `Someone else is editing ${page.title}.`,
                    });
                    continue;
                }
                await cms.update({
                    ref: page.ref,
                    changes: {
                        [plan.match.field]: linked,
                    },
                    caller: access.callerFor(page.ref),
                    access,
                    author,
                    summary: `Linked to ${winner.title}`,
                });
                drafts.push({
                    ref: page.value,
                    title: page.title,
                });
            }
            return {
                status: 200,
                body: {
                    drafts,
                    skipped,
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
        mergePlan,
        mergePages,
        linkPlan,
        linkPages,
    };
};
