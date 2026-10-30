import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, CircleAlert, CircleCheck, Plus } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { Hint } from '../view/hint.js';
import { parseRef } from '../refs.js';
import { Chart, Legend } from './chart.js';
import {
    agoOf,
    askedOf,
    barShareOf,
    changeOf,
    collectionSectionsOf,
    funnelRowsOf,
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
    type FunnelWidgetBody,
    type ListWidgetBody,
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

/**
 * A site's last refresh as a time, or a word when it did not answer, with
 * the rest on hover.
 */
function RefreshFact({ refresh }: { refresh: RefreshState | null }) {
    if (refresh === null) return <span>–</span>;
    const words = refreshWordsOf(refresh);
    const Icon = words.wrong ? CircleAlert : CircleCheck;
    const text = words.wrong ? (refresh.status === 'retrying' ? 'Retrying' : 'Failed') : CLOCK.format(new Date(refresh.at));
    return (
        <span
            className={words.wrong ? 'k-signal k-signal--wrong' : 'k-signal'}
            title={[words.text, words.detail].filter(Boolean).join('. ')}>
            <Icon {...ICON} size={14} aria-hidden="true" />
            {text}
        </span>
    );
}

const CLOCK = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
});

const hostOf = (url: string): string => {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
};

/**
 * A number cell: right-aligned, with the change before the value.
 */
function NumberCell({ value, change }: { value: ReactNode; change?: number | undefined }) {
    return (
        <td data-kind="number">
            <span className="k-dashboard-table__number">
                <ChangeBadge change={change} />
                <span>{value}</span>
            </span>
        </td>
    );
}

/**
 * The sites as the columns of one table: each site's name heads its column,
 * its chart sits under the name on the scale every column shares, and each
 * measure is a row across them.
 */
function SitesCard({ widget }: { widget: SitesWidgetBody }) {
    const domain = sharedScaleOf(widget.sites);
    const chart = widget.chart;
    const measures = widget.sites[0]?.stats.map((stat) => stat.label) ?? [];
    return (
        <section className="k-panel k-sites" aria-labelledby="k-admin-sites">
            <div className="k-panel__head">
                <h2 id="k-admin-sites" className="k-panel__title">
                    Sites
                </h2>
            </div>
            <div className="k-panel__table">
                <table className="k-table k-dashboard-table k-sites__table">
                    <colgroup>
                        <col className="k-sites__measure" />
                        {widget.sites.map((site) => (
                            <col key={site.key} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            <th scope="col">
                                <span className="k-visually-hidden">Measure</span>
                            </th>
                            {widget.sites.map((site) => (
                                <th key={site.key} scope="col" data-kind="number">
                                    <span className="k-sites__name">
                                        <WidgetSiteIcon site={site} />
                                        <span className="k-sites__label k-ellipsis">{site.label}</span>
                                        <span className="k-sites__url k-ellipsis">{hostOf(site.url)}</span>
                                    </span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {chart === null ? null : (
                            <tr className="k-sites__charts">
                                <th scope="row">{chart.label}</th>
                                {widget.sites.map((site) => (
                                    <td key={site.key}>
                                        {site.chart === null ? null : site.chart.length === 0 ? (
                                            <span className="k-table__detail">No numbers yet</span>
                                        ) : (
                                            <Chart
                                                label={`${chart.label}, ${site.label}`}
                                                style={chart.style}
                                                data={site.chart}
                                                domain={domain}
                                                height={104}
                                            />
                                        )}
                                    </td>
                                ))}
                            </tr>
                        )}
                        {measures.map((measure, index) => (
                            <tr key={measure} className="k-table__row">
                                <th scope="row">{measure}</th>
                                {widget.sites.map((site) => {
                                    const stat = site.stats[index];
                                    return <NumberCell key={site.key} value={stat?.value ?? '–'} change={stat?.change} />;
                                })}
                            </tr>
                        ))}
                        <tr className="k-table__row">
                            <th scope="row">Waiting</th>
                            {widget.sites.map((site) => (
                                <NumberCell key={site.key} value={site.waiting === 0 ? '–' : WHOLE.format(site.waiting)} />
                            ))}
                        </tr>
                        <tr className="k-table__row">
                            <th scope="row">Last publish</th>
                            {widget.sites.map((site) => {
                                const published = site.lastPublish;
                                if (published === null) return <NumberCell key={site.key} value="–" />;
                                return (
                                    <td key={site.key} data-kind="number">
                                        <a
                                            className="k-dashboard-table__number k-sites__publish"
                                            title={`${published.label}, published ${published.by === null ? '' : `by ${published.by} `}${relativeTimeOf(published.at)}`}
                                            href={hrefOf({
                                                kind: 'document',
                                                ref: published.ref,
                                            })}>
                                            <span className="k-ellipsis">{published.label}</span>
                                            <span className="k-sites__when">· {agoOf(published.at)}</span>
                                        </a>
                                    </td>
                                );
                            })}
                        </tr>
                        <tr className="k-table__row">
                            <th scope="row">Last refresh</th>
                            {widget.sites.map((site) => (
                                <td key={site.key} data-kind="number">
                                    <RefreshFact refresh={site.lastRefresh} />
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>
    );
}

/**
 * A panel on its card: the title, what its numbers count beside it, and the
 * rows under them.
 */
function PanelCard({
    label,
    description,
    className,
    children,
}: {
    label: string;
    description?: string | undefined;
    className?: string;
    children: ReactNode;
}) {
    const id = `k-admin-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    return (
        <section className={className === undefined ? 'k-panel' : `k-panel ${className}`} aria-labelledby={id}>
            <div className="k-panel__head">
                <h2 id={id} className="k-panel__title">
                    {label}
                </h2>
                {description === undefined ? null : <span className="k-panel__description">{description}</span>}
            </div>
            {children}
        </section>
    );
}

/**
 * Rows on the collection list's table, with column headings when there are
 * any.
 */
function PanelTable({
    label,
    headings,
    empty,
    children,
}: {
    label: string;
    headings: ReadonlyArray<{ text: string; number?: boolean }> | undefined;
    empty: string;
    children: ReactNode[];
}) {
    if (children.length === 0) return <p className="k-help k-panel__empty">{empty}</p>;
    return (
        <div className="k-panel__table">
            <table className="k-table k-dashboard-table" aria-label={label}>
                {headings === undefined ? null : (
                    <thead>
                        <tr>
                            {headings.map((heading, index) => (
                                <th key={index} scope="col" data-kind={heading.number === true ? 'number' : undefined}>
                                    {heading.text}
                                </th>
                            ))}
                        </tr>
                    </thead>
                )}
                <tbody>{children}</tbody>
            </table>
        </div>
    );
}

/**
 * The primary cell of a row: its name in the ink, and a muted line under it.
 */
function NameCell({ label, detail, href }: { label: string; detail?: string | undefined; href?: string }) {
    return (
        <td className="k-dashboard-table__name">
            <span className="k-table__name">
                {href === undefined ? (
                    <span className="k-table__link k-ellipsis">{label}</span>
                ) : (
                    <a className="k-table__link k-ellipsis" href={href}>
                        {label}
                    </a>
                )}
                {detail === undefined ? null : <span className="k-table__detail k-ellipsis">{detail}</span>}
            </span>
        </td>
    );
}

/**
 * A bar filling `share` of its track, for a row measured against a whole.
 */
function ShareBar({ share }: { share: number }) {
    return (
        <span className="k-ranked__track" aria-hidden="true">
            <span
                className="k-ranked__bar"
                style={{
                    width: `${share * 100}%`,
                }}
            />
        </span>
    );
}

function RefreshesCard({ widget }: { widget: RefreshesWidgetBody }) {
    return (
        <PanelCard label="Refreshes">
            <PanelTable
                label="Refreshes"
                headings={[
                    {
                        text: 'Site or partner',
                    },
                    {
                        text: 'Last refresh',
                        number: true,
                    },
                    {
                        text: 'Answered',
                        number: true,
                    },
                ]}
                empty="No refreshes yet.">
                {widget.targets.map((target) => (
                    <tr key={target.key} className="k-table__row">
                        <NameCell label={target.label} detail={target.kind === 'site' ? 'Site' : 'Partner'} />
                        <td data-kind="number">
                            <RefreshFact refresh={target.last} />
                        </td>
                        <NumberCell value={`${target.answered} of ${target.total}`} />
                    </tr>
                ))}
            </PanelTable>
        </PanelCard>
    );
}

function ReachCard({ widget }: { widget: ReachWidgetBody }) {
    return (
        <PanelCard label="Shared content by reach">
            <PanelTable
                label="Shared content by reach"
                headings={[
                    {
                        text: 'Item',
                    },
                    {
                        text: 'Pages',
                        number: true,
                    },
                    {
                        text: 'Sites',
                        number: true,
                    },
                ]}
                empty="No page shows shared content yet.">
                {widget.items.map((item) => (
                    <tr key={item.ref} className="k-table__row">
                        <NameCell
                            label={item.label}
                            detail={item.changed ? `${item.kind} · Unpublished changes` : item.kind}
                            href={hrefOf({
                                kind: 'document',
                                ref: item.ref,
                            })}
                        />
                        <NumberCell value={WHOLE.format(item.pages)} />
                        <NumberCell value={`${item.sites} of ${widget.sites}`} />
                    </tr>
                ))}
            </PanelTable>
        </PanelCard>
    );
}

function EditorsCard({ widget }: { widget: EditorsWidgetBody }) {
    return (
        <PanelCard
            label="Editors"
            description={`${widget.changes === 1 ? '1 change' : `${WHOLE.format(widget.changes)} changes`}, ${WHOLE.format(widget.published)} published`}>
            <PanelTable
                label="Editors"
                headings={[
                    {
                        text: 'Editor',
                    },
                    {
                        text: 'Changes',
                        number: true,
                    },
                    {
                        text: 'Last active',
                        number: true,
                    },
                ]}
                empty="Nobody changed anything this period.">
                {widget.editors.map((editor) => (
                    <tr key={editor.id} className="k-table__row">
                        <td className="k-dashboard-table__name">
                            <span className="k-dashboard-table__person">
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
                                <span className="k-table__name">
                                    <span className="k-table__link k-ellipsis">{editor.name}</span>
                                    <span className="k-table__detail k-ellipsis">{roleOf(editor)}</span>
                                </span>
                            </span>
                        </td>
                        <NumberCell value={WHOLE.format(editor.changes)} />
                        <NumberCell value={relativeTimeOf(editor.lastActive)} />
                    </tr>
                ))}
            </PanelTable>
        </PanelCard>
    );
}

function ListCard({ widget }: { widget: ListWidgetBody }) {
    const changes = widget.rows.some((row) => row.change !== undefined);
    const measured = widget.rows.some((row) => row.of !== undefined);
    return (
        <PanelCard label={widget.label} description={widget.description}>
            <PanelTable
                label={widget.label}
                headings={
                    widget.columns === undefined
                        ? undefined
                        : [
                              {
                                  text: widget.columns.label,
                              },
                              ...(measured
                                  ? [
                                        {
                                            text: '',
                                        },
                                    ]
                                  : []),
                              {
                                  text: widget.columns.value,
                                  number: true,
                              },
                              ...(changes
                                  ? [
                                        {
                                            text: 'Change',
                                            number: true,
                                        },
                                    ]
                                  : []),
                          ]
                }
                empty="Nothing yet.">
                {widget.rows.map((row, index) => (
                    <tr key={`${row.label} ${index}`} className="k-table__row">
                        <NameCell label={row.label} detail={row.detail} />
                        {measured ? (
                            <td className="k-dashboard-table__bar">
                                <ShareBar share={barShareOf(row, widget.rows)} />
                            </td>
                        ) : null}
                        <NumberCell value={row.formatted} />
                        {changes ? <NumberCell value={null} change={row.change} /> : null}
                    </tr>
                ))}
            </PanelTable>
        </PanelCard>
    );
}

function FunnelCard({ widget }: { widget: FunnelWidgetBody }) {
    const rows = funnelRowsOf(widget.steps);
    return (
        <PanelCard label={widget.label} description={widget.description} className="k-funnel">
            <PanelTable
                label={widget.label}
                headings={
                    widget.columns === undefined
                        ? undefined
                        : [
                              {
                                  text: widget.columns.label,
                              },
                              {
                                  text: '',
                              },
                              {
                                  text: widget.columns.value,
                                  number: true,
                              },
                              {
                                  text: 'Of previous',
                                  number: true,
                              },
                          ]
                }
                empty="Nothing yet.">
                {rows.map((row, index) => (
                    <tr key={`${row.label} ${index}`} className="k-table__row">
                        <NameCell label={row.label} />
                        <td className="k-dashboard-table__bar">
                            <ShareBar share={row.share} />
                        </td>
                        <NumberCell value={WHOLE.format(row.value)} />
                        <NumberCell value={row.kept ?? '–'} />
                    </tr>
                ))}
            </PanelTable>
        </PanelCard>
    );
}

function Panel({ widget, collections }: { widget: PanelWidgetBody; collections: readonly CollectionSummary[] }) {
    if (widget.type === 'chart') return <ChartCard widget={widget} />;
    if (widget.type === 'list') return <ListCard widget={widget} />;
    if (widget.type === 'funnel') return <FunnelCard widget={widget} />;
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
    const sections = collectionSectionsOf(collections, SHARED_GROUP);
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
