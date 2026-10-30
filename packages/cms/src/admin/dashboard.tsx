import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, CircleAlert, CircleCheck, Plus } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { Hint } from '../view/hint.js';
import { parseRef } from '../refs.js';
import { Chart, Legend } from './chart.js';
import {
    askedOf,
    changeOf,
    DEFAULT_PERIOD,
    groupsOf,
    isNewOf,
    PERIODS,
    periodOfSearch,
    rangeOf,
    refreshWordsOf,
    reviewGroupsOf,
    roleOf,
    runsOf,
    sharedScaleOf,
    tileColumnsOf,
    type ChartWidgetBody,
    type DashboardPeriod,
    type DashboardSiteName,
    type PeriodKey,
    type CollectionsWidgetBody,
    type DashboardCollection,
    type DashboardWidgetBody,
    type EditorsWidgetBody,
    type PanelWidgetBody,
    type ReachWidgetBody,
    type RefreshesWidgetBody,
    type RefreshState,
    type ReviewsWidgetBody,
    type SiteColumn,
    type SitesWidgetBody,
    type StatWidgetBody,
    type WaitingReview,
} from './dashboard-widgets.js';
import { createItem } from './list.js';
import { hrefOf, replaceQuery, screenOf, SHARED_GROUP, useAddress, type CollectionSummary } from './navigation.js';
import { PageHeader } from './page-header.js';
import { Loading, problemOf } from './parts.js';
import { SelectMenu } from '../view/select-menu.js';
import { Avatar } from '../view/people.js';
import { SiteIcon } from './site-switcher.js';
import { relativeTimeOf } from './time.js';

export type { WaitingReview } from './dashboard-widgets.js';

const WHOLE = new Intl.NumberFormat();

const PERIOD_ITEMS = PERIODS.map((period) => ({
    value: period.key,
    label: period.label,
}));

/**
 * What kind of document a ref names, as a word for the reviews list.
 */
const kindOf = (ref: string, collections: readonly CollectionSummary[]): string => {
    const parsed = parseRef(ref);
    if (parsed?.type === 'item') return collections.find((collection) => collection.name === parsed.collection)?.label ?? 'Item';
    return parsed?.type === 'global' ? 'Global' : 'Page';
};

/**
 * A number with its label, how far it moved since the period before, and a
 * line of detail under it.
 */
function ChangeBadge({ change }: { change: number | undefined }) {
    if (change === undefined) return null;
    const shown = changeOf(change);
    return (
        <span className={`k-change k-change--${shown.direction}`}>
            <span aria-hidden="true">{shown.text}</span>
            <span className="k-visually-hidden">{shown.spoken}</span>
        </span>
    );
}

function StatTile({ widget }: { widget: StatWidgetBody }) {
    return (
        <div className="k-stat">
            <span className="k-stat__head">
                <span className="k-stat__label">{widget.label}</span>
                <ChangeBadge change={widget.change} />
            </span>
            <strong className="k-stat__value">{widget.value}</strong>
            {widget.detail === undefined ? null : <span className="k-stat__detail">{widget.detail}</span>}
        </div>
    );
}

function ChartCard({ widget }: { widget: ChartWidgetBody }) {
    const compares = widget.data.some((point) => point.previous !== undefined);
    return (
        <section className="k-chart" aria-label={widget.label}>
            <div className="k-chart__head">
                <span className="k-chart__heading">
                    <h2 className="k-chart__title">{widget.label}</h2>
                    {widget.description === undefined ? null : <span className="k-chart__description">{widget.description}</span>}
                </span>
                {compares ? <Legend style={widget.style} /> : null}
            </div>
            {widget.data.length === 0 ? (
                <p className="k-help k-chart__empty">No numbers yet.</p>
            ) : (
                <Chart label={widget.label} style={widget.style} data={widget.data} />
            )}
        </section>
    );
}

function ReviewRow({ review, collections }: { review: WaitingReview; collections: readonly CollectionSummary[] }) {
    const asked = askedOf(review);
    return (
        <li>
            <a
                className="k-waiting__row"
                href={hrefOf({
                    kind: 'document',
                    ref: review.ref,
                })}>
                <span className="k-ellipsis">{review.label}</span>
                <span className="k-help k-ellipsis">
                    {asked === undefined ? kindOf(review.ref, collections) : `${kindOf(review.ref, collections)} · ${asked}`}
                </span>
            </a>
        </li>
    );
}

/**
 * A site's icon from a widget, or the shared content's for `undefined`.
 */
function WidgetSiteIcon({ site }: { site: DashboardSiteName | undefined }) {
    return (
        <SiteIcon
            site={
                site === undefined
                    ? undefined
                    : {
                          ...site,
                          pages: [],
                          globals: [],
                          collections: [],
                      }
            }
        />
    );
}

function ReviewsCard({ widget, collections }: { widget: ReviewsWidgetBody; collections: readonly CollectionSummary[] }) {
    const groups = widget.sites === undefined ? undefined : reviewGroupsOf(widget.reviews, widget.sites);
    return (
        <section
            className={groups === undefined ? 'k-waiting k-waiting--reviews' : 'k-waiting k-waiting--reviews k-waiting--grouped'}
            aria-labelledby="k-admin-waiting">
            <div className="k-waiting__head">
                <h2 id="k-admin-waiting" className="k-waiting__title">
                    Waiting for your review
                </h2>
                <span className="k-help">{widget.reviews.length}</span>
            </div>
            {widget.reviews.length === 0 ? (
                <p className="k-help">Nobody is waiting on you.</p>
            ) : groups === undefined ? (
                <ul className="k-waiting__list">
                    {widget.reviews.map((review) => (
                        <ReviewRow key={review.ref} review={review} collections={collections} />
                    ))}
                </ul>
            ) : (
                groups.map((group) => (
                    <div key={group.site?.key ?? ''} className="k-waiting__group">
                        <h3 className="k-group-head">
                            <WidgetSiteIcon site={group.site} />
                            <span className="k-heading">{group.site?.label ?? SHARED_GROUP}</span>
                        </h3>
                        <ul className="k-waiting__list">
                            {group.reviews.map((review) => (
                                <ReviewRow key={review.ref} review={review} collections={collections} />
                            ))}
                        </ul>
                    </div>
                ))
            )}
        </section>
    );
}

function RefreshFact({ refresh }: { refresh: RefreshState | null }) {
    if (refresh === null) return <span className="k-help">No refreshes yet</span>;
    const words = refreshWordsOf(refresh);
    const Icon = words.wrong ? CircleAlert : CircleCheck;
    return (
        <>
            <span className={words.wrong ? 'k-signal k-signal--wrong' : 'k-signal'}>
                <Icon {...ICON} size={14} aria-hidden="true" />
                {words.text}
            </span>
            {words.detail === undefined ? null : <span className="k-help">{words.detail}</span>}
        </>
    );
}

const hostOf = (url: string): string => {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
};

function SiteColumnView({ site, chart, domain }: { site: SiteColumn; chart: SitesWidgetBody['chart']; domain: readonly number[] }) {
    const [lead, ...rest] = site.stats;
    return (
        <div className="k-site">
            <h3 className="k-site__name">
                <WidgetSiteIcon site={site} />
                <span className="k-site__label k-ellipsis">{site.label}</span>
                <span className="k-site__url k-ellipsis">{hostOf(site.url)}</span>
            </h3>
            {lead === undefined ? null : (
                <div className="k-site__figure">
                    <span className="k-stat__head">
                        <span className="k-stat__label">{lead.label}</span>
                        <ChangeBadge change={lead.change} />
                    </span>
                    <strong className="k-stat__value">{lead.value ?? 'Not counted'}</strong>
                </div>
            )}
            {chart === null || site.chart === null ? null : site.chart.length === 0 ? (
                <p className="k-help">No numbers yet.</p>
            ) : (
                <Chart label={`${chart.label}, ${site.label}`} style={chart.style} data={site.chart} domain={domain} height={140} />
            )}
            <dl className="k-facts">
                {rest.map((stat) => (
                    <div key={stat.label} className="k-facts__row">
                        <dt>{stat.label}</dt>
                        <dd>
                            {stat.value === undefined ? (
                                <span className="k-help">Not counted</span>
                            ) : (
                                <span className="k-signal">
                                    {stat.value}
                                    <ChangeBadge change={stat.change} />
                                </span>
                            )}
                        </dd>
                    </div>
                ))}
                <div className="k-facts__row">
                    <dt>Waiting</dt>
                    <dd>{site.waiting === 0 ? 'No reviews' : site.waiting === 1 ? '1 review' : `${WHOLE.format(site.waiting)} reviews`}</dd>
                </div>
                <div className="k-facts__row">
                    <dt>Last publish</dt>
                    <dd>
                        {site.lastPublish === null ? (
                            <span className="k-help">Nothing published yet</span>
                        ) : (
                            <>
                                <a
                                    className="k-ellipsis k-facts__link"
                                    href={hrefOf({
                                        kind: 'document',
                                        ref: site.lastPublish.ref,
                                    })}>
                                    {site.lastPublish.label}
                                </a>
                                <span className="k-help">
                                    {site.lastPublish.by === null
                                        ? relativeTimeOf(site.lastPublish.at)
                                        : `${site.lastPublish.by}, ${relativeTimeOf(site.lastPublish.at)}`}
                                </span>
                            </>
                        )}
                    </dd>
                </div>
                <div className="k-facts__row">
                    <dt>Last refresh</dt>
                    <dd>
                        <RefreshFact refresh={site.lastRefresh} />
                    </dd>
                </div>
            </dl>
        </div>
    );
}

/**
 * The sites side by side, each chart on the scale every column shares.
 */
function SitesCard({ widget }: { widget: SitesWidgetBody }) {
    const domain = sharedScaleOf(widget.sites);
    return (
        <section className="k-sites" aria-labelledby="k-admin-sites">
            <h2 id="k-admin-sites" className="k-chart__title">
                Sites
            </h2>
            <div className="k-sites__grid" data-count={Math.min(widget.sites.length, 3)}>
                {widget.sites.map((site) => (
                    <SiteColumnView key={site.key} site={site} chart={widget.chart} domain={domain} />
                ))}
            </div>
        </section>
    );
}

function RefreshesCard({ widget }: { widget: RefreshesWidgetBody }) {
    return (
        <section className="k-waiting" aria-labelledby="k-admin-refreshes">
            <h2 id="k-admin-refreshes" className="k-waiting__title">
                Refreshes
            </h2>
            {widget.targets.length === 0 ? (
                <p className="k-help">No refreshes yet.</p>
            ) : (
                <ul className="k-refresh__list">
                    {widget.targets.map((target) => {
                        const words = target.last === null ? undefined : refreshWordsOf(target.last);
                        const Icon = words?.wrong === true ? CircleAlert : CircleCheck;
                        return (
                            <li
                                key={target.key}
                                className={words?.wrong === true ? 'k-refresh__row k-refresh__row--wrong' : 'k-refresh__row'}>
                                <Icon {...ICON} aria-hidden="true" />
                                <span className="k-refresh__who">
                                    <span className="k-ellipsis">{target.label}</span>
                                    <span className="k-help">{target.kind === 'site' ? 'Site' : 'Partner'}</span>
                                </span>
                                <span className="k-refresh__when">
                                    {words === undefined ? null : <span>{words.text}</span>}
                                    {words?.detail === undefined ? null : <span className="k-help">{words.detail}</span>}
                                    <span className="k-help">
                                        {target.answered} of {target.total} this period
                                    </span>
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

/**
 * A bar from the row's own value, as a share of the largest.
 */
function RankBar({ value, most }: { value: number; most: number }) {
    return (
        <span className="k-ranked__track" aria-hidden="true">
            <span
                className="k-ranked__bar"
                style={{
                    width: `${most === 0 ? 0 : (value / most) * 100}%`,
                }}
            />
        </span>
    );
}

function ReachCard({ widget }: { widget: ReachWidgetBody }) {
    const most = Math.max(0, ...widget.items.map((item) => item.pages));
    return (
        <section className="k-waiting k-reach" aria-labelledby="k-admin-reach">
            <h2 id="k-admin-reach" className="k-waiting__title">
                Shared content by reach
            </h2>
            {widget.items.length === 0 ? (
                <p className="k-help">No page shows shared content yet.</p>
            ) : (
                <>
                    <div className="k-columns-head" aria-hidden="true">
                        <span />
                        <span className="k-columns-head__span">Pages</span>
                        <span>Sites</span>
                    </div>
                    <ul className="k-ranked">
                        {widget.items.map((item) => (
                            <li key={item.ref}>
                                <a
                                    className="k-ranked__row"
                                    href={hrefOf({
                                        kind: 'document',
                                        ref: item.ref,
                                    })}>
                                    <span className="k-ranked__name">
                                        <span className="k-ellipsis">{item.label}</span>
                                        <span className="k-help k-ellipsis">
                                            {item.changed ? `${item.kind} · Unpublished changes` : item.kind}
                                        </span>
                                    </span>
                                    <RankBar value={item.pages} most={most} />
                                    <span className="k-ranked__value">
                                        {WHOLE.format(item.pages)}
                                        <span className="k-visually-hidden"> pages</span>
                                    </span>
                                    <span className="k-ranked__sites">
                                        {item.sites} of {widget.sites}
                                        <span className="k-visually-hidden"> sites</span>
                                    </span>
                                </a>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </section>
    );
}

function EditorsCard({ widget }: { widget: EditorsWidgetBody }) {
    const most = Math.max(0, ...widget.editors.map((editor) => editor.changes));
    return (
        <section className="k-waiting k-editors" aria-labelledby="k-admin-editors">
            <span className="k-chart__heading">
                <h2 id="k-admin-editors" className="k-waiting__title">
                    Editors
                </h2>
                <span className="k-chart__description">
                    {widget.changes === 1 ? '1 change' : `${WHOLE.format(widget.changes)} changes`} this period,{' '}
                    {WHOLE.format(widget.published)} published
                </span>
            </span>
            {widget.editors.length === 0 ? (
                <p className="k-help">Nobody changed anything this period.</p>
            ) : (
                <>
                    <div className="k-columns-head" aria-hidden="true">
                        <span />
                        <span />
                        <span className="k-columns-head__span">Changes</span>
                        <span>Last active</span>
                    </div>
                    <ul className="k-ranked">
                        {widget.editors.map((editor) => (
                            <li key={editor.id} className="k-ranked__row">
                                <Avatar
                                    person={{
                                        id: editor.id,
                                        name: editor.name,
                                        ...(editor.image === undefined
                                            ? {}
                                            : {
                                                  image: editor.image,
                                              }),
                                    }}
                                    size={26}
                                />
                                <span className="k-ranked__name">
                                    <span className="k-ellipsis">{editor.name}</span>
                                    <span className="k-help k-ellipsis">{roleOf(editor)}</span>
                                </span>
                                <RankBar value={editor.changes} most={most} />
                                <span className="k-ranked__value">
                                    {WHOLE.format(editor.changes)}
                                    <span className="k-visually-hidden"> changes</span>
                                </span>
                                <span className="k-ranked__when">{relativeTimeOf(editor.lastActive)}</span>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </section>
    );
}

function Panel({ widget, collections }: { widget: PanelWidgetBody; collections: readonly CollectionSummary[] }) {
    if (widget.type === 'chart') return <ChartCard widget={widget} />;
    if (widget.type === 'reviews') return <ReviewsCard widget={widget} collections={collections} />;
    if (widget.type === 'refreshes') return <RefreshesCard widget={widget} />;
    if (widget.type === 'reach') return <ReachCard widget={widget} />;
    return <EditorsCard widget={widget} />;
}

/**
 * Every collection and view as a card in one grid, in the order the sidebar
 * lists them, with a + on each collection to add an item.
 */
function CollectionCards({
    widget,
    creating,
    onCreate,
}: {
    widget: CollectionsWidgetBody;
    creating: string | undefined;
    onCreate: (name: string) => void;
}) {
    const collections = groupsOf(widget.collections).flatMap((group) => group.collections);
    if (collections.length === 0) return <p className="k-help">There are no collections for you to open.</p>;
    const own = collections.filter((collection) => collection.site !== undefined && collection.site !== null);
    const sections =
        own.length === 0
            ? [
                  {
                      heading: 'Collections',
                      collections,
                  },
              ]
            : [
                  {
                      heading: own[0]!.site!.label,
                      collections: own,
                  },
                  {
                      heading: SHARED_GROUP,
                      collections: collections.filter((collection) => !own.includes(collection)),
                  },
              ];
    return (
        <>
            {sections
                .filter((section) => section.collections.length > 0)
                .map((section) => (
                    <section key={section.heading} className="k-collections" aria-label={section.heading}>
                        <h2 className="k-heading">{section.heading}</h2>
                        <div className="k-collections__grid">
                            {section.collections.map((collection) => (
                                <CollectionCard
                                    key={`${collection.kind}:${collection.name}`}
                                    collection={collection}
                                    creating={creating}
                                    onCreate={onCreate}
                                />
                            ))}
                        </div>
                    </section>
                ))}
        </>
    );
}

function CollectionCard({
    collection,
    creating,
    onCreate,
}: {
    collection: DashboardCollection;
    creating: string | undefined;
    onCreate: (name: string) => void;
}) {
    // A site's own collection is added to from its list, which knows the site.
    const addable = collection.kind === 'collection' && (collection.site === undefined || collection.site === null);
    return (
        <div className="k-card">
            <a
                className="k-card__link"
                href={hrefOf({
                    kind: collection.kind,
                    name: collection.name,
                })}>
                <span className="k-card__text">
                    <span className="k-card__name k-ellipsis">{collection.label}</span>
                    <span className="k-card__count">
                        {collection.count === null ? 'View' : `${WHOLE.format(collection.count)} ${collection.label.toLowerCase()}`}
                    </span>
                </span>
                {addable ? null : <ChevronRight {...ICON} className="k-card__chevron" aria-hidden="true" />}
            </a>
            {addable ? (
                <Hint label={`Add to ${collection.label}`}>
                    <button
                        type="button"
                        className="k-icon-button k-card__add"
                        aria-label={`Add to ${collection.label}`}
                        disabled={creating !== undefined}
                        onClick={() => onCreate(collection.name)}>
                        <Plus {...ICON} />
                    </button>
                </Hint>
            ) : null}
        </div>
    );
}

/**
 * The widgets `GET /editing/dashboard` sends, in the order the config lists
 * them.
 */
export function Dashboard({
    connection,
    collections,
    onOpen,
}: {
    connection: Connection;
    collections: readonly CollectionSummary[] | undefined;
    onOpen: (ref: string) => void;
}) {
    const [widgets, setWidgets] = useState<DashboardWidgetBody[] | undefined>();
    const [failure, setFailure] = useState<string | undefined>();
    const [creating, setCreating] = useState<string | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const address = useAddress();
    const period = periodOfSearch(address.search);
    const site = screenOf(address.pathname).site;
    const [counted, setCounted] = useState<DashboardPeriod | undefined>();
    const [loading, setLoading] = useState(false);
    const requests = useRef(0);

    const choosePeriod = useCallback((key: PeriodKey): void => {
        replaceQuery({
            period: key === DEFAULT_PERIOD ? undefined : key,
        });
    }, []);

    // The widgets shown stay while the next period loads, and only the latest request lands.
    const load = useCallback(async (): Promise<void> => {
        const request = ++requests.current;
        setFailure(undefined);
        setLoading(true);
        const answer = await connection.call<{ widgets: DashboardWidgetBody[]; period?: DashboardPeriod }>('editing_dashboard', {
            query: {
                period,
                site,
            },
        });
        if (request !== requests.current) return;
        setLoading(false);
        if (answer.status === 400 && period !== DEFAULT_PERIOD) {
            choosePeriod(DEFAULT_PERIOD);
            return;
        }
        if (answer.status !== 200) {
            setFailure(problemOf(answer, 'The dashboard did not load'));
            return;
        }
        setWidgets(answer.body.widgets);
        setCounted(answer.body.period);
    }, [connection, period, site, choosePeriod]);

    useEffect(() => {
        void load();
    }, [load]);

    const create = async (name: string): Promise<void> => {
        setCreating(name);
        setProblem(undefined);
        const created = await createItem(connection, name);
        setCreating(undefined);
        if ('problem' in created) {
            setProblem(created.problem);
            return;
        }
        onOpen(created.ref);
    };

    // The first row of stat tiles sets the columns every row shares.
    const firstStats = runsOf(widgets ?? []).find((run) => run.kind === 'stats');
    const columns = tileColumnsOf(firstStats?.kind === 'stats' ? firstStats.widgets.length : 0);
    const isNew = widgets !== undefined && isNewOf(widgets);

    const body = (() => {
        if (failure !== undefined) {
            return (
                <div className="k-empty-state" role="alert">
                    <p className="k-empty-state__title">The dashboard did not load</p>
                    <p className="k-help">{failure}</p>
                    <div>
                        <button type="button" className="k-button k-button--secondary k-button--small" onClick={() => void load()}>
                            Try again
                        </button>
                    </div>
                </div>
            );
        }
        if (widgets === undefined) return <Loading />;
        const welcome = (
            <div key="welcome" className="k-empty-state">
                <h2 className="k-empty-state__title">Welcome to Kizuna</h2>
                <p className="k-help">
                    {widgets.some((widget) => widget.type === 'collections')
                        ? 'Numbers and reviews show up here once there are some. Start with a page or an item below.'
                        : 'Numbers, reviews and collections show up here once there are some for you.'}
                </p>
            </div>
        );
        if (isNew) {
            const collectionsWidget = widgets.find((widget) => widget.type === 'collections');
            return [
                welcome,
                collectionsWidget === undefined ? null : (
                    <div key="collections" className="k-dashboard__groups">
                        {problem === undefined ? null : (
                            <p className="k-error" role="alert">
                                <CircleAlert {...ICON} />
                                {problem}
                            </p>
                        )}
                        <CollectionCards widget={collectionsWidget} creating={creating} onCreate={(name) => void create(name)} />
                    </div>
                ),
            ];
        }
        return runsOf(widgets).map((run, index) => {
            if (run.kind === 'stats') {
                return (
                    <div key={index} className="k-dashboard__tiles">
                        {run.widgets.map((widget, position) => (
                            <StatTile key={position} widget={widget} />
                        ))}
                    </div>
                );
            }
            if (run.kind === 'panels') {
                return (
                    <div key={index} className="k-dashboard__panels">
                        {run.widgets.map((widget, position) => (
                            <Panel key={position} widget={widget} collections={collections ?? []} />
                        ))}
                    </div>
                );
            }
            if (run.kind === 'sites') return <SitesCard key={index} widget={run.widget} />;
            return (
                <div key={index} className="k-dashboard__groups">
                    {problem === undefined ? null : (
                        <p className="k-error" role="alert">
                            <CircleAlert {...ICON} />
                            {problem}
                        </p>
                    )}
                    <CollectionCards widget={run.widget} creating={creating} onCreate={(name) => void create(name)} />
                </div>
            );
        });
    })();

    return (
        <>
            <PageHeader
                title="Dashboard"
                actions={
                    isNew ? undefined : (
                        <>
                            {counted === undefined ? null : <span className="k-dashboard__range">{rangeOf(counted, 'en-GB')}</span>}
                            <SelectMenu items={PERIOD_ITEMS} value={period} onChange={choosePeriod} label="Period" />
                        </>
                    )
                }
            />
            <div className="k-admin__body k-dashboard" data-columns={columns} aria-busy={loading}>
                {body}
            </div>
        </>
    );
}
