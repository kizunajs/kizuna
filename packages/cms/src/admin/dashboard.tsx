import { useState } from 'react';
import { CircleAlert, Plus } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { parseRef } from '../refs.js';
import { createItem } from './list.js';
import { hrefOf, type CollectionSummary, type NavigationSection } from './navigation.js';
import { Loading, Topbar } from './parts.js';

export interface WaitingReview {
    ref: string;
    label: string;
}

/**
 * What kind of document a ref names, as a word for the reviews list.
 */
const kindOf = (ref: string, collections: readonly CollectionSummary[]): string => {
    const parsed = parseRef(ref);
    if (parsed?.type === 'item') return collections.find((collection) => collection.name === parsed.collection)?.label ?? 'Item';
    return parsed?.type === 'global' ? 'Global' : 'Page';
};

/**
 * The reviews waiting for the person, and a card for every collection with a
 * way to add to it.
 */
export function Dashboard({
    connection,
    waiting,
    collections,
    sections,
    onOpen,
}: {
    connection: Connection;
    waiting: readonly WaitingReview[] | undefined;
    collections: readonly CollectionSummary[] | undefined;
    sections: readonly NavigationSection[];
    onOpen: (ref: string) => void;
}) {
    const [creating, setCreating] = useState<string | undefined>();
    const [problem, setProblem] = useState<string | undefined>();

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

    const grouped = sections
        .map((section) => ({
            label: section.label,
            collections: section.entries.flatMap(({ screen }) =>
                screen.kind === 'collection' ? (collections ?? []).filter((collection) => collection.name === screen.name) : []
            ),
        }))
        .filter((section) => section.collections.length > 0);

    return (
        <>
            <Topbar title="Dashboard" />
            <div className="k-admin-body">
                <section className="k-section" aria-labelledby="k-admin-waiting">
                    <div className="k-admin-card-head">
                        <h2 id="k-admin-waiting" className="k-section-title">
                            Waiting for your review
                        </h2>
                        {waiting === undefined ? null : <span className="k-help">{waiting.length}</span>}
                    </div>
                    {waiting === undefined ? (
                        <Loading />
                    ) : waiting.length === 0 ? (
                        <p className="k-help">Nobody is waiting on you.</p>
                    ) : (
                        <div className="k-admin-mini-list">
                            {waiting.map((review) => (
                                <a
                                    key={review.ref}
                                    className="k-admin-mini-row"
                                    href={hrefOf({
                                        kind: 'document',
                                        ref: review.ref,
                                    })}>
                                    <span className="k-ellipsis">{review.label}</span>
                                    <span className="k-help">{kindOf(review.ref, collections ?? [])}</span>
                                </a>
                            ))}
                        </div>
                    )}
                </section>
                {problem === undefined ? null : (
                    <p className="k-error" role="alert">
                        <CircleAlert {...ICON} />
                        {problem}
                    </p>
                )}
                {collections === undefined ? (
                    <Loading />
                ) : (
                    grouped.map((section) => (
                        <section key={section.label} className="k-admin-group" aria-label={section.label}>
                            <h2 className="k-admin-heading">{section.label}</h2>
                            <div className="k-admin-cards">
                                {section.collections.map((collection) => (
                                    <div key={collection.name} className="k-admin-card">
                                        <a
                                            className="k-admin-card-link"
                                            href={hrefOf({
                                                kind: 'collection',
                                                name: collection.name,
                                            })}>
                                            <span className="k-ellipsis">{collection.label}</span>
                                            <span className="k-help">{collection.count}</span>
                                        </a>
                                        <button
                                            type="button"
                                            className="k-icon-button"
                                            aria-label={`Add to ${collection.label}`}
                                            disabled={creating !== undefined}
                                            onClick={() => void create(collection.name)}>
                                            <Plus {...ICON} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))
                )}
            </div>
        </>
    );
}
