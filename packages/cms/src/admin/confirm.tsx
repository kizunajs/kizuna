import { useRef } from 'react';
import { AlertDialog } from '@base-ui/react/alert-dialog';

/**
 * What a button asks before it runs: its question, and the label of the
 * button that goes ahead.
 */
export interface Confirmation {
    label: string;
    question: string;
}

/**
 * Asks before an action runs, open while `confirming` holds a question.
 * Focus starts on the button that goes ahead, as the person already chose
 * the action once.
 */
export function ConfirmDialog({
    confirming,
    onConfirm,
    onCancel,
}: {
    confirming: Confirmation | undefined;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const proceed = useRef<HTMLButtonElement>(null);
    return (
        <AlertDialog.Root
            open={confirming !== undefined}
            onOpenChange={(open) => {
                if (!open) onCancel();
            }}>
            <AlertDialog.Portal>
                <AlertDialog.Backdrop className="k-backdrop" />
                <AlertDialog.Popup className="k-dialog" initialFocus={proceed}>
                    <AlertDialog.Title className="k-dialog-title">{confirming?.label}</AlertDialog.Title>
                    <AlertDialog.Description className="k-help">{confirming?.question}</AlertDialog.Description>
                    <div className="k-dialog-actions">
                        <AlertDialog.Close className="k-button k-button-secondary">Cancel</AlertDialog.Close>
                        <button ref={proceed} type="button" className="k-button k-button-primary" onClick={onConfirm}>
                            {confirming?.label}
                        </button>
                    </div>
                </AlertDialog.Popup>
            </AlertDialog.Portal>
        </AlertDialog.Root>
    );
}
