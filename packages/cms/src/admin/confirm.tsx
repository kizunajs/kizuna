import { useRef } from 'react';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { X } from 'lucide-react';
import { ICON } from '../view/context.js';

/**
 * What a button asks before it runs: its question, and the label of the
 * button that goes ahead.
 */
export interface Confirmation {
    label: string;
    question: string;
}

/**
 * A question as the dialog shows it: up to its first question mark as the
 * title, and what follows as the line under it. "Unpublish 3 articles? Their
 * drafts stay." reads as the title "Unpublish 3 articles?" over "Their
 * drafts stay."
 */
export const confirmationTextOf = (question: string): { title: string; detail: string | undefined } => {
    const match = /^(.+?\?)\s+(\S.*)$/s.exec(question.trim());
    if (match === null) {
        return {
            title: question.trim(),
            detail: undefined,
        };
    }
    return {
        title: match[1]!,
        detail: match[2]!,
    };
};

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
    const text = confirming === undefined ? undefined : confirmationTextOf(confirming.question);
    return (
        <AlertDialog.Root
            open={confirming !== undefined}
            onOpenChange={(open) => {
                if (!open) onCancel();
            }}>
            <AlertDialog.Portal>
                <AlertDialog.Backdrop className="k-backdrop" />
                <AlertDialog.Popup className="k-dialog" initialFocus={proceed}>
                    <div className="k-dialog__head">
                        <AlertDialog.Title className="k-dialog__title">{text?.title}</AlertDialog.Title>
                        <AlertDialog.Close className="k-icon-button k-dialog__close" aria-label="Close">
                            <X {...ICON} />
                        </AlertDialog.Close>
                    </div>
                    {text?.detail === undefined ? null : (
                        <AlertDialog.Description className="k-dialog__detail">{text.detail}</AlertDialog.Description>
                    )}
                    <div className="k-dialog__actions">
                        <AlertDialog.Close className="k-button k-button--secondary">Cancel</AlertDialog.Close>
                        <button ref={proceed} type="button" className="k-button k-button--primary" onClick={onConfirm}>
                            {confirming?.label}
                        </button>
                    </div>
                </AlertDialog.Popup>
            </AlertDialog.Portal>
        </AlertDialog.Root>
    );
}
