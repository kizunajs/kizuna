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
 * A row of buttons, for a header's actions. One with a question asks it first
 * in a dialog. What the server answered goes to `onProblem` when it refused,
 * and shows as a toast when the button ran.
 */
export function ActionBar({
    buttons,
    onRun,
    onProblem,
}: {
    buttons: readonly ActionButton[];
    onRun: (name: string) => Promise<Outcome>;
    onProblem: (problem: string | undefined) => void;
}) {
    const [confirming, setConfirming] = useState<ActionButton | undefined>();
    const [running, setRunning] = useState<string | undefined>();
    const toasts = Toast.useToastManager();

    const run = async (button: ActionButton): Promise<void> => {
        setConfirming(undefined);
        onProblem(undefined);
        setRunning(button.name);
        const answered = await onRun(button.name);
        setRunning(undefined);
        if (answered.problem) {
            onProblem(answered.message);
            return;
        }
        toasts.add({
            description: answered.message,
        });
    };

    return (
        <>
            {buttons.map((button) => (
                <button
                    key={button.name}
                    type="button"
                    className={`k-button k-button--small ${button.primary === true ? 'k-button--primary' : 'k-button--secondary'}`}
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
        </>
    );
}

/**
 * What the server refused, under the header.
 */
export function ActionProblem({ problem }: { problem: string | undefined }) {
    if (problem === undefined) return null;
    return (
        <p className="k-error k-action-problem" role="alert">
            <CircleAlert {...ICON} />
            {problem}
        </p>
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
    const [problem, setProblem] = useState<string | undefined>();
    if (shown.length === 0) return null;
    return (
        <div className="k-actions">
            <div className="k-actions__row">
                <ActionBar
                    buttons={shown}
                    onProblem={setProblem}
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
            </div>
            <ActionProblem problem={problem} />
        </div>
    );
}
