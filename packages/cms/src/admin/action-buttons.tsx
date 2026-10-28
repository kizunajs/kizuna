import { useState } from 'react';
import { Toast } from '@base-ui/react/toast';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { itemActionCall, outcomeOf, shownActions, type AvailableAction, type Outcome } from './actions.js';
import { ConfirmDialog } from './confirm.js';

/**
 * One button in the bar.
 */
export interface ActionButton {
    name: string;
    label: string;
    /**
     * Asked in a dialog before the button runs.
     */
    confirm?: string | undefined;
    primary?: boolean;
    disabled?: boolean;
}

/**
 * A row of buttons. One with a question asks it first in a dialog. A problem
 * the server answered shows below the row, and anything else as a toast.
 */
export function ActionBar({ buttons, onRun }: { buttons: readonly ActionButton[]; onRun: (name: string) => Promise<Outcome> }) {
    const [confirming, setConfirming] = useState<ActionButton | undefined>();
    const [running, setRunning] = useState<string | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const toasts = Toast.useToastManager();

    const run = async (button: ActionButton): Promise<void> => {
        setConfirming(undefined);
        setProblem(undefined);
        setRunning(button.name);
        const answered = await onRun(button.name);
        setRunning(undefined);
        if (answered.problem) {
            setProblem(answered.message);
            return;
        }
        toasts.add({
            description: answered.message,
        });
    };

    if (buttons.length === 0 && problem === undefined) return null;

    return (
        <div className="k-admin-actions">
            {buttons.length === 0 ? null : (
                <div className="k-admin-action-row">
                    {buttons.map((button) => (
                        <button
                            key={button.name}
                            type="button"
                            className={`k-button k-button-small ${button.primary === true ? 'k-button-primary' : 'k-button-secondary'}`}
                            disabled={button.disabled === true || running !== undefined}
                            aria-haspopup={button.confirm === undefined ? undefined : 'dialog'}
                            onClick={() => {
                                if (button.confirm === undefined) void run(button);
                                else setConfirming(button);
                            }}>
                            {running === button.name ? <LoaderCircle {...ICON} className="k-spin" /> : null}
                            {button.label}
                        </button>
                    ))}
                </div>
            )}
            <ConfirmDialog
                confirming={
                    confirming?.confirm === undefined
                        ? undefined
                        : {
                              label: confirming.label,
                              question: confirming.confirm,
                          }
                }
                onConfirm={() => {
                    if (confirming !== undefined) void run(confirming);
                }}
                onCancel={() => setConfirming(undefined)}
            />
            {problem === undefined ? null : (
                <p className="k-error" role="alert">
                    <CircleAlert {...ICON} />
                    {problem}
                </p>
            )}
        </div>
    );
}

/**
 * A collection item's actions, run on its published item. `onRan` reloads
 * the item, since an action may change whether the others apply.
 */
export function ItemActions({
    connection,
    documentRef,
    actions,
    onRan,
}: {
    connection: Connection;
    documentRef: string;
    actions: readonly AvailableAction[] | undefined;
    onRan: () => void;
}) {
    const shown = shownActions(actions);
    return (
        <ActionBar
            buttons={shown}
            onRun={async (name) => {
                const action = shown.find((candidate) => candidate.name === name);
                const call = itemActionCall(documentRef, name);
                const label = action?.label ?? name;
                if (call === undefined) {
                    return {
                        problem: true,
                        message: `${label} runs on an item of a collection.`,
                    };
                }
                const answer = await connection.call(call.name, call.input);
                if (answer.status < 300) onRan();
                return outcomeOf(answer, label);
            }}
        />
    );
}
