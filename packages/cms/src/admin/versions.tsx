import { useCallback, useEffect, useMemo, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { toolsFor, type Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { Avatar, type People } from '../view/people.js';
import type { DescribedField, PersonView } from '../view/schema.js';
import { fieldChanges, savedAtOf, type FieldChange, type VersionSummary } from './history.js';
import { Loading, Status, problemOf } from './parts.js';

/**
 * Every version of a document, newest first, with where it stood and who
 * saved it. Compare lists
 * the fields a version holds differently from the draft, and Restore makes
 * it the draft.
 */
export function Versions({
    connection,
    documentRef,
    version,
    fields,
    draft,
    people,
    disabled,
    onRestored,
    onOpen,
}: {
    connection: Connection;
    documentRef: string;
    /**
     * The draft's version, so a save that adds one lists it.
     */
    version: number;
    fields: readonly DescribedField[];
    draft: Record<string, unknown> | null;
    people: People | undefined;
    /**
     * The person has changes the form has not saved yet.
     */
    disabled: boolean;
    onRestored: () => Promise<void>;
    /**
     * Goes back to editing the current draft.
     */
    onOpen: () => void;
}) {
    const [versions, setVersions] = useState<VersionSummary[] | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const [compared, setCompared] = useState<{ version: number; content: Record<string, unknown> } | undefined>();
    const [working, setWorking] = useState<number | undefined>();
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

    const compare = async (chosen: number): Promise<void> => {
        if (tools === undefined) return;
        if (compared?.version === chosen) {
            setCompared(undefined);
            return;
        }
        setWorking(chosen);
        const answer = await connection.call<{ content: Record<string, unknown> }>(`${tools.prefix}_get_version`, {
            params: {
                ...tools.params,
                version: chosen,
            },
        });
        setWorking(undefined);
        if (answer.status !== 200) {
            setProblem(problemOf(answer, 'The version did not load'));
            return;
        }
        setProblem(undefined);
        setCompared({
            version: chosen,
            content: answer.body.content,
        });
    };

    const restore = async (chosen: number): Promise<void> => {
        if (tools === undefined) return;
        setWorking(chosen);
        const answer = await connection.call(`${tools.prefix}_rollback`, {
            params: tools.params,
            body: {
                version: chosen,
            },
        });
        setWorking(undefined);
        if (answer.status !== 200) {
            setProblem(problemOf(answer, 'The version was not restored'));
            return;
        }
        setProblem(undefined);
        setCompared(undefined);
        await onRestored();
        await load();
    };

    if (versions === undefined) return <Loading problem={problem} />;
    if (versions.length === 0) return <p className="k-help">Nothing is saved yet. The first save adds a version.</p>;

    const personOf = (author: string): PersonView =>
        people?.people.find((person) => person.id === author) ?? {
            id: author,
            name: author,
        };
    const changes: FieldChange[] = compared === undefined ? [] : fieldChanges(fields, compared.content, draft);
    const live = versions.find((entry) => entry.published)?.version;

    return (
        <div className="k-versions">
            <p className="k-help">Every save, newest first. Compare shows what changed against the current draft.</p>
            {problem === undefined ? null : (
                <p className="k-error" role="alert">
                    {problem}
                </p>
            )}
            <div className="k-versions__table" role="table" aria-label="Versions">
                <div className="k-versions__row k-versions__row--head" role="row">
                    <span role="columnheader">Saved</span>
                    <span role="columnheader">Status</span>
                    <span role="columnheader">By</span>
                    <span role="columnheader" className="k-versions__actions">
                        Actions
                    </span>
                </div>
                {versions.map((entry, index) => {
                    const author = personOf(entry.createdBy);
                    return (
                        <div key={entry.version} className="k-versions__entry" role="rowgroup">
                            <div className="k-versions__row" role="row" data-current={index === 0}>
                                <span className="k-versions__saved" role="cell">
                                    <span>{savedAtOf(entry.createdAt)}</span>
                                    {index === 0 ? (
                                        <span className="k-versions__note">Current draft</span>
                                    ) : entry.version === live ? (
                                        <span className="k-versions__note">Live on the site</span>
                                    ) : null}
                                </span>
                                <span role="cell">
                                    <Status status={entry.published ? 'published' : 'draft'} />
                                </span>
                                <span className="k-versions__by" role="cell">
                                    <Avatar person={author} />
                                    <span className="k-ellipsis">{author.name}</span>
                                </span>
                                <span className="k-versions__actions" role="cell">
                                    {working === entry.version ? <LoaderCircle {...ICON} className="k-spin" /> : null}
                                    {index === 0 ? (
                                        <button type="button" className="k-versions__quiet" onClick={onOpen}>
                                            Open
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                className="k-button k-button--secondary"
                                                aria-expanded={compared?.version === entry.version}
                                                disabled={working !== undefined}
                                                onClick={() => void compare(entry.version)}>
                                                Compare
                                            </button>
                                            <button
                                                type="button"
                                                className="k-versions__quiet"
                                                disabled={working !== undefined || disabled}
                                                onClick={() => void restore(entry.version)}>
                                                Restore
                                            </button>
                                        </>
                                    )}
                                </span>
                            </div>
                            {compared?.version === entry.version ? (
                                changes.length === 0 ? (
                                    <p className="k-help k-compare__empty">This version holds what the draft holds.</p>
                                ) : (
                                    <div className="k-compare" role="table" aria-label={`Version ${entry.version} against the draft`}>
                                        <div className="k-compare__row k-compare__row--head" role="row">
                                            <span role="columnheader">Field</span>
                                            <span role="columnheader">This version</span>
                                            <span role="columnheader">The draft</span>
                                        </div>
                                        {changes.map((change) => (
                                            <div key={change.path} className="k-compare__row" role="row">
                                                <span role="cell">{change.label}</span>
                                                <span role="cell" className="k-compare__then">
                                                    {change.then}
                                                </span>
                                                <span role="cell">{change.now}</span>
                                            </div>
                                        ))}
                                    </div>
                                )
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
