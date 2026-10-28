import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleAlert, Plus } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { Hint } from '../view/hint.js';
import { parseRef } from '../refs.js';
import { Chart, Legend } from './chart.js';
import {
    changeOf,
    DEFAULT_PERIOD,
    groupsOf,
    PERIODS,
    periodOfHash,
    rangeOf,
    runsOf,
    tileColumnsOf,
    type ChartWidgetBody,
    type DashboardPeriod,
    type PeriodKey,
    type CollectionsWidgetBody,
    type DashboardWidgetBody,
    type ReviewsWidgetBody,
    type StatWidgetBody,
} from './dashboard-widgets.js';
import { createItem } from './list.js';
import { hrefOf, type CollectionSummary } from './navigation.js';
import { Loading, problemOf, Topbar } from './parts.js';
import { SelectMenu } from '../view/select-menu.js';

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
function StatTile({ widget }: { widget: StatWidgetBody }) {
    const change = widget.change === undefined ? undefined : changeOf(widget.change);
    return (
        <div className="k-stat">
            <span className="k-stat__head">
                <span className="k-stat__label">{widget.label}</span>
                {change === undefined ? null : <span className={`k-change k-change--${change.direction}`}>{change.text}</span>}
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

function ReviewsCard({ widget, collections }: { widget: ReviewsWidgetBody; collections: readonly CollectionSummary[] }) {
    return (
        <section className="k-waiting" aria-labelledby="k-admin-waiting">
            <div className="k-waiting__head">
                <h2 id="k-admin-waiting" className="k-waiting__title">
                    Waiting for your review
                </h2>
                <span className="k-help">{widget.reviews.length}</span>
            </div>
            {widget.reviews.length === 0 ? (
                <p className="k-help">Nobody is waiting on you.</p>
            ) : (
                <div className="k-waiting__list">
                    {widget.reviews.map((review) => (
                        <a
                            key={review.ref}
                            className="k-waiting__row"
                            href={hrefOf({
                                kind: 'document',
                                ref: review.ref,
                            })}>
                            <span className="k-ellipsis">{review.label}</span>
                            <span className="k-help">{kindOf(review.ref, collections)}</span>
                        </a>
                    ))}
                </div>
            )}
        </section>
    );
}

function CollectionCards({
    widget,
    creating,
    onCreate,
}: {
    widget: CollectionsWidgetBody;
    creating: string | undefined;
    onCreate: (name: string) => void;
}) {
    const groups = groupsOf(widget.collections);
    if (groups.length === 0) return <p className="k-help">There are no collections for you to open.</p>;
    return (
        <>
            {groups.map((group) => (
                <section key={group.label} className="k-collections" aria-label={group.label}>
                    <h2 className="k-heading">{group.label}</h2>
                    <div className="k-collections__grid">
                        {group.collections.map((collection) => (
                            <div key={`${collection.kind}:${collection.name}`} className="k-card">
                                <a
                                    className="k-card__link"
                                    href={hrefOf({
                                        kind: collection.kind,
                                        name: collection.name,
                                    })}>
                                    <span className="k-ellipsis">{collection.label}</span>
                                    <span className="k-card__count">
                                        {collection.count === null ? 'View' : WHOLE.format(collection.count)}
                                    </span>
                                </a>
                                {collection.kind === 'collection' ? (
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
                        ))}
                    </div>
                </section>
            ))}
        </>
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
    const [period, setPeriod] = useState<PeriodKey>(() => periodOfHash(window.location.hash));
    const [counted, setCounted] = useState<DashboardPeriod | undefined>();
    const [loading, setLoading] = useState(false);
    const requests = useRef(0);

    const choosePeriod = useCallback((key: PeriodKey): void => {
        window.history.replaceState(window.history.state, '', `#period=${key}`);
        setPeriod(key);
    }, []);

    // The widgets shown stay while the next period loads, and only the latest request lands.
    const load = useCallback(async (): Promise<void> => {
        const request = ++requests.current;
        setFailure(undefined);
        setLoading(true);
        const answer = await connection.call<{ widgets: DashboardWidgetBody[]; period?: DashboardPeriod }>('editing_dashboard', {
            query: {
                period,
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
    }, [connection, period, choosePeriod]);

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
        if (widgets.length === 0) {
            return (
                <div className="k-empty-state">
                    <p className="k-empty-state__title">Nothing here yet</p>
                    <p className="k-help">The dashboard shows numbers, reviews and collections once there are some for you.</p>
                </div>
            );
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
                        {run.widgets.map((widget, position) =>
                            widget.type === 'chart' ? (
                                <ChartCard key={position} widget={widget} />
                            ) : (
                                <ReviewsCard key={position} widget={widget} collections={collections ?? []} />
                            )
                        )}
                    </div>
                );
            }
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
            <Topbar title="Dashboard">
                <span className="k-spacer" />
                {counted === undefined ? null : <span className="k-dashboard__range">{rangeOf(counted)}</span>}
                <SelectMenu items={PERIOD_ITEMS} value={period} onChange={choosePeriod} label="Period" />
            </Topbar>
            <div className="k-admin__body k-dashboard" data-columns={columns} aria-busy={loading}>
                {body}
            </div>
        </>
    );
}
