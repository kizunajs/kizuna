import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Connection } from '../view/connection.js';
import { FieldForm, type SaveState } from '../view/form.js';
import { ActionBar, ActionProblem, type ActionButton } from './action-buttons.js';
import { outcomeOf, shownActions, type Outcome } from './actions.js';
import { singularOf } from '../view/array-rows.js';
import { roleSubjectOf } from './access.js';
import { hrefOf } from './navigation.js';
import { NoAccess, NotFound, shownAddress } from './states.js';
import { PageHeader } from './page-header.js';
import { Loading, problemOf } from './parts.js';
import { viewActionCall, viewSaveCall, viewTool, withEdits, type ViewRecord } from './views.js';

const NOTHING_CHANGED: ReadonlySet<string> = new Set();

export { ViewList } from './list-view.js';

/**
 * One record of a view: its fields in their layout, Save when the editor may
 * save, and a button for each other action that applies.
 */
export function RecordScreen({
    connection,
    viewName,
    viewLabel,
    id,
    role,
    onSearch,
}: {
    connection: Connection;
    viewName: string;
    viewLabel: string;
    id: string;
    role: string | null;
    onSearch: () => void;
}) {
    const [record, setRecord] = useState<ViewRecord | undefined>();
    const [gone, setGone] = useState(false);
    const [loadProblem, setLoadProblem] = useState<string | undefined>();
    const [loadStatus, setLoadStatus] = useState<number | undefined>();
    const [edits, setEdits] = useState<Readonly<Record<string, unknown>>>({});
    const [formKey, setFormKey] = useState(0);
    const latestEdits = useRef<Readonly<Record<string, unknown>>>({});
    const formState = useRef<SaveState>('idle');
    const [typing, setTyping] = useState(false);
    const [problem, setProblem] = useState<string | undefined>();
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
                    setLoadStatus(answer.status);
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
        return outcomeOf(answer, label, `${label} ran for ${record.title}.`);
    };

    const crumb = {
        label: viewLabel,
        href: hrefOf({
            kind: 'view',
            name: viewName,
        }),
    };

    const back = {
        label: `Go to ${viewLabel}`,
        href: crumb.href,
    };
    if (loadStatus === 404) {
        const noun = singularOf(viewLabel).toLowerCase();
        return (
            <>
                <PageHeader
                    crumbs={[crumb]}
                    title={`${singularOf(viewLabel)} not found`}
                    meta={[
                        {
                            label: 'Address',
                            value: shownAddress(),
                        },
                    ]}
                />
                <NotFound noun={noun === viewLabel.toLowerCase() ? 'record' : noun} back={back} onSearch={onSearch} />
            </>
        );
    }
    if (loadStatus === 403) {
        return (
            <>
                <PageHeader crumbs={[crumb]} title={viewLabel} />
                <NoAccess title={viewLabel} role={roleSubjectOf(role)} back={back} />
            </>
        );
    }

    if (record === undefined) {
        return (
            <>
                <PageHeader crumbs={[crumb]} title="" />
                <div className="k-admin__body">
                    <Loading problem={loadProblem} />
                </div>
            </>
        );
    }

    const changed = Object.keys(edits).length > 0;
    // The view's own actions first, and Save last, where Publish sits on a document.
    const buttons: ActionButton[] = [
        ...(gone ? [] : shownActions(record.actions)),
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
    ];
    const status = record.readOnly ? 'Read only' : changed && !gone ? 'Unsaved changes' : undefined;

    return (
        <>
            <PageHeader
                crumbs={[crumb]}
                title={record.title}
                meta={[
                    status === undefined
                        ? null
                        : {
                              label: 'Status',
                              value: status,
                          },
                    {
                        label: 'ID',
                        value: <span className="k-record__id">{record.id}</span>,
                    },
                ]}
                actions={buttons.length === 0 ? undefined : <ActionBar buttons={buttons} onRun={run} onProblem={setProblem} />}
            />
            <ActionProblem problem={problem} />
            <div className="k-admin__body">
                {gone ? (
                    <p className="k-note">
                        This record is gone.{' '}
                        <a
                            className="k-inline-link"
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
                        readOnly={record.readOnly}
                    />
                )}
            </div>
        </>
    );
}
