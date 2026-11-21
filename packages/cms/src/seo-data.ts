/**
 * Two scores from 0 to 100: how well a page or a site does in search
 * results, and in the answers AI search writes. 80 and over is good, 50 to
 * 79 fair, and under 50 poor.
 */
export interface SeoScores {
    search: number;
    answers: number;
}

/**
 * Something to fix on a page, said as what to do about it.
 */
export interface SeoCheck {
    /**
     * `urgent` costs the page now, `suggested` would help it.
     */
    level: 'urgent' | 'suggested';
    text: string;
    /**
     * The field to fix it in, like `seo` or `body`, when one is known.
     */
    field?: string;
}

/**
 * A search a page or a site shows up for.
 */
export interface SeoKeyword {
    keyword: string;
    /**
     * Where it ranks in search results, 1 at the top.
     */
    position?: number;
    /**
     * How many people search for it each month.
     */
    volume?: number;
    /**
     * How many places it moved since the last check, up when positive.
     */
    change?: number;
}

/**
 * A question people ask AI search, with the engines whose answers cite the
 * page.
 */
export interface SeoCitation {
    question: string;
    engines: string[];
}

/**
 * A link to the page from another site.
 */
export interface SeoBacklink {
    domain: string;
    url: string;
    /**
     * The words the link shows.
     */
    anchor?: string;
    /**
     * When it was first found, as an ISO date.
     */
    firstSeen?: string;
}

/**
 * What one page's address answers in search and AI answers, as a provider
 * reads it. Every list is optional, and the admin hides one it has no data
 * for.
 */
export interface PageSeoData {
    /**
     * When the provider read it, as an ISO date.
     */
    checkedAt: string;
    scores: SeoScores;
    checks?: SeoCheck[];
    keywords?: SeoKeyword[];
    citations?: SeoCitation[];
    backlinks?: SeoBacklink[];
    /**
     * What each URL the page links to answered, like `404` for a link to a
     * page that is gone.
     */
    outboundStatus?: Array<{
        url: string;
        status: number;
    }>;
}

/**
 * What a whole site answers in search and AI answers, as a provider reads
 * it. Every list is optional, and the admin hides one it has no data for.
 */
export interface SiteSeoData {
    /**
     * When the provider read it, as an ISO date.
     */
    checkedAt: string;
    scores: SeoScores;
    /**
     * The site's searches, each with the page that ranks for it.
     */
    keywords?: Array<
        SeoKeyword & {
            url: string;
        }
    >;
    /**
     * Questions whose AI answers cite the site, each with the page cited.
     */
    citations?: Array<
        SeoCitation & {
            url: string;
        }
    >;
    /**
     * The other sites that link to this one, with how many links each has.
     */
    backlinkDomains?: Array<{
        domain: string;
        links: number;
        favicon?: string;
    }>;
    /**
     * Searches several of the site's pages rank for, so they take each
     * other's place. `similarity` is how alike a page is to the best one,
     * from 0 to 1.
     */
    competing?: Array<{
        keyword: string;
        volume: number;
        urls: Array<{
            url: string;
            position?: number;
            similarity?: number;
        }>;
    }>;
}

/**
 * Where the SEO overview's scores, keywords, AI answers and links from other
 * sites come from. The CMS asks it about a page by its address and about a
 * site by its origin, and keeps each answer for a day.
 *
 * @example
 * ```ts
 * content: cms({
 *     db,
 *     pages,
 *     seoData: fakeSeoData(),
 * }),
 * ```
 */
export interface SeoData {
    /**
     * The name of the service the numbers come from, which the admin credits
     * beside them.
     */
    label: string;
    page(input: { url: string; locale: string }): Promise<PageSeoData>;
    site(input: { origin: string; locale: string }): Promise<SiteSeoData>;
}

/**
 * Whether a value has what the CMS asks of `seoData`.
 */
export const isSeoData = (value: unknown): value is SeoData => {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate['label'] === 'string' && typeof candidate['page'] === 'function' && typeof candidate['site'] === 'function';
};

/**
 * A number from 0 up to 2^32 that only the text decides.
 */
const hashOf = (text: string): number => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

/**
 * Numbers from 0 to 1 in an order the seed decides, so the same text always
 * draws the same numbers.
 */
const drawFrom = (seed: string): (() => number) => {
    let state = hashOf(seed);
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let mixed = state;
        mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
};

const between = (draw: () => number, low: number, high: number): number => low + Math.floor(draw() * (high - low + 1));

const WORDING: Record<string, { searches: string[]; questions: string[] }> = {
    en: {
        searches: ['{words}', 'best {words}', '{words} near me', '{words} prices', '{words} tips'],
        questions: ['What is the best {words}?', 'Where can I find {words}?', 'How do I choose {words}?'],
    },
    nb: {
        searches: ['{words}', 'beste {words}', '{words} i nærheten', '{words} pris', '{words} tips'],
        questions: ['Hva er beste {words}?', 'Hvor finner jeg {words}?', 'Hvordan velger jeg {words}?'],
    },
};

const ENGINES = ['ChatGPT', 'Perplexity', 'Google AI Overviews', 'Copilot'];

const LINKING_SITES = ['cityguide', 'localnews', 'weekendtips', 'homeblog', 'shopfinder', 'gardenforum', 'reviewhub', 'neighbourhood'];

/**
 * The words of a page's address, like `plant care` for `/en/plant-care`,
 * or the site's own name for its front page.
 */
const wordsOf = (url: URL, locale: string): string => {
    const words = url.pathname
        .split(/[/\-_.]+/)
        .map((word) => decodeURIComponent(word).toLowerCase())
        .filter((word) => word !== '' && word !== locale && /^\p{L}+$/u.test(word));
    return words.length === 0 ? (url.hostname.split('.').find((part) => part !== 'www') ?? url.hostname) : words.slice(-3).join(' ');
};

const fill = (template: string, words: string): string => template.replace('{words}', words);

/**
 * What the fake answers for one page: the same numbers for the same address
 * every time.
 */
const fakePage = (address: string, locale: string, now: () => Date): PageSeoData => {
    const url = new URL(address);
    const draw = drawFrom(`${locale} ${url.href}`);
    const words = wordsOf(url, locale);
    const wording = WORDING[locale.split('-')[0]!] ?? WORDING['en']!;
    const search = between(draw, 35, 97);
    const answers = between(draw, 20, 94);
    const keywords: SeoKeyword[] = wording.searches.slice(0, between(draw, 3, wording.searches.length)).map((template) => ({
        keyword: fill(template, words),
        position: between(draw, 1, 60),
        volume: between(draw, 1, 60) * 10 * between(draw, 1, 10),
        change: between(draw, -5, 5),
    }));
    const citations: SeoCitation[] = wording.questions.slice(0, between(draw, 0, wording.questions.length)).map((template) => ({
        question: fill(template, words),
        engines: ENGINES.filter(() => draw() < 0.4),
    }));
    const backlinks: SeoBacklink[] = Array.from(
        {
            length: between(draw, 0, 4),
        },
        (_, index) => {
            const domain = `${LINKING_SITES[(hashOf(url.href) + index) % LINKING_SITES.length]}.example.com`;
            return {
                domain,
                url: `https://${domain}/${words.replaceAll(' ', '-')}`,
                anchor: words,
                firstSeen: new Date(now().getTime() - between(draw, 2, 400) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            };
        }
    );
    const [first] = [...keywords].sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0));
    const checks: SeoCheck[] = [];
    if (first !== undefined && draw() < 0.6) {
        checks.push({
            level: 'suggested',
            text: `Use “${first.keyword}” in the heading. ${first.volume} people search for it each month.`,
        });
    }
    const unanswered = citations.find((citation) => citation.engines.length === 0);
    if (unanswered !== undefined) {
        checks.push({
            level: 'suggested',
            text: `Answer “${unanswered.question}” in one plain sentence near the top, so AI answers can quote the page.`,
        });
    }
    if (search < 50) {
        checks.push({
            level: 'urgent',
            text: 'The page takes over four seconds to show on a phone. Make its largest image smaller.',
        });
    }
    return {
        checkedAt: now().toISOString(),
        scores: {
            search,
            answers,
        },
        checks,
        keywords,
        citations: citations.filter((citation) => citation.engines.length > 0 || citation === unanswered),
        backlinks,
    };
};

/**
 * The searches the fake says several pages compete for, each with the words
 * of the addresses it prefers, its positions, and how alike the others are
 * to the best.
 */
const COMPETING = [
    {
        keyword: {
            en: 'how often to water houseplants',
            nb: 'hvor ofte vanne stueplanter',
        },
        volume: 4400,
        prefers: ['water', 'watering', 'plant-care', 'vanning', 'stell'],
        positions: [31, 48, 52],
        similarity: [0.92, 0.88],
    },
    {
        keyword: {
            en: 'monstera care',
            nb: 'monstera stell',
        },
        volume: 2900,
        prefers: ['monstera', 'plant-doctor', 'plants', 'planter', 'guides', 'guider'],
        positions: [12, 19, 27],
        similarity: [0.71, 0.64],
    },
    {
        keyword: {
            en: 'plant shop london',
            nb: 'plantebutikk oslo',
        },
        volume: 600,
        prefers: ['visit', 'shop', 'shops', 'delivery', 'butikker', 'oslo', 'kundeservice'],
        positions: [9, 14],
        similarity: [0.58],
    },
];

/**
 * Three searches several of the pages compete for: the pages whose
 * addresses fit each search, filled up with the site's other pages.
 */
const competingOf = (urls: readonly string[], locale: string): NonNullable<SiteSeoData['competing']> => {
    const inner = [...urls].filter((url) => new URL(url).pathname !== '/').sort();
    if (inner.length < 2) return [];
    return COMPETING.map((search) => {
        const fitting = inner.filter((url) => search.prefers.some((word) => new URL(url).pathname.split('/').some((part) => part.includes(word))));
        const picked = [...fitting, ...inner.filter((url) => !fitting.includes(url))].slice(0, search.positions.length);
        return {
            keyword: locale.startsWith('nb') ? search.keyword.nb : search.keyword.en,
            volume: search.volume,
            urls: picked.map((url, index) => ({
                url,
                position: search.positions[index]!,
                similarity: index === 0 ? 1 : search.similarity[index - 1]!,
            })),
        };
    });
};

/**
 * Made-up SEO data for demos and tests, so the overview shows something
 * before a real provider is wired up. Each number comes from a hash of the
 * page's address, so it stays the same between calls, and the keywords are
 * made from the words of the address. A site's lists gather the pages it has
 * been asked about.
 *
 * @example
 * ```ts
 * content: cms({
 *     db,
 *     pages,
 *     seoData: fakeSeoData(),
 * }),
 * ```
 */
export const fakeSeoData = (options: { label?: string; now?: () => Date } = {}): SeoData => {
    const now = options.now ?? (() => new Date());
    const asked = new Map<string, { url: string; locale: string }>();
    return {
        label: options.label ?? 'Sample data',
        page: async ({ url, locale }) => {
            asked.set(`${locale} ${url}`, {
                url,
                locale,
            });
            return fakePage(url, locale, now);
        },
        site: async ({ origin, locale }) => {
            const pages = [...asked.values()]
                .filter((page) => page.locale === locale && new URL(page.url).origin === new URL(origin).origin)
                .map((page) => ({
                    url: page.url,
                    data: fakePage(page.url, locale, now),
                }));
            const draw = drawFrom(`${locale} ${origin}`);
            const average = (pick: (scores: SeoScores) => number): number =>
                Math.round(pages.reduce((sum, page) => sum + pick(page.data.scores), 0) / pages.length);
            const domains = new Map<string, number>();
            for (const page of pages) {
                for (const backlink of page.data.backlinks ?? []) domains.set(backlink.domain, (domains.get(backlink.domain) ?? 0) + 1);
            }
            return {
                checkedAt: now().toISOString(),
                scores:
                    pages.length === 0
                        ? {
                              search: between(draw, 40, 90),
                              answers: between(draw, 30, 85),
                          }
                        : {
                              search: average((scores) => scores.search),
                              answers: average((scores) => scores.answers),
                          },
                keywords: pages
                    .flatMap((page) =>
                        (page.data.keywords ?? []).map((keyword) => ({
                            ...keyword,
                            url: page.url,
                        }))
                    )
                    .sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0))
                    .slice(0, 20),
                citations: pages
                    .flatMap((page) =>
                        (page.data.citations ?? [])
                            .filter((citation) => citation.engines.length > 0)
                            .map((citation) => ({
                                ...citation,
                                url: page.url,
                            }))
                    )
                    .slice(0, 20),
                backlinkDomains: [...domains]
                    .map(([domain, links]) => ({
                        domain,
                        links,
                    }))
                    .sort((left, right) => right.links - left.links),
                competing: competingOf(
                    pages.map((page) => page.url),
                    locale
                ),
            };
        },
    };
};
