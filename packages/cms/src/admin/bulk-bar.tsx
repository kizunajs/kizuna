import { useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import { Toast } from '@base-ui/react/toast';
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, CircleAlert, LoaderCircle } from 'lucide-react';
import { ICON } from '../view/context.js';
import { bulkLabelOf, bulkQuestionOf, type BulkAction, type BulkSummary } from './bulk.js';
import { ConfirmDialog } from './confirm.js';
import type { SelectionMove } from './list-order.js';

const MOVES: ReadonlyArray<{ move: SelectionMove; label: string; icon: typeof ArrowUp }> = [
    {
        move: 'top',
        label: 'Move to top',
        icon: ArrowUpToLine,
    },
    {
        move: 'up',
        label: 'Move up',
        icon: ArrowUp,
    },
    {
        move: 'down',
        label: 'Move down',
        icon: ArrowDown,
    },
    {
        move: 'bottom',
        label: 'Move to bottom',
        icon: ArrowDownToLine,
    },
];

/**
 * What the selection's actions share between the header, where they sit,
 * and the list, where what failed shows.
 */
export interface BulkRun {
    confirming: BulkAction | undefined;
    running: BulkAction | undefined;
    failed: BulkSummary | undefined;
    ask: (action: BulkAction) => void;
    cancel: () => void;
    run: (action: BulkAction) => Promise<void>;
}

/**
 * Runs an action on the rows ticked once the editor confirms it. A run that
 * went through everywhere says so in a toast, and one that did not keeps
 * what failed for the list to show.
 */
export const useBulkRun = (onRun: (action: BulkAction) => Promise<BulkSummary>): BulkRun => {
    const [confirming, setConfirming] = useState<BulkAction | undefined>();
    const [running, setRunning] = useState<BulkAction | undefined>();
    const [failed, setFailed] = useState<BulkSummary | undefined>();
    const toasts = Toast.useToastManager();
    return {
        confirming,
        running,
        failed,
        ask: (action) => {
            setFailed(undefined);
            setConfirming(action);
        },
        cancel: () => setConfirming(undefined),
        run: async (action) => {
            setConfirming(undefined);
            setFailed(undefined);
            setRunning(action);
            const answered = await onRun(action);
            setRunning(undefined);
            if (answered.problem) {
                setFailed(answered);
                return;
            }
            toasts.add({
                description: answered.message,
            });
        },
    };
};

/**
 * The header's actions while rows are ticked: how many, a way to tick every
 * row the list holds or none, and an action for all of them, asked first.
 */
export function SelectionActions({
    count,
    total,
    actions,
    bulk,
    onSelectAll,
    onClear,
    onMove,
    question,
}: {
    count: number;
    total: number;
    actions: readonly BulkAction[];
    bulk: BulkRun;
    /**
     * Moves the ticked rows together, for a list in an order.
     */
    onMove?: ((move: SelectionMove) => void) | undefined;
    /**
     * What the action being confirmed asks, when the list words it itself.
     */
    question?: string | undefined;
    onSelectAll: () => void;
    onClear: () => void;
}) {
    const busy = bulk.running !== undefined;
    return (
        <div className="k-selection" role="group" aria-label="Selection">
            <span className="k-selection__count" aria-live="polite">
                {count} selected
            </span>
            {count < total ? (
                <button type="button" className="k-button k-button--small k-selection__button" disabled={busy} onClick={onSelectAll}>
                    Select all {total}
                </button>
            ) : null}
            <button type="button" className="k-button k-button--small k-selection__button" disabled={busy} onClick={onClear}>
                Clear
            </button>
            {actions.length === 0 && onMove === undefined ? null : <span className="k-selection__divider" aria-hidden="true" />}
            {onMove === undefined ? null : (
                <Menu.Root>
                    <Menu.Trigger className="k-button k-button--small k-button--secondary" disabled={busy}>
                        Move
                    </Menu.Trigger>
                    <Menu.Portal>
                        <Menu.Positioner sideOffset={6} align="start" className="k-positioner">
                            <Menu.Popup className="k-popup k-menu">
                                {MOVES.map(({ move, label, icon: Icon }) => (
                                    <Menu.Item key={move} className="k-menu__item" onClick={() => onMove(move)}>
                                        <Icon {...ICON} className="k-menu__icon" />
                                        {label}
                                    </Menu.Item>
                                ))}
                            </Menu.Popup>
                        </Menu.Positioner>
                    </Menu.Portal>
                </Menu.Root>
            )}
            {actions.map((action) => (
                <button
                    key={action}
                    type="button"
                    className="k-button k-button--small k-button--secondary"
                    disabled={busy}
                    aria-haspopup="dialog"
                    onClick={() => bulk.ask(action)}>
                    {bulk.running === action ? <LoaderCircle {...ICON} className="k-spin" /> : null}
                    {bulkLabelOf(action)}
                </button>
            ))}
            <ConfirmDialog
                confirming={
                    bulk.confirming === undefined
                        ? undefined
                        : {
                              label: bulkLabelOf(bulk.confirming),
                              question: question ?? bulkQuestionOf(bulk.confirming, count),
                          }
                }
                onConfirm={() => {
                    if (bulk.confirming !== undefined) void bulk.run(bulk.confirming);
                }}
                onCancel={bulk.cancel}
            />
        </div>
    );
}

/**
 * The items an action could not run on, each with the server's reason.
 */
export function BulkFailures({ failed }: { failed: BulkSummary | undefined }) {
    if (failed === undefined) return null;
    return (
        <div className="k-selection__failures" role="alert">
            <p className="k-error">
                <CircleAlert {...ICON} />
                {failed.message}
            </p>
            <ul>
                {failed.failures.map((failure, index) => (
                    <li key={index}>
                        <b>{failure.title}</b>: {failure.problem}
                    </li>
                ))}
            </ul>
        </div>
    );
}
