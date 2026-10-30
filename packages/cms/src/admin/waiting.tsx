import { useCallback, useEffect, useMemo, useState } from 'react';
import { Languages, MessageSquare, Search } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { Avatar } from '../view/people.js';
import type { AdminRoute, AdminSite } from './config.js';
import { hrefOf, SHARED_GROUP } from './navigation.js';
import { PageHeader } from './page-header.js';
import { SiteIcon } from './site-switcher.js';
import { languageNameOf } from './translation-ui.js';
import { relativeTimeOf } from './time.js';
import { waitingRowsOf, type OpenReview, type OpenTranslation, type WaitingRow } from './waiting-rows.js';

/**
 * Every open review and waiting translation the editor may see, loaded
 * again each time `reload` changes.
 */
export const useWaiting = (
    connection: Connection,
    routes: Readonly<Record<string, AdminRoute>>,
    reload: unknown
): { reviews: OpenReview[]; translations: OpenTranslation[] } | undefined => {
    const [waiting, setWaiting] = useState<{ reviews: OpenReview[]; translations: OpenTranslation[] } | undefined>();
    const load = useCallback(async () => {
        const [reviews, translations] = await Promise.all([
            connection.call<{ reviews: OpenReview[] }>('editing_reviews_list', {
                query: {
                    for: 'anyone',
                },
            }),
            routes['editing_translations_list'] === undefined
                ? undefined
                : connection.call<{ translations: OpenTranslation[] }>('editing_translations_list'),
        ]);
        setWaiting({
            reviews: reviews.status === 200 ? reviews.body.reviews : [],
            translations: translations?.status === 200 ? translations.body.translations : [],
        });
    }, [connection, routes]);
    useEffect(() => {
        void load();
    }, [load, reload]);
    return waiting;
};

/**
 * The rows of Waiting as one table: what waits, where, what changed, who
 * asked and for how long, and the way to answer it.
 */
export function WaitingTable({
    rows,
    sites,
    where,
    now,
}: {
    rows: readonly WaitingRow[];
    sites: readonly AdminSite[];
    /**
     * Shows where each row belongs, when the table spans several places.
     */
    where: boolean;
    now: Date;
}) {
    const siteOf = (key: string | undefined): AdminSite | undefined => sites.find((site) => site.key === key);
    const groups =
        rows.some((row) => row.group !== undefined) && !where
            ? [
                  {
                      label: 'Asked of you',
                      rows: rows.filter((row) => row.group === 'asked'),
                  },
                  {
                      label: 'You asked',
                      rows: rows.filter((row) => row.group === 'mine'),
                  },
              ].filter((group) => group.rows.length > 0)
            : [
                  {
                      label: undefined,
                      rows,
                  },
              ];
    const columns = where ? 7 : 6;
    return (
        <div className="k-table__scroll">
            <table className="k-table k-waiting-table" aria-label="Waiting">
                <thead>
                    <tr>
                        <th scope="col" className="k-waiting-table__kind">
                            <span className="k-visually-hidden">Kind</span>
                        </th>
                        <th scope="col">Item</th>
                        {where ? <th scope="col">Where</th> : null}
                        <th scope="col">Change</th>
                        <th scope="col">From</th>
                        <th scope="col">Waiting</th>
                        <th scope="col">
                            <span className="k-visually-hidden">Answer</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {groups.map((group) => [
                        group.label === undefined ? null : (
                            <tr key={`group:${group.label}`} className="k-waiting-table__group">
                                <th scope="colgroup" colSpan={columns}>
                                    {group.label} · {group.rows.length}
                                </th>
                            </tr>
                        ),
                        ...group.rows.map((row) => {
                            const href = hrefOf({
                                kind: 'document',
                                ref: row.ref,
                            });
                            const site = siteOf(row.site);
                            return (
                                <tr key={`${row.kind}:${row.ref}`} className="k-table__row">
                                    <td className="k-waiting-table__kind">
                                        {row.kind === 'review' ? (
                                            <MessageSquare {...ICON} aria-label="Review" />
                                        ) : (
                                            <Languages {...ICON} aria-label="Translation" />
                                        )}
                                    </td>
                                    <td className="k-table__title">
                                        <a className="k-waiting-table__item" href={href}>
                                            <span className="k-ellipsis">{row.label}</span>
                                            <span className="k-waiting-table__detail k-ellipsis">
                                                {row.locale === undefined ? row.detail : `${languageNameOf(row.locale)} · ${row.detail}`}
                                            </span>
                                        </a>
                                    </td>
                                    {where ? (
                                        <td>
                                            <span className="k-site-fact">
                                                <SiteIcon site={site} />
                                                {site?.label ?? SHARED_GROUP}
                                            </span>
                                        </td>
                                    ) : null}
                                    <td className="k-waiting-table__change">
                                        <span className="k-ellipsis">{row.change}</span>
                                    </td>
                                    <td>
                                        {row.from === undefined ? null : (
                                            <span className="k-site-fact">
                                                <Avatar person={row.from} size={20} />
                                                {row.from.name}
                                            </span>
                                        )}
                                    </td>
                                    <td>{row.since === undefined ? null : relativeTimeOf(row.since, now)}</td>
                                    <td className="k-waiting-table__answer">
                                        <a className="k-button k-button--secondary k-button--small" href={href}>
                                            {row.kind === 'review' ? 'Review' : 'Update'}
                                        </a>
                                    </td>
                                </tr>
                            );
                        }),
                    ])}
                </tbody>
            </table>
        </div>
    );
}

type Shown = 'all' | 'review' | 'translation';

/**
 * Waiting: the reviews and translations that wait on someone. Overview lists
 * every place's, with where each belongs. A site lists its own and the
 * shared ones, asked of the editor or by them.
 */
export function WaitingScreen({
    waiting,
    sites,
    site,
    me,
    collectionLabel,
}: {
    waiting: { reviews: OpenReview[]; translations: OpenTranslation[] } | undefined;
    sites: readonly AdminSite[];
    /**
     * The site shown, or `undefined` for Overview.
     */
    site: string | undefined;
    me: string | undefined;
    collectionLabel: (name: string) => string | undefined;
}) {
    const [query, setQuery] = useState('');
    const [shown, setShown] = useState<Shown>('all');
    const now = useMemo(() => new Date(), []);
    const rows = useMemo(
        () =>
            waiting === undefined
                ? undefined
                : waitingRowsOf(waiting.reviews, waiting.translations, {
                      collectionLabel,
                      site,
                      me,
                  }),
        [waiting, collectionLabel, site, me]
    );
    const term = query.trim().toLowerCase();
    const filtered = (rows ?? []).filter(
        (row) =>
            (shown === 'all' || row.kind === shown) &&
            (term === '' || `${row.label} ${row.detail} ${row.change}`.toLowerCase().includes(term))
    );
    const count = (kind: Shown): number => (rows ?? []).filter((row) => kind === 'all' || row.kind === kind).length;
    const places = new Set((rows ?? []).map((row) => row.site ?? SHARED_GROUP)).size;
    const meta =
        site === undefined
            ? [
                  {
                      label: 'Reviews',
                      value: count('review'),
                  },
                  {
                      label: 'Translations',
                      value: count('translation'),
                  },
                  {
                      label: 'On',
                      value: places === 1 ? '1 place' : `${places} places`,
                  },
              ]
            : [
                  {
                      label: 'Asked of you',
                      value: (rows ?? []).filter((row) => row.group === 'asked').length,
                  },
                  {
                      label: 'You asked',
                      value: (rows ?? []).filter((row) => row.group === 'mine').length,
                  },
              ];
    return (
        <>
            <PageHeader title="Waiting" meta={rows === undefined ? undefined : meta} />
            <div className="k-admin__body k-list-screen">
                <div className="k-list-toolbar">
                    <label className="k-list-toolbar__search">
                        <Search {...ICON} />
                        <span className="k-visually-hidden">Search waiting</span>
                        <input
                            type="search"
                            value={query}
                            placeholder="Search by title or field"
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </label>
                    <div className="k-list-toolbar__buttons k-waiting__kinds" role="tablist" aria-label="Show">
                        {(
                            [
                                ['all', 'All'],
                                ['review', 'Reviews'],
                                ['translation', 'Translations'],
                            ] satisfies Array<[Shown, string]>
                        ).map(([kind, label]) => (
                            <button
                                key={kind}
                                type="button"
                                role="tab"
                                className="k-tab"
                                aria-selected={shown === kind}
                                onClick={() => setShown(kind)}>
                                {label} <span className="k-waiting__count">{count(kind)}</span>
                            </button>
                        ))}
                    </div>
                </div>
                {rows === undefined ? null : filtered.length === 0 ? (
                    <div className="k-list-results__empty">
                        <h2 className="k-list-results__empty-title">{rows.length === 0 ? 'Nothing waits' : 'Nothing matches'}</h2>
                    </div>
                ) : (
                    <WaitingTable rows={filtered} sites={sites} where={site === undefined} now={now} />
                )}
            </div>
        </>
    );
}
