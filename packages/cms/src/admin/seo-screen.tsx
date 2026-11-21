import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { RotateCw } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { NameCell, NumberCell, PanelCard, PanelTable } from './dashboard.js';
import { hrefOf } from './navigation.js';
import { PageHeader } from './page-header.js';
import { Loading, problemOf } from './parts.js';
import { competeAdviceOf, competeBandOf, pageNamerOf, siteStatsOf, wholeOf, type SeoBand, type SiteSeoAnswer } from './seo-screens.js';
import { relativeTimeOf } from './time.js';

/**
 * How many rows each card shows.
 */
const ROWS = 8;

/**
 * A screen under SEO in the site shown, or in a CMS of one site.
 */
export const seoHrefOf = (kind: 'seo' | 'link-map' | 'too-similar', site: string | undefined): string =>
    hrefOf({
        kind,
        ...(site === undefined
            ? {}
            : {
                  site,
              }),
    });

/**
 * The query the SEO routes take: the site, with a CMS of one site naming
 * none.
 */
export const siteQueryOf = (site: string | undefined, extra: Record<string, string> = {}): { query: Record<string, string> } => ({
    query: {
        ...(site === undefined
            ? {}
            : {
                  site,
              }),
        ...extra,
    },
});

/**
 * A count in a pill tinted by its band.
 */
export function BandPill({ band, children }: { band: SeoBand | 'none'; children: ReactNode }) {
    return (
        <span className="k-band-pill" data-band={band}>
            {children}
        </span>
    );
}

/**
 * SEO: how the site does in search and in AI answers, the pages with most
 * to fix, the searches it ranks for, the questions AI answers cite it in,
 * and the pages that compete for one search.
 */
export function SeoScreen({ connection, site }: { connection: Connection; site: string | undefined }) {
    const [answer, setAnswer] = useState<SiteSeoAnswer | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const [checking, setChecking] = useState(false);

    const load = useCallback(
        async (refresh: boolean): Promise<void> => {
            const reply = await connection.call<SiteSeoAnswer>(
                'editing_site_seo',
                siteQueryOf(
                    site,
                    refresh
                        ? {
                              refresh: 'true',
                          }
                        : {}
                )
            );
            if (reply.status !== 200) {
                setProblem(problemOf(reply, 'SEO did not load'));
                return;
            }
            setProblem(undefined);
            setAnswer(reply.body);
        },
        [connection, site]
    );

    useEffect(() => {
        void load(false);
    }, [load]);

    const checkAgain = async (): Promise<void> => {
        setChecking(true);
        await load(true);
        setChecking(false);
    };

    const header = (
        <PageHeader
            title="SEO"
            actions={
                <>
                    {answer === undefined ? null : <span className="k-seo__checked">Checked {relativeTimeOf(answer.checkedAt)}</span>}
                    <button
                        type="button"
                        className="k-button k-button--secondary k-button--small"
                        disabled={checking || answer === undefined}
                        onClick={() => void checkAgain()}>
                        <RotateCw {...ICON} size={14} className={checking ? 'k-spin' : undefined} />
                        Check again
                    </button>
                    <a className="k-button k-button--secondary k-button--small" href={seoHrefOf('link-map', site)}>
                        Link map
                    </a>
                    <a className="k-button k-button--secondary k-button--small" href={seoHrefOf('too-similar', site)}>
                        Too similar
                    </a>
                </>
            }
        />
    );

    if (answer === undefined) {
        return (
            <>
                {header}
                <div className="k-admin__body">
                    <Loading problem={problem} />
                </div>
            </>
        );
    }

    const stats = siteStatsOf(answer);
    const nameOf = pageNamerOf(answer.mostToFix);
    const pageCell = (url: string | undefined, label: string) => {
        const page = url === undefined ? undefined : nameOf(url);
        return (
            <NameCell
                label={label}
                detail={page?.title}
                {...(page?.ref === undefined
                    ? {}
                    : {
                          href: hrefOf({
                              kind: 'document',
                              ref: page.ref,
                          }),
                      })}
            />
        );
    };
    const keywords = [...(answer.keywords ?? [])].sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0)).slice(0, ROWS);
    const citations = (answer.citations ?? []).filter((citation) => citation.engines.length > 0).slice(0, ROWS);
    const competing = [...(answer.competing ?? [])]
        .filter((group) => group.urls.length > 1)
        .sort((left, right) => right.urls.length - left.urls.length || right.volume - left.volume)
        .slice(0, ROWS);

    return (
        <>
            {header}
            <div className="k-admin__body k-dashboard k-seo" data-columns={Math.max(stats.length, 2)}>
                {problem === undefined ? null : (
                    <p className="k-error" role="alert">
                        {problem}
                    </p>
                )}
                {stats.length === 0 ? null : (
                    <div className="k-dashboard__tiles">
                        {stats.map((stat) => (
                            <div key={stat.label} className="k-stat">
                                <span className="k-stat__head">
                                    <span className="k-stat__label">{stat.label}</span>
                                </span>
                                <span className="k-stat__body">
                                    <strong className="k-stat__value">{stat.value}</strong>
                                </span>
                                {stat.detail === undefined ? null : <span className="k-stat__detail">{stat.detail}</span>}
                            </div>
                        ))}
                    </div>
                )}
                <div className="k-dashboard__panels">
                    <PanelCard label="Most to fix">
                        <PanelTable
                            label="Most to fix"
                            headings={[
                                {
                                    text: 'Page',
                                },
                                {
                                    text: 'To fix',
                                    number: true,
                                },
                                ...(answer.scores === null
                                    ? []
                                    : [
                                          {
                                              text: 'SEO',
                                              number: true,
                                          },
                                      ]),
                            ]}
                            empty="Nothing to fix.">
                            {answer.mostToFix.slice(0, ROWS).map((page) => (
                                <tr key={page.ref} className="k-table__row">
                                    <NameCell
                                        label={page.title}
                                        detail={page.path}
                                        href={hrefOf({
                                            kind: 'document',
                                            ref: page.ref,
                                        })}
                                    />
                                    <NumberCell value={wholeOf(page.checks)} />
                                    {answer.scores === null ? null : <NumberCell value={page.score === null ? '–' : wholeOf(page.score)} />}
                                </tr>
                            ))}
                        </PanelTable>
                    </PanelCard>
                    {answer.keywords === undefined ? null : (
                        <PanelCard label="Keywords">
                            <PanelTable
                                label="Keywords"
                                headings={[
                                    {
                                        text: 'Keyword',
                                    },
                                    {
                                        text: 'Position',
                                        number: true,
                                    },
                                    {
                                        text: 'Searches a month',
                                        number: true,
                                    },
                                ]}
                                empty="No keywords yet.">
                                {keywords.map((keyword) => (
                                    <tr key={keyword.keyword} className="k-table__row">
                                        {pageCell(keyword.url, keyword.keyword)}
                                        <NumberCell value={keyword.position === undefined ? '–' : wholeOf(keyword.position)} />
                                        <NumberCell value={keyword.volume === undefined ? '–' : wholeOf(keyword.volume)} />
                                    </tr>
                                ))}
                            </PanelTable>
                        </PanelCard>
                    )}
                    {answer.citations === undefined ? null : (
                        <PanelCard label="Cited in AI answers">
                            <PanelTable
                                label="Cited in AI answers"
                                headings={[
                                    {
                                        text: 'Question',
                                    },
                                    {
                                        text: 'Cited by',
                                        number: true,
                                    },
                                ]}
                                empty="No AI answer cites the site yet.">
                                {citations.map((citation) => (
                                    <tr key={citation.question} className="k-table__row">
                                        {pageCell(citation.url, citation.question)}
                                        <td data-kind="number" className="k-seo__engines">
                                            {citation.engines.join(', ')}
                                        </td>
                                    </tr>
                                ))}
                            </PanelTable>
                        </PanelCard>
                    )}
                    {answer.competing === undefined ? null : (
                        <PanelCard label="Pages that compete">
                            <PanelTable
                                label="Pages that compete"
                                headings={[
                                    {
                                        text: 'Search',
                                    },
                                    {
                                        text: 'Pages',
                                        number: true,
                                    },
                                    {
                                        text: 'Searches a month',
                                        number: true,
                                    },
                                ]}
                                empty="No pages compete for one search.">
                                {competing.map((group) => (
                                    <tr key={group.keyword} className="k-table__row">
                                        <NameCell
                                            label={group.keyword}
                                            detail={competeAdviceOf(group, nameOf)}
                                            href={seoHrefOf('too-similar', site)}
                                        />
                                        <NumberCell
                                            value={<BandPill band={competeBandOf(group.urls.length)}>{group.urls.length}</BandPill>}
                                        />
                                        <NumberCell value={wholeOf(group.volume)} />
                                    </tr>
                                ))}
                            </PanelTable>
                        </PanelCard>
                    )}
                </div>
                {answer.label === null ? null : <p className="k-seo__credit">Numbers from {answer.label}</p>}
            </div>
        </>
    );
}

/**
 * Too similar: the pages that compete for the same searches. A placeholder
 * until its own screen is built.
 */
export function TooSimilarScreen({ site }: { site: string | undefined }) {
    return (
        <>
            <PageHeader
                title="Too similar"
                crumbs={[
                    {
                        label: 'SEO',
                        href: seoHrefOf('seo', site),
                    },
                ]}
            />
            <div className="k-admin__body" />
        </>
    );
}
