import type { ReactNode } from 'react';
import { Check, CircleAlert, LoaderCircle } from 'lucide-react';
import { ICON } from '../view/context.js';
import { hrefOf } from './navigation.js';
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
        <header className="k-topbar">
            {crumb === undefined ? null : (
                <>
                    <span className="k-topbar__crumb">{crumb}</span>
                    <span className="k-topbar__separator" aria-hidden="true">
                        /
                    </span>
                </>
            )}
            <h1 className="k-topbar__title">{title}</h1>
            {children}
        </header>
    );
}

/**
 * A document's header: the trail back to the dashboard and its list, its
 * title, a line of when it last changed and where it stands, and its actions
 * on the right.
 */
export function DocumentHeader({
    crumb,
    title,
    meta,
    actions,
}: {
    crumb: { label: string; href?: string };
    title: string;
    meta?: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <header className="k-document-header">
            <div className="k-document-header__main">
                <nav className="k-breadcrumb" aria-label="Breadcrumb">
                    <a
                        className="k-breadcrumb__link"
                        href={hrefOf({
                            kind: 'dashboard',
                        })}>
                        Dashboard
                    </a>
                    <span className="k-breadcrumb__separator" aria-hidden="true">
                        /
                    </span>
                    {crumb.href === undefined ? (
                        <span className="k-breadcrumb__link">{crumb.label}</span>
                    ) : (
                        <a className="k-breadcrumb__link" href={crumb.href}>
                            {crumb.label}
                        </a>
                    )}
                    {title === '' ? null : (
                        <>
                            <span className="k-breadcrumb__separator" aria-hidden="true">
                                /
                            </span>
                            <span className="k-breadcrumb__current k-ellipsis" aria-current="page">
                                {title}
                            </span>
                        </>
                    )}
                </nav>
                <h1 className="k-document-header__title">{title}</h1>
                {meta === undefined ? null : <div className="k-document-header__meta">{meta}</div>}
            </div>
            {actions === undefined ? null : <div className="k-document-header__actions">{actions}</div>}
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

/**
 * What a problem answer says, or a sentence naming its status.
 */
export const problemOf = (answer: { status: number; body: unknown }, fallback: string): string =>
    (answer.body as { detail?: string } | undefined)?.detail ?? `${fallback} (${answer.status}).`;
