import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Search } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { FieldForm, type SaveState } from '../view/form.js';
import { ActionBar, type ActionButton } from './action-buttons.js';
import { outcomeOf, shownActions, type Outcome } from './actions.js';
import { hrefOf } from './navigation.js';
import { Loading, Topbar, problemOf } from './parts.js';
import {
    cellText,
    columnLabel,
    columnsOf,
    searchPlaceholder,
    viewActionCall,
    viewListCall,
    viewSaveCall,
    viewTool,
    withEdits,
    type ViewRecord,
    type ViewRow,
    type ViewSummary,
} from './views.js';

/**
 * How long the search waits after the last key before it asks the view.
 */
const SEARCH_DELAY = 250;

const NOTHING_CHANGED: ReadonlySet<string> = new Set();

/**
 * A view's records, as its `list` returns them for what the editor searched.
 */
export function ViewList({ connection, view, group }: { connection: Connection; view: ViewSummary; group: string }) {
    const [query, setQuery] = useState('');
    const [rows, setRows] = useState<ViewRow[] | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const asked = useRef(0);
    const columns = columnsOf(view);

    useEffect(() => {
        const ask = async (): Promise<void> => {
            asked.current += 1;
            const asking = asked.current;
            const call = viewListCall(view.name, query);
            const answer = await connection.call<{ items: ViewRow[] }>(call.name, call.input);
            // A slower answer to an earlier search must not replace a newer one.
            if (asking !== asked.current) return;
            if (answer.status !== 200) {
                setProblem(problemOf(answer, 'The records did not load'));
                return;
            }
            setProblem(undefined);
            setRows(answer.body.items);
        };
        const timer = window.setTimeout(() => void ask(), query === '' ? 0 : SEARCH_DELAY);
        return () => window.clearTimeout(timer);
    }, [connection, view.name, query]);

    const grid = {
        '--k-columns': columns.length,
    } as CSSProperties;

    return (
        <>
            <Topbar crumb={group} title={view.label}>
                {rows === undefined ? null : <span className="k-status">{rows.length}</span>}
                {view.readOnly ? <span className="k-status">Read only</span> : null}
            </Topbar>
            <div className="k-admin-body">
                <label className="k-admin-search">
                    <Search {...ICON} />
                    <input
                        type="search"
                        placeholder={searchPlaceholder(view)}
                        aria-label={`Search ${view.label.toLowerCase()}`}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </label>
                {rows === undefined ? (
                    <Loading problem={problem} />
                ) : (
                    <>
                        {problem === undefined ? null : (
                            <p className="k-error" role="alert">
                                {problem}
                            </p>
                        )}
                        {rows.length === 0 ? (
                            <div className="k-empty-state">
                                <p className="k-empty-title">
                                    {query.trim() === '' ? `Nothing in ${view.label.toLowerCase()}` : 'Nothing matches'}
                                </p>
                            </div>
                        ) : (
                            <div className="k-admin-rows" role="table" aria-label={view.label}>
                                <div className="k-admin-row k-admin-row-head" role="row" data-columns style={grid}>
                                    {columns.map((column) => (
                                        <span key={column} role="columnheader">
                                            {columnLabel(column)}
                                        </span>
                                    ))}
                                </div>
                                {rows.map((row) => (
                                    <a
                                        key={row.id}
                                        className="k-admin-row"
                                        role="row"
                                        data-columns
                                        style={grid}
                                        href={hrefOf({
                                            kind: 'record',
                                            view: view.name,
                                            id: row.id,
                                        })}>
                                        {columns.map((column, index) => (
                                            <span key={column} role="cell" className={index === 0 ? 'k-admin-row-title' : 'k-admin-cell'}>
                                                <span className="k-ellipsis">{index === 0 ? row.title : cellText(row.values[column])}</span>
                                            </span>
                                        ))}
                                    </a>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    );
}

/**
 * One record of a view: its fields in their layout, Save when the editor may
 * save, and a button for each other action that applies.
 */
export function RecordScreen({
    connection,
    viewName,
    viewLabel,
    id,
}: {
    connection: Connection;
    viewName: string;
    viewLabel: string;
    id: string;
}) {
    const [record, setRecord] = useState<ViewRecord | undefined>();
    const [gone, setGone] = useState(false);
    const [loadProblem, setLoadProblem] = useState<string | undefined>();
    const [edits, setEdits] = useState<Readonly<Record<string, unknown>>>({});
    const [formKey, setFormKey] = useState(0);
    const latestEdits = useRef<Readonly<Record<string, unknown>>>({});
    const formState = useRef<SaveState>('idle');
    const [typing, setTyping] = useState(false);
    const settled = useRef<(() => void) | undefined>(undefined);

    const replace = useCallback((next: ViewRecord | undefined, keepEdits: boolean): void => {
        if (next === undefined) setGone(true);
        else setRecord(next);
        if (!keepEdits) {
            latestEdits.current = {};
            setEdits({});
        }
        setFormKey((key) => key + 1);
    }, []);

    useEffect(() => {
        setRecord(undefined);
        setGone(false);
        setLoadProblem(undefined);
        latestEdits.current = {};
        setEdits({});
        void connection
            .call<ViewRecord>(viewTool(viewName, 'get'), {
                params: {
                    id,
                },
            })
            .then((answer) => {
                if (answer.status !== 200) {
                    setLoadProblem(problemOf(answer, 'The record did not load'));
                    return;
                }
                setRecord(answer.body);
                setFormKey((key) => key + 1);
            });
    }, [connection, viewName, id]);

    const draft = useMemo(() => (record === undefined ? null : withEdits(record.item, edits)), [record, edits]);

    /**
     * Waits for the form to hand over what the editor typed last, which it
     * does a moment after they stop.
     */
    const formSettled = (): Promise<void> =>
        formState.current === 'pending' || formState.current === 'saving'
            ? new Promise((resolve) => {
                  settled.current = resolve;
              })
            : Promise.resolve();

    const run = async (name: string): Promise<Outcome> => {
        if (record === undefined) {
            return {
                problem: true,
                message: 'The record has not loaded.',
            };
        }
        if (name === 'save') {
            await formSettled();
            const call = viewSaveCall(viewName, record.id, record.item, latestEdits.current);
            const answer = await connection.call<ViewRecord>(call.name, call.input);
            if (answer.status === 200 || answer.status === 204) replace(answer.status === 200 ? answer.body : undefined, false);
            return outcomeOf(answer, 'Save', 'Saved.');
        }
        const action = record.actions.find((candidate) => candidate.name === name);
        const label = action?.label ?? name;
        const call = viewActionCall(viewName, record.id, name);
        const answer = await connection.call<ViewRecord>(call.name, call.input);
        if (answer.status === 200 || answer.status === 204) replace(answer.status === 200 ? answer.body : undefined, true);
        return outcomeOf(answer, label);
    };

    const crumb = (
        <a
            href={hrefOf({
                kind: 'view',
                name: viewName,
            })}>
            {viewLabel}
        </a>
    );

    if (record === undefined) {
        return (
            <>
                <Topbar crumb={crumb} title="" />
                <div className="k-admin-body">
                    <Loading problem={loadProblem} />
                </div>
            </>
        );
    }

    const changed = Object.keys(edits).length > 0;
    const buttons: ActionButton[] = [
        ...(record.readOnly || gone
            ? []
            : [
                  {
                      name: 'save',
                      label: 'Save',
                      primary: true,
                      disabled: !changed && !typing,
                  },
              ]),
        ...(gone ? [] : shownActions(record.actions)),
    ];

    return (
        <>
            <Topbar crumb={crumb} title={record.title}>
                {record.readOnly ? <span className="k-status">Read only</span> : null}
                {changed && !gone ? <span className="k-save">Unsaved changes</span> : null}
            </Topbar>
            <div className="k-admin-body">
                {gone ? (
                    <p className="k-note">
                        This record is gone.{' '}
                        <a
                            className="k-admin-inline-link"
                            href={hrefOf({
                                kind: 'view',
                                name: viewName,
                            })}>
                            Back to {viewLabel}
                        </a>
                    </p>
                ) : (
                    <FieldForm
                        key={`${record.id}:${formKey}`}
                        fields={record.fields}
                        layout={record.layout}
                        draft={draft}
                        onSave={async (changes) => {
                            latestEdits.current = {
                                ...latestEdits.current,
                                ...changes,
                            };
                            setEdits(latestEdits.current);
                            return undefined;
                        }}
                        onState={(state) => {
                            formState.current = state;
                            setTyping(state === 'pending' || state === 'saving');
                            if (state !== 'pending' && state !== 'saving') {
                                settled.current?.();
                                settled.current = undefined;
                            }
                        }}
                        changed={NOTHING_CHANGED}
                        pointed={undefined}
                    />
                )}
                <ActionBar buttons={buttons} onRun={run} />
            </div>
        </>
    );
}
