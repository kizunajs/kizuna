/**
 * How a score reads: `good` from 80, `fair` from 50, and `poor` under that.
 */
export type SeoBand = 'good' | 'fair' | 'poor';

export const bandOf = (score: number): SeoBand => (score >= 80 ? 'good' : score >= 50 ? 'fair' : 'poor');

export interface SeoScores {
    search: number;
    answers: number;
}

export interface SiteSeoKeyword {
    keyword: string;
    position?: number;
    volume?: number;
    change?: number;
    /**
     * The page that ranks for it.
     */
    url?: string;
}

export interface SiteSeoCitation {
    question: string;
    engines: string[];
    url?: string;
}

export interface SiteSeoCompeting {
    keyword: string;
    volume: number;
    urls: Array<{
        url: string;
        position?: number;
        similarity?: number;
    }>;
}

export interface SiteSeoPage {
    ref: string;
    title: string;
    path: string;
    /**
     * How many things there are to fix on it.
     */
    checks: number;
    score: number | null;
}

/**
 * What `editing_site_seo` answers. A section the provider has no data for is
 * left out, and without a provider `scores` is `null`.
 */
export interface SiteSeoAnswer {
    checkedAt: string;
    /**
     * The name the numbers are credited to.
     */
    label: string | null;
    scores: SeoScores | null;
    mostToFix: SiteSeoPage[];
    keywords?: SiteSeoKeyword[];
    citations?: SiteSeoCitation[];
    competing?: SiteSeoCompeting[];
    backlinkDomains?: Array<{
        domain: string;
        links: number;
        favicon?: string;
    }>;
    /**
     * How many pages and items the score is taken across.
     */
    pages?: number;
}

/**
 * One end of a link, in the page SEO answer: a page of the CMS, another
 * site, or a target that is gone.
 */
export interface LinkEnd {
    kind: 'page' | 'external' | 'broken';
    ref?: string;
    title: string;
    path?: string;
    domain?: string;
    anchor?: string;
    reason?: 'trash' | 'missing';
}

/**
 * The parts of `editing_page_seo` the link map's inspector shows.
 */
export interface PageLinksAnswer {
    links: {
        in: LinkEnd[];
        out: LinkEnd[];
    };
    couldLinkHere: Array<{
        ref: string;
        title: string;
        phrase: string;
    }>;
}

export interface SiteStat {
    label: string;
    value: string;
    detail?: string;
}

const WHOLE = new Intl.NumberFormat('en-GB');

export const wholeOf = (value: number): string => WHOLE.format(value);

/**
 * The four numbers on top of the SEO screen, each left out when there is no
 * data for it.
 */
export const siteStatsOf = (answer: SiteSeoAnswer): SiteStat[] => {
    const stats: SiteStat[] = [];
    if (answer.scores !== null) {
        stats.push({
            label: 'SEO',
            value: wholeOf(answer.scores.search),
            ...(answer.pages === undefined
                ? {}
                : {
                      detail: `Across ${wholeOf(answer.pages)} pages and items`,
                  }),
        });
        stats.push({
            label: 'AI answers',
            value: wholeOf(answer.scores.answers),
            ...(answer.citations === undefined || answer.citations.length === 0
                ? {}
                : {
                      detail: `Cited in ${answer.citations.filter((citation) => citation.engines.length > 0).length} of ${answer.citations.length} questions`,
                  }),
        });
    }
    if (answer.keywords !== undefined && answer.keywords.length > 0) {
        const firstPage = answer.keywords.filter((keyword) => keyword.position !== undefined && keyword.position <= 10).length;
        stats.push({
            label: 'First page of results',
            value: wholeOf(firstPage),
            detail: `Of ${wholeOf(answer.keywords.length)} keywords`,
        });
    }
    if (answer.backlinkDomains !== undefined && answer.backlinkDomains.length > 0) {
        const links = answer.backlinkDomains.reduce((sum, domain) => sum + domain.links, 0);
        stats.push({
            label: 'Other sites that link here',
            value: wholeOf(links),
            detail: answer.backlinkDomains.length === 1 ? 'From 1 site' : `From ${wholeOf(answer.backlinkDomains.length)} sites`,
        });
    }
    return stats;
};

/**
 * A URL's path, or the URL itself when it is not one.
 */
export const pathOfUrl = (url: string): string => {
    try {
        return new URL(url, 'http://site.invalid').pathname;
    } catch {
        return url;
    }
};

/**
 * Names a URL by the page at its path when the answer knows it, and by the
 * path otherwise.
 */
export const pageNamerOf = (pages: readonly SiteSeoPage[]): ((url: string) => { title: string; ref?: string }) => {
    const byPath = new Map(pages.map((page) => [page.path, page]));
    return (url) => {
        const path = pathOfUrl(url);
        const page = byPath.get(path);
        return page === undefined
            ? {
                  title: path,
              }
            : {
                  title: page.title,
                  ref: page.ref,
              };
    };
};

/**
 * How similar two pages must be before the advice is to merge them.
 */
const MERGE_SIMILARITY = 0.85;

/**
 * What to do about pages that compete for one search: keep the one that
 * ranks best, and merge the rest into it when they say the same, or link
 * them to it when they do not.
 */
export const competeAdviceOf = (competing: SiteSeoCompeting, nameOf: (url: string) => { title: string }): string => {
    const ranked = [...competing.urls].sort(
        (left, right) => (left.position ?? Number.POSITIVE_INFINITY) - (right.position ?? Number.POSITIVE_INFINITY)
    );
    const [keeper, ...rest] = ranked;
    if (keeper === undefined) return '';
    const title = nameOf(keeper.url).title;
    return rest.some((candidate) => (candidate.similarity ?? 0) >= MERGE_SIMILARITY) ? `Merge into ${title}` : `Link to ${title}`;
};

/**
 * How loud a count of competing pages reads: three or more is a problem,
 * two is worth a look.
 */
export const competeBandOf = (pages: number): SeoBand => (pages >= 3 ? 'poor' : pages === 2 ? 'fair' : 'good');

/**
 * A page or item in a group that competes for one search.
 */
export interface SimilarPage {
    ref: string;
    title: string;
    path: string;
    position?: number;
}

/**
 * One search several of the site's pages compete for: the page that ranks
 * best, the others with how much of it they repeat, and the fix.
 */
export interface SimilarSearch {
    keyword: string;
    volume: number;
    winner: SimilarPage;
    others: Array<
        SimilarPage & {
            /**
             * How much of the winner it says, from 0 to 1.
             */
            similarity: number;
            /**
             * `merge` while it waits to merge into the winner, `link` once its
             * draft links to the winner.
             */
            fixing: 'merge' | 'link' | null;
        }
    >;
    fix: 'merge' | 'link';
    why: string;
}

/**
 * What `editing_similar_pages` answers, largest search first.
 */
export interface SimilarPagesAnswer {
    checkedAt: string;
    label: string | null;
    searches: SimilarSearch[];
}

/**
 * How loud a group reads in the list: red when its pages should merge,
 * yellow when they should link.
 */
export const similarBandOf = (search: SimilarSearch): SeoBand => (search.fix === 'merge' ? 'poor' : 'fair');

/**
 * The fix for a group of competing pages: its title, what happens, and the
 * button's words. Once every page is merging or linked, the button opens
 * the winner, which is what is left to publish.
 */
export const similarFixOf = (search: SimilarSearch): { title: string; sentence: string; action: string; done: boolean } => {
    const winner = search.winner.title;
    const [only] = search.others;
    const pages =
        search.others.length === 1 && only !== undefined
            ? only.title
            : search.others.length === 2
              ? 'both pages'
              : `the ${search.others.length} pages`;
    const one = search.others.length === 1;
    const done = search.others.length > 0 && search.others.every((page) => page.fixing !== null);
    if (search.fix === 'merge') {
        return {
            title: `Merge ${pages} into ${winner}`,
            sentence: done
                ? `${one ? 'It merges' : 'They merge'} into ${winner} when ${winner} publishes.`
                : `Move what only ${one ? 'it says' : 'they say'} into ${winner}. When ${winner} publishes, ${one ? 'its address redirects' : 'their addresses redirect'} to it.`,
            action: done ? `Open ${winner}` : `Merge into ${winner}…`,
            done,
        };
    }
    return {
        title: `Link ${pages} to ${winner}`,
        sentence: done
            ? `${one ? 'Its draft links' : 'Their drafts link'} to ${winner}. Publish ${one ? 'it' : 'them'} to put the ${one ? 'link' : 'links'} live.`
            : `Add a link to ${winner} where ${one ? 'it repeats' : 'they repeat'} what ${winner} says.`,
        action: done ? `Open ${winner}` : `Add links to ${winner}…`,
        done,
    };
};

/**
 * One part of a page's rich text in the merge dialog.
 */
export interface MergePart {
    id: string;
    kind: 'paragraph' | 'heading' | 'quote' | 'listItem' | 'image' | 'block';
    text: string;
    fits: boolean;
}

/**
 * What `editing_merge_plan` answers.
 */
export interface MergePlan {
    winner: {
        ref: string;
        title: string;
        field: string | null;
    };
    pages: Array<{
        ref: string;
        title: string;
        path: string | null;
        refusal: string | null;
        parts: MergePart[];
    }>;
}

/**
 * What `editing_merge_pages` answers.
 */
export interface MergedAnswer {
    ref: string;
    title: string;
    moved: number;
    merging: Array<{
        ref: string;
        title: string;
    }>;
    waitsForPublish: boolean;
}

/**
 * What `editing_link_plan` answers.
 */
export interface LinkPlan {
    winner: {
        ref: string;
        title: string;
    };
    pages: Array<{
        ref: string;
        title: string;
        path: string | null;
        refusal: string | null;
        sentence: {
            text: string;
            phrase: string;
            at: number;
        } | null;
    }>;
}

/**
 * What `editing_link_pages` answers.
 */
export interface LinkedAnswer {
    drafts: Array<{
        ref: string;
        title: string;
    }>;
    skipped: Array<{
        ref: string;
        title: string;
        reason: string;
    }>;
}

/**
 * The pages a fix starts from: those not merging or linked yet.
 */
export const pagesToFixOf = (search: SimilarSearch): SimilarSearch['others'] => search.others.filter((page) => page.fixing === null);

/**
 * What the merge dialog starts with: each page that may merge, ticked when
 * it says nearly what the winner says, and every part that fits, ticked.
 */
export const mergeChoicesOf = (
    plan: MergePlan,
    similarity: ReadonlyMap<string, number>
): { pages: Set<string>; parts: Set<string> } => {
    const open = plan.pages.filter((page) => page.refusal === null);
    return {
        pages: new Set(open.filter((page) => (similarity.get(page.ref) ?? 0) >= MERGE_SIMILARITY).map((page) => page.ref)),
        parts: new Set(open.flatMap((page) => page.parts.filter((part) => part.fits).map((part) => `${page.ref} ${part.id}`))),
    };
};

/**
 * The merge body from what the dialog ticks: each ticked page with its
 * ticked parts.
 */
export const mergeBodyOf = (
    plan: MergePlan,
    pages: ReadonlySet<string>,
    parts: ReadonlySet<string>
): { winner: string; pages: Array<{ ref: string; parts: string[] }> } => ({
    winner: plan.winner.ref,
    pages: plan.pages
        .filter((page) => page.refusal === null && pages.has(page.ref))
        .map((page) => ({
            ref: page.ref,
            parts: page.parts.filter((part) => part.fits && parts.has(`${page.ref} ${part.id}`)).map((part) => part.id),
        })),
});

/**
 * Titles as a sentence lists them: "A", "A and B", "A, B and C".
 */
export const titlesOf = (titles: readonly string[]): string =>
    titles.length <= 1 ? (titles[0] ?? '') : `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;
