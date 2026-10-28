import { useState } from 'react';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { itemActionCall, outcomeOf, shownActions, type AvailableAction, type Outcome } from './actions.js';

/**
 * One button in the bar.
 */
export interface ActionButton {
    name: string;
    label: string;
    /**
     * Asked inside the page before the button runs.
     */
    confirm?: string | undefined;
    primary?: boolean;
    disabled?: boolean;
}

/**
 * A row of buttons. One with a question asks it first, and what the server
 * answered shows below once it runs.
 */
export function ActionBar({ buttons, onRun }: { buttons: readonly ActionButton[]; onRun: (name: string) => Promise<Outcome> }) {
    const [confirming, setConfirming] = useState<ActionButton | undefined>();
    const [running, setRunning] = useState<string | undefined>();
    const [outcome, setOutcome] = useState<Outcome | undefined>();

    const run = async (button: ActionButton): Promise<void> => {
        setConfirming(undefined);
        setOutcome(undefined);
        setRunning(button.name);
        const answered = await onRun(button.name);
        setRunning(undefined);
        setOutcome(answered);
    };

    if (buttons.length === 0 && outcome === undefined) return null;

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
                            aria-expanded={button.confirm === undefined ? undefined : confirming?.name === button.name}
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
            {confirming === undefined ? null : (
                <div
                    className="k-admin-confirm"
                    role="group"
                    aria-label={confirming.label}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') setConfirming(undefined);
                    }}>
                    <p>{confirming.confirm}</p>
                    <div className="k-admin-action-row">
                        <button
                            type="button"
                            className="k-button k-button-small k-button-primary"
                            autoFocus
                            onClick={() => void run(confirming)}>
                            {confirming.label}
                        </button>
                        <button
                            type="button"
                            className="k-button k-button-small k-button-secondary"
                            onClick={() => setConfirming(undefined)}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}
            {outcome === undefined ? null : outcome.problem ? (
                <p className="k-error" role="alert">
                    <CircleAlert {...ICON} />
                    {outcome.message}
                </p>
            ) : (
                <p className="k-help" role="status">
                    {outcome.message}
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
