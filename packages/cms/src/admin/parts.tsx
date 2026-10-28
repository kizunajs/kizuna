import type { ReactNode } from 'react';
import { Check, CircleAlert, LoaderCircle } from 'lucide-react';
import { ICON } from '../view/context.js';
import type { SaveState } from '../view/form.js';

const STATUS_LABEL: Record<string, string> = {
    empty: 'Not published',
    draft: 'Draft',
    published: 'Published',
    changed: 'Unpublished changes',
};

export function Status({ status }: { status: string }) {
    return (
        <span className="k-status" data-status={status}>
            {STATUS_LABEL[status] ?? status}
        </span>
    );
}

/**
 * A screen's bar: where it sits, its name, and what it offers on the right.
 */
export function Topbar({ crumb, title, children }: { crumb?: ReactNode; title: ReactNode; children?: ReactNode }) {
    return (
        <header className="k-admin-topbar">
            {crumb === undefined ? null : (
                <>
                    <span className="k-admin-crumb">{crumb}</span>
                    <span className="k-crumb-separator" aria-hidden="true">
                        /
                    </span>
                </>
            )}
            <h1 className="k-title-name">{title}</h1>
            {children}
        </header>
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

const DAY = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
});

const DAY_OF_YEAR = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
});

/**
 * When something last changed, as a day, with the year once it is not this
 * one.
 */
export const dayOf = (iso: string | null): string => {
    if (iso === null) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return (date.getFullYear() === new Date().getFullYear() ? DAY : DAY_OF_YEAR).format(date);
};

/**
 * What a problem answer says, or a sentence naming its status.
 */
export const problemOf = (answer: { status: number; body: unknown }, fallback: string): string =>
    (answer.body as { detail?: string } | undefined)?.detail ?? `${fallback} (${answer.status}).`;
