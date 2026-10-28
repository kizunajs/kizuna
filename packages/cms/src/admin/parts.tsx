import { Check, CircleAlert, LoaderCircle } from 'lucide-react';
import { ICON } from '../view/context.js';
import type { SaveState } from '../view/form.js';

const STATUS_LABEL: Record<string, string> = {
    empty: 'Not published',
    draft: 'Draft',
    published: 'Published',
    changed: 'Unpublished changes',
};

/**
 * Where a document stands, as the admin words it: Draft, Published, and so on.
 */
export const statusLabelOf = (status: string): string => STATUS_LABEL[status] ?? status;

export function Status({ status }: { status: string }) {
    return (
        <span className="k-status" data-status={status}>
            {statusLabelOf(status)}
        </span>
    );
}

export function SaveIndicator({ state }: { state: SaveState }) {
    if (state === 'idle') return null;
    return (
        <span className="k-save" role="status">
            {state === 'saving' || state === 'pending' ? <LoaderCircle {...ICON} className="k-spin" /> : null}
            {state === 'saved' ? <Check {...ICON} /> : null}
            {state === 'failed' ? <CircleAlert {...ICON} /> : null}
            {state === 'failed' ? 'Not saved' : state === 'saved' ? 'Saved' : 'Saving'}
        </span>
    );
}

export function Loading({ problem }: { problem?: string | undefined }) {
    return (
        <div className="k-empty">
            {problem === undefined ? (
                <LoaderCircle {...ICON} className="k-spin" />
            ) : (
                <p className="k-error" role="alert">
                    <CircleAlert {...ICON} />
                    {problem}
                </p>
            )}
        </div>
    );
}

/**
 * What a problem answer says, or a sentence naming its status.
 */
export const problemOf = (answer: { status: number; body: unknown }, fallback: string): string =>
    (answer.body as { detail?: string } | undefined)?.detail ?? `${fallback} (${answer.status}).`;
