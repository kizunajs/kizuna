import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, Plus } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { parseRef } from '../refs.js';
import { BarChart } from './chart.js';
import {
    groupsOf,
    runsOf,
    type ChartWidgetBody,
    type CollectionsWidgetBody,
    type DashboardWidgetBody,
    type ReviewsWidgetBody,
    type StatWidgetBody,
} from './dashboard-widgets.js';
import { createItem } from './list.js';
import { hrefOf, type CollectionSummary } from './navigation.js';
import { Loading, problemOf, Topbar } from './parts.js';

export type { WaitingReview } from './dashboard-widgets.js';

const WHOLE = new Intl.NumberFormat();

/**
 * What kind of document a ref names, as a word for the reviews list.
 */
const kindOf = (ref: string, collections: readonly CollectionSummary[]): string => {
    const parsed = parseRef(ref);
    if (parsed?.type === 'item') return collections.find((collection) => collection.name === parsed.collection)?.label ?? 'Item';
    return parsed?.type === 'global' ? 'Global' : 'Page';
};

function StatTile({ widget }: { widget: StatWidgetBody }) {
    return (
        <div className="k-section k-admin-tile">
            <span className="k-admin-tile-label">{widget.label}</span>
            <strong className="k-admin-tile-value">{widget.value}</strong>
            {widget.detail === undefined ? null : <span className="k-admin-tile-detail">{widget.detail}</span>}
        </div>
    );
}

function ChartCard({ widget }: { widget: ChartWidgetBody }) {
    return (
        <section className="k-section k-admin-chart" aria-label={widget.label}>
            <h2 className="k-section-title">{widget.label}</h2>
            {widget.data.length === 0 ? (
                <p className="k-help k-admin-chart-empty">No numbers yet.</p>
            ) : (
                <BarChart label={widget.label} data={widget.data} />
            )}
        </section>
    );
}

function ReviewsCard({ widget, collections }: { widget: ReviewsWidgetBody; collections: readonly CollectionSummary[] }) {
    return (
        <section className="k-section k-admin-reviews" aria-labelledby="k-admin-waiting">
            <div className="k-admin-card-head">
                <h2 id="k-admin-waiting" className="k-section-title">
                    Waiting for your review
                </h2>
                <span className="k-help">{widget.reviews.length}</span>
            </div>
            {widget.reviews.length === 0 ? (
                <p className="k-help">Nobody is waiting on you.</p>
            ) : (
                <div className="k-admin-mini-list">
                    {widget.reviews.map((review) => (
                        <a
                            key={review.ref}
                            className="k-admin-mini-row"
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
                <section key={group.label} className="k-admin-group" aria-label={group.label}>
                    <h2 className="k-admin-heading">{group.label}</h2>
                    <div className="k-admin-cards">
                        {group.collections.map((collection) => (
                            <div key={`${collection.kind}:${collection.name}`} className="k-admin-card">
                                <a
                                    className="k-admin-card-link"
                                    href={hrefOf({
                                        kind: collection.kind,
                                        name: collection.name,
                                    })}>
                                    <span className="k-ellipsis">{collection.label}</span>
                                    <span className="k-help">{collection.count === null ? 'View' : WHOLE.format(collection.count)}</span>
                                </a>
                                {collection.kind === 'collection' ? (
                                    <button
                                        type="button"
                                        className="k-icon-button"
                                        aria-label={`Add to ${collection.label}`}
                                        disabled={creating !== undefined}
                                        onClick={() => onCreate(collection.name)}>
                                        <Plus {...ICON} />
                                    </button>
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

    const load = useCallback(async (): Promise<void> => {
        setFailure(undefined);
        const answer = await connection.call<{ widgets: DashboardWidgetBody[] }>('editing_dashboard');
        if (answer.status !== 200) {
            setFailure(problemOf(answer, 'The dashboard did not load'));
            return;
        }
        setWidgets(answer.body.widgets);
    }, [connection]);

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

    const body = (() => {
        if (failure !== undefined) {
            return (
                <div className="k-empty-state" role="alert">
                    <p className="k-empty-title">The dashboard did not load</p>
                    <p className="k-help">{failure}</p>
                    <div>
                        <button type="button" className="k-button k-button-secondary k-button-small" onClick={() => void load()}>
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
                    <p className="k-empty-title">Nothing here yet</p>
                    <p className="k-help">The dashboard shows numbers, reviews and collections once there are some for you.</p>
                </div>
            );
        }
        return runsOf(widgets).map((run, index) => {
            if (run.kind === 'stats') {
                return (
                    <div key={index} className="k-admin-tiles">
                        {run.widgets.map((widget, position) => (
                            <StatTile key={position} widget={widget} />
                        ))}
                    </div>
                );
            }
            if (run.kind === 'panels') {
                return (
                    <div key={index} className="k-admin-panels">
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
                <div key={index} className="k-admin-groups">
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
            <Topbar title="Dashboard" />
            <div className="k-admin-body">{body}</div>
        </>
    );
}
