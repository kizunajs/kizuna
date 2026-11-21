import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, CircleAlert, RefreshCw, TriangleAlert } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { parseRef } from '../refs.js';
import { addressSite, hrefIn, hrefOf, navigate } from './navigation.js';
import type { PageScores } from './list-columns.js';
import { Loading, problemOf } from './parts.js';
import { relativeTimeOf } from './time.js';

/**
 * Where a score stands: 80 and over is good, 50 to 79 needs work, and under
 * 50 is poor.
 */
export type ScoreBand = 'good' | 'fair' | 'poor';

export const bandOf = (score: number): ScoreBand => (score >= 80 ? 'good' : score >= 50 ? 'fair' : 'poor');

/**
 * What a band's pill says.
 */
export const BAND_WORD: Record<ScoreBand, string> = {
    good: 'Good',
    fair: 'Needs work',
    poor: 'Poor',
};

/**
 * One thing to fix on a page, and the field that fixes it.
 */
export interface SeoCheck {
    level: 'urgent' | 'suggested';
    text: string;
    field?: string | undefined;
}

export interface SeoKeyword {
    keyword: string;
    position?: number | undefined;
    volume?: number | undefined;
    change?: number | undefined;
}

/**
 * A question people ask, and the AI answers that cite the page for it.
 */
export interface SeoCitation {
    question: string;
    engines: string[];
}

/**
 * One end of a link into or out of a page.
 */
export interface LinkEnd {
    kind: 'page' | 'external' | 'broken';
    ref?: string | undefined;
    title: string;
    path?: string | undefined;
    domain?: string | undefined;
    anchor?: string | undefined;
    reason?: string | undefined;
}

/**
 * What `editing_page_seo` answers. Without a provider, `scores` is `null`
 * and only the CMS's own checks and links are filled.
 */
export interface PageSeo {
    checkedAt: string;
    label?: string | null | undefined;
    scores: PageScores | null;
    checks?: SeoCheck[] | undefined;
    keywords?: SeoKeyword[] | undefined;
    citations?: SeoCitation[] | undefined;
    links?:
        | {
              in: LinkEnd[];
              out: LinkEnd[];
          }
        | undefined;
    couldLinkHere?:
        | Array<{
              ref: string;
              title: string;
              phrase: string;
          }>
        | undefined;
}

/**
 * How many rows a table shows until the editor asks for the rest.
 */
const FIRST_ROWS = 5;

const WHOLE = new Intl.NumberFormat('en-GB');

/**
 * The checks with the urgent ones first, each level in the order it came.
 */
export const checksInOrder = (checks: readonly SeoCheck[]): SeoCheck[] => [
    ...checks.filter((check) => check.level === 'urgent'),
    ...checks.filter((check) => check.level !== 'urgent'),
];

/**
 * The count beside To fix, like "2 urgent, 2 suggested".
 */
export const fixCountOf = (checks: readonly SeoCheck[]): string => {
    const urgent = checks.filter((check) => check.level === 'urgent').length;
    const suggested = checks.length - urgent;
    return [urgent === 0 ? null : `${urgent} urgent`, suggested === 0 ? null : `${suggested} suggested`]
        .filter((part) => part !== null)
        .join(', ');
};

/**
 * The line under the search score: where to start.
 */
export const searchLineOf = (checks: readonly SeoCheck[]): string => {
    const urgent = checks.filter((check) => check.level === 'urgent').length;
    if (urgent > 0) return `Start with the ${urgent} urgent ${urgent === 1 ? 'fix' : 'fixes'} below`;
    const suggested = checks.length;
    if (suggested > 0) return `${suggested} suggested ${suggested === 1 ? 'fix' : 'fixes'} below`;
    return 'Nothing to fix on this page';
};

/**
 * The line under the AI answers score: how many questions cite the page.
 */
export const answersLineOf = (citations: readonly SeoCitation[] | undefined, label: string | null | undefined): string => {
    if (citations === undefined || citations.length === 0) return label === null || label === undefined ? '' : `From ${label}`;
    const cited = citations.filter((citation) => citation.engines.length > 0).length;
    return `Cited in ${cited} of ${citations.length} ${citations.length === 1 ? 'question' : 'questions'} people ask`;
};

/**
 * The counts the Links card shows: pages and other sites linking here, and
 * the broken links out.
 */
export const linkCountsOf = (links: PageSeo['links']): { pagesIn: number; sitesIn: number; brokenOut: number } => ({
    pagesIn: links?.in.filter((end) => end.kind === 'page').length ?? 0,
    sitesIn: new Set(links?.in.filter((end) => end.kind === 'external').map((end) => end.domain ?? end.title)).size,
    brokenOut: links?.out.filter((end) => end.kind === 'broken').length ?? 0,
});

/**
 * A score, its band's pill, a thin meter, and one grey line under them.
 */
function ScoreCard({ label, score, line }: { label: string; score: number; line: string }) {
    const band = bandOf(score);
    return (
        <div className="k-stat k-seo-score" data-band={band}>
            <span className="k-stat__label">{label}</span>
            <span className="k-seo-score__value">
                <strong className="k-stat__value">{score}</strong>
                <span className="k-seo-pill" data-band={band}>
                    {BAND_WORD[band]}
                </span>
            </span>
            <span
                className="k-seo-meter"
                role="meter"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={score}
                aria-valuetext={`${score}, ${BAND_WORD[band].toLowerCase()}`}>
                <span
                    style={{
                        width: `${Math.min(100, Math.max(0, score))}%`,
                    }}
                />
            </span>
            {line === '' ? null : <span className="k-stat__detail">{line}</span>}
        </div>
    );
}

/**
 * A card's title, with its grey count or its way to more at the right.
 */
function CardHead({ id, title, count, more }: { id: string; title: string; count?: string | undefined; more?: ReactNode }) {
    return (
        <div className="k-panel__head k-seo-card__head">
            <h3 id={id} className="k-panel__title">
                {title}
            </h3>
            {count === undefined || count === '' ? null : <span className="k-panel__description">{count}</span>}
            {more === undefined ? null : <span className="k-seo-card__more">{more}</span>}
        </div>
    );
}

/**
 * Show all and Show fewer, for a table longer than its first rows.
 */
function MoreToggle({ total, open, onToggle }: { total: number; open: boolean; onToggle: () => void }) {
    if (total <= FIRST_ROWS) return null;
    return (
        <button type="button" className="k-text-button" aria-expanded={open} onClick={onToggle}>
            {open ? 'Show fewer' : `Show all ${WHOLE.format(total)}`}
            {open ? <ChevronUp {...ICON} /> : <ChevronDown {...ICON} />}
        </button>
    );
}

function Keywords({ keywords }: { keywords: readonly SeoKeyword[] }) {
    const [open, setOpen] = useState(false);
    const shown = open ? keywords : keywords.slice(0, FIRST_ROWS);
    return (
        <section className="k-panel k-seo-card" aria-labelledby="k-seo-keywords">
            <CardHead
                id="k-seo-keywords"
                title="Keywords"
                more={<MoreToggle total={keywords.length} open={open} onToggle={() => setOpen(!open)} />}
            />
            <div className="k-panel__table">
                <table className="k-table k-dashboard-table" aria-labelledby="k-seo-keywords">
                    <thead>
                        <tr>
                            <th scope="col">Keyword</th>
                            <th scope="col" data-kind="number">
                                Position
                            </th>
                            <th scope="col" data-kind="number">
                                Searches a month
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((keyword) => (
                            <tr key={keyword.keyword} className="k-table__row">
                                <td className="k-dashboard-table__name">
                                    <span className="k-ellipsis">{keyword.keyword}</span>
                                </td>
                                <td data-kind="number">
                                    {keyword.position === undefined ? (
                                        <span className="k-seo-muted">Not ranked</span>
                                    ) : (
                                        WHOLE.format(keyword.position)
                                    )}
                                </td>
                                <td data-kind="number">{keyword.volume === undefined ? '' : WHOLE.format(keyword.volume)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function Answers({ citations }: { citations: readonly SeoCitation[] }) {
    const [open, setOpen] = useState(false);
    const shown = open ? citations : citations.slice(0, FIRST_ROWS);
    return (
        <section className="k-panel k-seo-card" aria-labelledby="k-seo-answers">
            <CardHead
                id="k-seo-answers"
                title="AI answers"
                more={<MoreToggle total={citations.length} open={open} onToggle={() => setOpen(!open)} />}
            />
            <div className="k-panel__table">
                <table className="k-table k-dashboard-table" aria-labelledby="k-seo-answers">
                    <thead>
                        <tr>
                            <th scope="col">Question</th>
                            <th scope="col" data-kind="number">
                                Cites this page
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((citation) => (
                            <tr key={citation.question} className="k-table__row">
                                <td className="k-dashboard-table__name">
                                    <span className="k-ellipsis">{citation.question}</span>
                                </td>
                                <td data-kind="number">
                                    {citation.engines.length === 0 ? (
                                        <span className="k-seo-muted">None</span>
                                    ) : (
                                        citation.engines.join(', ')
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

/**
 * A page's SEO beside its fields: its two scores, what to fix with a way to
 * the field that fixes it, the searches it shows for, the AI answers that
 * cite it, and its links. It shows in Live Preview's place, for a document
 * with an address.
 */
export function SeoPanel({
    connection,
    documentRef,
    savedAt,
    now,
    fieldOf,
    onShowField,
}: {
    connection: Connection;
    documentRef: string;
    /**
     * When the draft was last saved, so the CMS's own checks follow the
     * fields.
     */
    savedAt: string | null;
    now: Date;
    /**
     * The field a check names, as the form holds it, with its label, or
     * `undefined` when the document has no such field.
     */
    fieldOf: (path: string) => { path: string; label: string } | undefined;
    onShowField: (path: string) => void;
}) {
    const [seo, setSeo] = useState<PageSeo | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const [checking, setChecking] = useState(false);

    const load = useCallback(
        async (refresh: boolean): Promise<void> => {
            if (refresh) setChecking(true);
            const answer = await connection.call<PageSeo>('editing_page_seo', {
                query: {
                    ref: documentRef,
                    ...(refresh
                        ? {
                              refresh: true,
                          }
                        : {}),
                },
            });
            if (refresh) setChecking(false);
            if (answer.status !== 200) {
                setProblem(problemOf(answer, 'The SEO overview did not load'));
                return;
            }
            setProblem(undefined);
            setSeo(answer.body);
        },
        [connection, documentRef]
    );

    useEffect(() => {
        void load(false);
    }, [load, savedAt]);

    const checks = useMemo(() => checksInOrder(seo?.checks ?? []), [seo]);
    const site = parseRef(documentRef)?.site ?? addressSite();
    const linkMapHref = hrefIn(site, {
        kind: 'link-map',
    });

    const head = (
        <div className="k-seo__head">
            <h2 className="k-seo__title">SEO</h2>
            {seo === undefined ? null : <span className="k-seo__checked">{`Checked ${relativeTimeOf(seo.checkedAt, now)}`}</span>}
            <button
                type="button"
                className="k-button k-button--secondary k-button--small"
                disabled={checking || seo === undefined}
                onClick={() => void load(true)}>
                <RefreshCw {...ICON} className={checking ? 'k-spin' : undefined} />
                {checking ? 'Checking' : 'Check again'}
            </button>
        </div>
    );

    if (seo === undefined) {
        return (
            <div className="k-seo" aria-label="SEO">
                {head}
                <Loading problem={problem} />
            </div>
        );
    }

    const counts = linkCountsOf(seo.links);
    const couldLinkHere = seo.couldLinkHere ?? [];

    return (
        <div className="k-seo" aria-label="SEO">
            {head}
            <div className="k-seo__body">
                {problem === undefined ? null : (
                    <p className="k-error" role="alert">
                        <CircleAlert {...ICON} />
                        {problem}
                    </p>
                )}
                {seo.scores === null ? null : (
                    <div className="k-seo__scores">
                        <ScoreCard label="Search" score={seo.scores.search} line={searchLineOf(checks)} />
                        <ScoreCard label="AI answers" score={seo.scores.answers} line={answersLineOf(seo.citations, seo.label)} />
                    </div>
                )}
                <section className="k-panel k-seo-card" aria-labelledby="k-seo-fix">
                    <CardHead id="k-seo-fix" title="To fix" count={fixCountOf(checks)} />
                    {checks.length === 0 ? (
                        <p className="k-help k-panel__empty">Nothing to fix on this page.</p>
                    ) : (
                        <ul className="k-seo-fix">
                            {checks.map((check, index) => {
                                const field = check.field === undefined ? undefined : fieldOf(check.field);
                                return (
                                    <li key={`${check.level}:${index}:${check.text}`} className="k-seo-fix__row">
                                        <span className="k-seo-fix__icon" data-level={check.level}>
                                            {check.level === 'urgent' ? (
                                                <CircleAlert {...ICON} aria-label="Urgent" />
                                            ) : (
                                                <TriangleAlert {...ICON} aria-label="Suggested" />
                                            )}
                                        </span>
                                        <span className="k-seo-fix__text">{check.text}</span>
                                        {field === undefined ? null : (
                                            <button
                                                type="button"
                                                className="k-button k-button--secondary k-button--small"
                                                onClick={() => onShowField(field.path)}>
                                                {field.label}
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
                {seo.keywords === undefined || seo.keywords.length === 0 ? null : <Keywords keywords={seo.keywords} />}
                {seo.citations === undefined || seo.citations.length === 0 ? null : <Answers citations={seo.citations} />}
                <section className="k-panel k-seo-card" aria-labelledby="k-seo-links">
                    <CardHead
                        id="k-seo-links"
                        title="Links"
                        more={
                            <a
                                className="k-seo-card__link"
                                href={linkMapHref}
                                onClick={(event) => {
                                    event.preventDefault();
                                    navigate(linkMapHref);
                                }}>
                                Open in the link map
                                <ArrowRight {...ICON} />
                            </a>
                        }
                    />
                    <div className="k-panel__table">
                        <table className="k-table k-dashboard-table" aria-labelledby="k-seo-links">
                            <tbody>
                                <tr className="k-table__row">
                                    <td className="k-dashboard-table__name">Pages that link here</td>
                                    <td data-kind="number">{WHOLE.format(counts.pagesIn)}</td>
                                </tr>
                                <tr className="k-table__row">
                                    <td className="k-dashboard-table__name">Other sites that link here</td>
                                    <td data-kind="number">{WHOLE.format(counts.sitesIn)}</td>
                                </tr>
                                <tr className="k-table__row">
                                    <td className="k-dashboard-table__name">Broken links on this page</td>
                                    <td data-kind="number">{WHOLE.format(counts.brokenOut)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>
                {couldLinkHere.length === 0 ? null : (
                    <section className="k-panel k-seo-card" aria-labelledby="k-seo-could-link">
                        <CardHead id="k-seo-could-link" title="Could link here" count={WHOLE.format(couldLinkHere.length)} />
                        <div className="k-panel__table">
                            <table className="k-table k-dashboard-table" aria-labelledby="k-seo-could-link">
                                <tbody>
                                    {couldLinkHere.map((candidate) => {
                                        const href = hrefOf({
                                            kind: 'document',
                                            ref: candidate.ref,
                                        });
                                        return (
                                            <tr key={candidate.ref} className="k-table__row">
                                                <td className="k-dashboard-table__name">
                                                    <span className="k-table__name">
                                                        <a
                                                            className="k-table__link k-ellipsis"
                                                            href={href}
                                                            onClick={(event) => {
                                                                event.preventDefault();
                                                                navigate(href);
                                                            }}>
                                                            {candidate.title}
                                                        </a>
                                                        <span className="k-table__detail k-ellipsis">{`Link “${candidate.phrase}” to this page`}</span>
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}
                {seo.label === null || seo.label === undefined ? null : (
                    <p className="k-seo__source">{`Scores, keywords and AI answers come from ${seo.label}. The rest the CMS reads from the page.`}</p>
                )}
            </div>
        </div>
    );
}

/**
 * The scores of every page and item with an address on the given sites, by
 * ref, for a list's score columns. `undefined` until they load, and empty
 * when the CMS has no scores.
 */
export const usePageScores = (connection: Connection, sites: readonly string[]): Readonly<Record<string, PageScores>> | undefined => {
    const [scores, setScores] = useState<Readonly<Record<string, PageScores>> | undefined>();
    const key = [...new Set(sites)].sort().join('\n');
    useEffect(() => {
        if (key === '') return;
        let current = true;
        void Promise.all(
            key.split('\n').map((site) =>
                connection.call<{ scores: Record<string, PageScores> }>('editing_page_scores', {
                    query: {
                        site,
                    },
                })
            )
        ).then((answers) => {
            if (!current) return;
            setScores(Object.assign({}, ...answers.map((answer) => (answer.status === 200 ? answer.body.scores : {}))));
        });
        return () => {
            current = false;
        };
    }, [connection, key]);
    return scores;
};

/**
 * A score in a list: the number, with a short line under it in its band's
 * colour.
 */
export function ListScore({ score }: { score: number }) {
    const band = bandOf(score);
    return (
        <span className="k-seo-list-score" data-band={band}>
            {score}
            <span className="k-seo-list-score__line" role="img" aria-label={BAND_WORD[band]} />
        </span>
    );
}
