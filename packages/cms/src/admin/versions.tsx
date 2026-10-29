import { useCallback, useEffect, useMemo, useState } from 'react';
import { toolsFor, type Connection } from '../view/connection.js';
import { Avatar, type People } from '../view/people.js';
import type { DescribedField, DescribedLayout, PersonView } from '../view/schema.js';
import { CompareVersions } from './compare.js';
import { savedAtOf, type VersionSummary } from './history.js';
import { PER_PAGE_CHOICES } from './list-columns.js';
import { ListStatus } from './list-rows.js';
import { Pager } from './list.js';
import { Loading, problemOf } from './parts.js';

/**
 * Every version of a document, newest first, with where it stood and who
 * saved it. Compare opens a version beside the current draft, and Restore
 * asks before it makes a version the draft.
 */
export function Versions({
    connection,
    documentRef,
    version,
    fields,
    layout,
    draft,
    people,
    disabled,
    compared,
    onCompare,
    onRestore,
    onOpen,
}: {
    connection: Connection;
    documentRef: string;
    /**
     * The draft's version, so a save that adds one lists it.
     */
    version: number;
    fields: readonly DescribedField[];
    layout: readonly DescribedLayout[];
    draft: Record<string, unknown> | null;
    people: People | undefined;
    /**
     * The person has changes the form has not saved yet.
     */
    disabled: boolean;
    /**
     * The version shown beside the draft, or undefined for the list.
     */
    compared: number | undefined;
    onCompare: (version: number | undefined) => void;
    /**
     * Asks before the version becomes the draft.
     */
    onRestore: (version: number) => void;
    /**
     * Goes back to editing the current draft.
     */
    onOpen: () => void;
}) {
    const [versions, setVersions] = useState<VersionSummary[] | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    // The page shown, counted from 0, and how many rows it holds, as the lists keep them.
    const [page, setPage] = useState(0);
    const [perPage, setPerPage] = useState(Math.min(...PER_PAGE_CHOICES));
    const tools = useMemo(() => toolsFor(documentRef), [documentRef]);

    const load = useCallback(async (): Promise<void> => {
        if (tools === undefined) return;
        const answer = await connection.call<{ versions: VersionSummary[] }>(`${tools.prefix}_history`, {
            params: tools.params,
        });
        if (answer.status !== 200) {
            setProblem(problemOf(answer, 'The versions did not load'));
            return;
        }
        setProblem(undefined);
        setVersions(answer.body.versions);
    }, [connection, tools]);

    useEffect(() => {
        void load();
    }, [load, version]);

    if (versions === undefined) return <Loading problem={problem} />;
    if (versions.length === 0) return <p className="k-help">Nothing is saved yet. The first save adds a version.</p>;
    if (compared !== undefined) {
        return (
            <CompareVersions
                connection={connection}
                documentRef={documentRef}
                fields={fields}
                layout={layout}
                draft={draft}
                versions={versions}
                compared={compared}
                people={people}
                onPick={onCompare}
                onBack={() => onCompare(undefined)}
            />
        );
    }

    const personOf = (author: string): PersonView =>
        people?.people.find((person) => person.id === author) ?? {
            id: author,
            name: author,
        };
    const live = versions.find((entry) => entry.published)?.version;
    const pageCount = Math.max(1, Math.ceil(versions.length / perPage));
    const current = Math.min(page, pageCount - 1);
    const shown = versions.slice(current * perPage, current * perPage + perPage);

    return (
        <div className="k-versions">
            <p className="k-versions__intro">Every save, newest first. Compare opens a version beside the current draft.</p>
            {problem === undefined ? null : (
                <p className="k-error" role="alert">
                    {problem}
                </p>
            )}
            <div className="k-table__scroll">
                <table className="k-table" aria-label="Versions">
                    <thead>
                        <tr>
                            <th scope="col" className="k-table__heading" data-kind="title">
                                Saved
                            </th>
                            <th scope="col" className="k-table__heading">
                                Status
                            </th>
                            <th scope="col" className="k-table__heading">
                                By
                            </th>
                            <th scope="col" className="k-table__heading k-versions__actions">
                                <span className="k-visually-hidden">Actions</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((entry) => {
                            const index = versions.indexOf(entry);
                            const author = personOf(entry.createdBy);
                            return (
                                <tr key={entry.version} className="k-table__row">
                                    <td className="k-table__title" data-kind="title">
                                        <span className="k-table__name">
                                            <span className="k-versions__date">{savedAtOf(entry.createdAt)}</span>
                                            {index === 0 ? (
                                                <span className="k-table__detail">Current draft</span>
                                            ) : entry.version === live ? (
                                                <span className="k-table__detail">Live on the site</span>
                                            ) : null}
                                        </span>
                                    </td>
                                    <td>
                                        {entry.review?.status === 'published-past-review' ? (
                                            <span className="k-versions__status">
                                                <span className="k-table__status" data-status="published-past-review">
                                                    Published past review
                                                </span>
                                                <span className="k-table__detail">by {entry.review.by.name}</span>
                                            </span>
                                        ) : entry.review?.status === 'approved' ? (
                                            <span className="k-versions__status">
                                                <ListStatus status={entry.published ? 'published' : 'draft'} />
                                                <span className="k-table__detail">Approved by {entry.review.by.name}</span>
                                            </span>
                                        ) : (
                                            <ListStatus status={entry.published ? 'published' : 'draft'} />
                                        )}
                                    </td>
                                    <td>
                                        <span className="k-versions__by">
                                            <Avatar person={author} />
                                            <span className="k-ellipsis">{author.name}</span>
                                        </span>
                                    </td>
                                    <td className="k-versions__actions">
                                        {index === 0 ? (
                                            <button type="button" className="k-versions__quiet" onClick={onOpen}>
                                                Open
                                            </button>
                                        ) : (
                                            <>
                                                <button
                                                    type="button"
                                                    className="k-versions__quiet"
                                                    onClick={() => onCompare(entry.version)}>
                                                    Compare
                                                </button>
                                                <button
                                                    type="button"
                                                    className="k-button k-button--secondary"
                                                    disabled={disabled}
                                                    onClick={() => onRestore(entry.version)}>
                                                    Restore
                                                </button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <Pager
                page={current}
                pageCount={pageCount}
                first={current * perPage + 1}
                last={current * perPage + shown.length}
                total={versions.length}
                perPage={perPage}
                onPage={setPage}
                onPerPage={(next) => {
                    setPerPage(next);
                    setPage(0);
                }}
            />
        </div>
    );
}
