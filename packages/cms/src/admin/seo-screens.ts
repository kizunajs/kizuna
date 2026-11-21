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
const MERGE_SIMILARITY = 0.8;

/**
 * What to do about pages that compete for one search: keep the one that
 * ranks best, and merge the rest into it when they say the same, or point
 * them at it when they do not.
 */
export const competeAdviceOf = (competing: SiteSeoCompeting, nameOf: (url: string) => { title: string }): string => {
    const ranked = [...competing.urls].sort(
        (left, right) => (left.position ?? Number.POSITIVE_INFINITY) - (right.position ?? Number.POSITIVE_INFINITY)
    );
    const [keeper, ...rest] = ranked;
    if (keeper === undefined) return '';
    const title = nameOf(keeper.url).title;
    return rest.some((candidate) => (candidate.similarity ?? 0) >= MERGE_SIMILARITY) ? `Merge into ${title}` : `Point to ${title}`;
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
 * button's words.
 */
export const similarFixOf = (search: SimilarSearch): { title: string; sentence: string; action: string } => {
    const winner = search.winner.title;
    const [only] = search.others;
    const pages =
        search.others.length === 1 && only !== undefined
            ? only.title
            : search.others.length === 2
              ? 'both pages'
              : `the ${search.others.length} pages`;
    if (search.fix === 'merge') {
        const one = search.others.length === 1;
        return {
            title: `Merge ${pages} into ${winner}`,
            sentence: `${one ? 'Its' : 'Their'} own text goes into a draft of ${winner} and ${one ? 'its address redirects' : 'their addresses redirect'} to it. Nothing changes on the site until you publish the draft.`,
            action: `Merge into a draft of ${winner}`,
        };
    }
    return {
        title: `Link ${pages} to ${winner}`,
        sentence:
            search.others.length === 1 ? `It gets a link to ${winner} in a draft.` : `Each page gets a link to ${winner} in a draft.`,
        action: `Add links to ${winner}`,
    };
};
