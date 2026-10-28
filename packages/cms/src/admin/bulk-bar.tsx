import { useState } from 'react';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { ICON } from '../view/context.js';
import { bulkLabelOf, bulkQuestionOf, type BulkAction, type BulkSummary } from './bulk.js';

/**
 * The bar over a list with rows ticked: an action for all of them, asked
 * first inside the page, and how each item went once it ran.
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
    const [summary, setSummary] = useState<BulkSummary | undefined>();

    const run = async (action: BulkAction): Promise<void> => {
        setConfirming(undefined);
        setSummary(undefined);
        setRunning(action);
        const answered = await onRun(action);
        setRunning(undefined);
        setSummary(answered);
    };

    if (count === 0 && summary === undefined) return null;

    return (
        <div className="k-admin-actions">
            {count === 0 ? null : (
                <div className="k-admin-bulk" role="toolbar" aria-label="Ticked items">
                    <b>{count} selected</b>
                    {actions.map((action) => (
                        <button
                            key={action}
                            type="button"
                            className="k-button k-button-small k-button-secondary"
                            disabled={running !== undefined}
                            aria-expanded={confirming === action}
                            onClick={() => {
                                setSummary(undefined);
                                setConfirming(action);
                            }}>
                            {running === action ? <LoaderCircle {...ICON} className="k-spin" /> : null}
                            {bulkLabelOf(action)}
                        </button>
                    ))}
                    <span className="k-admin-spacer" />
                    <button
                        type="button"
                        className="k-button k-button-small k-button-secondary"
                        disabled={running !== undefined}
                        onClick={onClear}>
                        Clear
                    </button>
                </div>
            )}
            {confirming === undefined || count === 0 ? null : (
                <div
                    className="k-admin-confirm"
                    role="group"
                    aria-label={bulkLabelOf(confirming)}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') setConfirming(undefined);
                    }}>
                    <p>{bulkQuestionOf(confirming, count)}</p>
                    <div className="k-admin-action-row">
                        <button
                            type="button"
                            className="k-button k-button-small k-button-primary"
                            autoFocus
                            onClick={() => void run(confirming)}>
                            {bulkLabelOf(confirming)}
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
            {summary === undefined ? null : summary.problem ? (
                <div className="k-admin-bulk-failures" role="alert">
                    <p className="k-error">
                        <CircleAlert {...ICON} />
                        {summary.message}
                    </p>
                    <ul>
                        {summary.failures.map((failure, index) => (
                            <li key={index}>
                                <b>{failure.title}</b>: {failure.problem}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
                <p className="k-help" role="status">
                    {summary.message}
                </p>
            )}
        </div>
    );
}
