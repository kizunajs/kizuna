import { useState } from 'react';
import { Toast } from '@base-ui/react/toast';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { ICON } from '../view/context.js';
import { bulkLabelOf, bulkQuestionOf, type BulkAction, type BulkSummary } from './bulk.js';
import { ConfirmDialog } from './confirm.js';

/**
 * The bar over a list with rows ticked: an action for all of them, asked
 * first in a dialog. The items it could not run on are listed below the bar,
 * and a run that went through everywhere says so in a toast.
 */
export function BulkBar({
    count,
    actions,
    onRun,
    onClear,
}: {
    count: number;
    actions: readonly BulkAction[];
    onRun: (action: BulkAction) => Promise<BulkSummary>;
    onClear: () => void;
}) {
    const [confirming, setConfirming] = useState<BulkAction | undefined>();
    const [running, setRunning] = useState<BulkAction | undefined>();
    const [failed, setFailed] = useState<BulkSummary | undefined>();
    const toasts = Toast.useToastManager();

    const run = async (action: BulkAction): Promise<void> => {
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
    };

    if (count === 0 && failed === undefined) return null;

    return (
        <div className="k-actions">
            {count === 0 ? null : (
                <div className="k-bulk-bar" role="toolbar" aria-label="Ticked items">
                    <b>{count} selected</b>
                    {actions.map((action) => (
                        <button
                            key={action}
                            type="button"
                            className="k-button k-button--small k-button--secondary"
                            disabled={running !== undefined}
                            aria-haspopup="dialog"
                            onClick={() => {
                                setFailed(undefined);
                                setConfirming(action);
                            }}>
                            {running === action ? <LoaderCircle {...ICON} className="k-spin" /> : null}
                            {bulkLabelOf(action)}
                        </button>
                    ))}
                    <span className="k-spacer" />
                    <button
                        type="button"
                        className="k-button k-button--small k-button--secondary"
                        disabled={running !== undefined}
                        onClick={onClear}>
                        Clear
                    </button>
                </div>
            )}
            <ConfirmDialog
                confirming={
                    confirming === undefined || count === 0
                        ? undefined
                        : {
                              label: bulkLabelOf(confirming),
                              question: bulkQuestionOf(confirming, count),
                          }
                }
                onConfirm={() => {
                    if (confirming !== undefined) void run(confirming);
                }}
                onCancel={() => setConfirming(undefined)}
            />
            {failed === undefined ? null : (
                <div className="k-bulk-bar__failures" role="alert">
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
            )}
        </div>
    );
}
