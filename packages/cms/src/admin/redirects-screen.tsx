import { useCallback, useEffect, useId, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Toast } from '@base-ui/react/toast';
import { CircleAlert, Lock, X } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON, useEditorContext } from '../view/context.js';
import { Hint } from '../view/hint.js';
import { LinkTargetRow, LinkTargetSheet, useDescribedTargets } from '../view/link-picker.js';
import { Avatar } from '../view/people.js';
import { ConfirmDialog } from './confirm.js';
import { PageHeader } from './page-header.js';
import { problemOf } from './parts.js';
import {
    deleteRedirectQuestionOf,
    destinationOf,
    formFromProblem,
    formOf,
    madeByOf,
    recreateBodyOf,
    redirectBodyOf,
    redirectCallOf,
    statusLabelOf,
    type RedirectForm,
    type RedirectStatus,
    type RedirectView,
} from './redirects.js';

const TARGET_MODES: ReadonlyArray<[RedirectForm['mode'], string]> = [
    ['document', 'Page'],
    ['path', 'Path'],
    ['url', 'URL'],
];

const STATUSES: readonly RedirectStatus[] = [308, 307];

/**
 * A field the dialog shows but may not change, in its input's shape with a
 * lock.
 */
function LockedValue({ id, text, reason }: { id: string; text: string; reason: string }) {
    return (
        <p className="k-read-only" aria-labelledby={id}>
            <span className="k-read-only__text">{text}</span>
            <Hint label={reason}>
                <span className="k-read-only__lock" role="img" aria-label={reason} tabIndex={0}>
                    <Lock size={13} strokeWidth={1.75} aria-hidden />
                </span>
            </Hint>
        </p>
    );
}

/**
 * Adds a redirect, or changes or deletes one. A redirect a rename made shows
 * its fields locked, and can only be deleted.
 */
function RedirectDialog({
    connection,
    site,
    editing,
    onClose,
    onSaved,
    onDelete,
}: {
    connection: Connection;
    site: string | undefined;
    /**
     * The redirect open, `null` for a new one, or `undefined` while closed.
     */
    editing: RedirectView | null | undefined;
    onClose: () => void;
    onSaved: (redirect: RedirectView) => void;
    onDelete: (redirect: RedirectView) => void;
}) {
    const [form, setForm] = useState<RedirectForm>(() => formOf());
    const [picking, setPicking] = useState(false);
    const [problem, setProblem] = useState<string | undefined>();
    const [busy, setBusy] = useState(false);
    const fromId = useId();
    const toId = useId();
    const statusId = useId();
    const open = editing !== undefined;
    const locked = editing?.origin === 'rename';

    useEffect(() => {
        if (!open) return;
        setForm(formOf(editing ?? undefined));
        setProblem(undefined);
    }, [open, editing]);

    const targets = useDescribedTargets(form.mode === 'document' && form.ref !== undefined ? [form.ref] : []);
    const target = form.ref === undefined ? undefined : targets.get(form.ref);
    const fromProblem = formFromProblem(form);
    const body = redirectBodyOf(form);
    const change = (next: Partial<RedirectForm>): void =>
        setForm((current) => ({
            ...current,
            ...next,
        }));

    const save = async (): Promise<void> => {
        if (body === undefined) return;
        setBusy(true);
        const call =
            editing === null || editing === undefined
                ? redirectCallOf(site, 'create', {
                      body,
                  })
                : redirectCallOf(site, 'update', {
                      id: editing.id,
                      body,
                  });
        const answer = await connection.call<RedirectView>(call.name, call.input);
        setBusy(false);
        if (answer.status >= 300) {
            setProblem(problemOf(answer, 'The redirect was not saved'));
            return;
        }
        onSaved(answer.body);
    };

    const reason = editing?.to.type === 'document' ? `Made when ${editing.to.label} was renamed` : 'Made by a rename';
    const shown = editing === null || editing === undefined ? undefined : destinationOf(editing.to);

    return (
        <Dialog.Root
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}>
            <Dialog.Portal>
                <Dialog.Backdrop className="k-backdrop" />
                <Dialog.Popup className="k-dialog k-redirect-dialog">
                    <div className="k-dialog__head">
                        <Dialog.Title className="k-dialog__title">{editing === null ? 'New redirect' : 'Redirect'}</Dialog.Title>
                        <Dialog.Close className="k-icon-button k-dialog__close" aria-label="Close">
                            <X {...ICON} />
                        </Dialog.Close>
                    </div>
                    <form
                        className="k-redirect-dialog__body"
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (!locked) void save();
                        }}>
                        <div className="k-field">
                            <label className="k-field__label" id={`${fromId}-label`} htmlFor={fromId}>
                                From
                            </label>
                            {locked ? (
                                <LockedValue id={`${fromId}-label`} text={form.from} reason={reason} />
                            ) : (
                                <input
                                    id={fromId}
                                    className="k-input"
                                    value={form.from}
                                    placeholder="/old-address"
                                    autoFocus
                                    aria-invalid={fromProblem !== undefined}
                                    onChange={(event) =>
                                        change({
                                            from: event.target.value,
                                        })
                                    }
                                />
                            )}
                            {fromProblem === undefined || locked ? null : (
                                <p className="k-error" role="alert">
                                    <CircleAlert {...ICON} />
                                    {fromProblem}
                                </p>
                            )}
                        </div>
                        <div className="k-field">
                            <span className="k-field__label" id={`${toId}-label`}>
                                To
                            </span>
                            {locked ? (
                                <LockedValue
                                    id={`${toId}-label`}
                                    text={shown?.detail === undefined ? (shown?.title ?? '') : `${shown.title} · ${shown.detail}`}
                                    reason={reason}
                                />
                            ) : (
                                <div className="k-link-field__row">
                                    <div className="k-segmented" role="radiogroup" aria-labelledby={`${toId}-label`}>
                                        {TARGET_MODES.map(([mode, label]) => (
                                            <button
                                                key={mode}
                                                type="button"
                                                role="radio"
                                                className="k-tab"
                                                aria-checked={form.mode === mode}
                                                onClick={() =>
                                                    change({
                                                        mode,
                                                    })
                                                }>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    {form.mode === 'document' ? (
                                        <button
                                            type="button"
                                            className="k-link-field__target"
                                            aria-label={form.ref === undefined ? 'Choose a page' : 'Change the page'}
                                            onClick={() => setPicking(true)}>
                                            {target !== undefined ? (
                                                <LinkTargetRow target={target} />
                                            ) : form.ref !== undefined ? (
                                                <span className="k-ellipsis">
                                                    {editing?.to.type === 'document' && editing.to.ref === form.ref
                                                        ? editing.to.label
                                                        : form.ref}
                                                </span>
                                            ) : (
                                                <span className="k-link-field__empty">Choose a page</span>
                                            )}
                                        </button>
                                    ) : (
                                        <input
                                            className="k-input"
                                            aria-label={form.mode === 'path' ? 'Path' : 'URL'}
                                            placeholder={form.mode === 'path' ? '/new-address' : 'https://'}
                                            value={form.mode === 'path' ? form.path : form.url}
                                            onChange={(event) =>
                                                change(
                                                    form.mode === 'path'
                                                        ? {
                                                              path: event.target.value,
                                                          }
                                                        : {
                                                              url: event.target.value,
                                                          }
                                                )
                                            }
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="k-field">
                            <span className="k-field__label" id={`${statusId}-label`}>
                                Status
                            </span>
                            {locked ? (
                                <LockedValue id={`${statusId}-label`} text={statusLabelOf(form.status)} reason={reason} />
                            ) : (
                                <div
                                    className="k-segmented k-redirect-dialog__status"
                                    role="radiogroup"
                                    aria-labelledby={`${statusId}-label`}>
                                    {STATUSES.map((status) => (
                                        <button
                                            key={status}
                                            type="button"
                                            role="radio"
                                            className="k-tab"
                                            aria-checked={form.status === status}
                                            onClick={() =>
                                                change({
                                                    status,
                                                })
                                            }>
                                            {statusLabelOf(status)}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        {problem === undefined ? null : (
                            <p className="k-error" role="alert">
                                <CircleAlert {...ICON} />
                                {problem}
                            </p>
                        )}
                        <div className="k-dialog__actions">
                            {editing === null || editing === undefined ? null : (
                                <button
                                    type="button"
                                    className="k-button k-button--secondary k-redirect-dialog__delete"
                                    onClick={() => onDelete(editing)}>
                                    Delete
                                </button>
                            )}
                            <Dialog.Close className="k-button k-button--secondary">{locked ? 'Close' : 'Cancel'}</Dialog.Close>
                            {locked ? null : (
                                <button type="submit" className="k-button k-button--primary" disabled={busy || body === undefined}>
                                    {busy ? 'Saving' : 'Save'}
                                </button>
                            )}
                        </div>
                    </form>
                    <LinkTargetSheet
                        open={picking}
                        onOpenChange={setPicking}
                        onPick={(picked) =>
                            change({
                                ref: picked.ref,
                            })
                        }
                    />
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

/**
 * A site's redirects, by the address they start at: where each goes, its
 * status and who made it. A row opens it to change or delete, and a redirect
 * a rename made opens locked.
 */
export function RedirectsScreen({
    connection,
    site,
}: {
    connection: Connection;
    /**
     * The site whose redirects to list, or `undefined` for a CMS of one site.
     */
    site: string | undefined;
}) {
    const toasts = Toast.useToastManager();
    const [redirects, setRedirects] = useState<RedirectView[] | undefined>();
    const [editing, setEditing] = useState<RedirectView | null | undefined>();
    const [deleting, setDeleting] = useState<RedirectView | undefined>();

    const load = useCallback(async (): Promise<void> => {
        const call = redirectCallOf(site, 'list');
        const answer = await connection.call<{ redirects: RedirectView[] }>(call.name, call.input);
        setRedirects(answer.status === 200 ? answer.body.redirects : []);
    }, [connection, site]);

    useEffect(() => {
        void load();
    }, [load]);

    const remove = async (redirect: RedirectView): Promise<void> => {
        setDeleting(undefined);
        setEditing(undefined);
        const call = redirectCallOf(site, 'delete', {
            id: redirect.id,
        });
        // The person confirmed in the dialog, so the route runs without asking again.
        const answer = await connection.call(call.name, call.input, {
            approved: true,
        });
        toasts.add({
            description: answer.status < 300 ? `Deleted the redirect from ${redirect.from}.` : problemOf(answer, 'It was not deleted'),
        });
        await load();
    };

    return (
        <>
            <PageHeader
                title="Redirects"
                meta={
                    redirects === undefined
                        ? undefined
                        : [
                              {
                                  label: 'Redirects',
                                  value: redirects.length,
                              },
                          ]
                }
                actions={
                    <button type="button" className="k-button k-button--primary k-button--small" onClick={() => setEditing(null)}>
                        Add redirect
                    </button>
                }
            />
            <div className="k-admin__body k-redirects">
                {redirects === undefined ? null : redirects.length === 0 ? (
                    <div className="k-list-results__empty">
                        <h2 className="k-list-results__empty-title">No redirects</h2>
                    </div>
                ) : (
                    <div className="k-redirects__rows" role="table" aria-label="Redirects">
                        <div className="k-redirects__row k-redirects__row--head" role="row">
                            <span role="columnheader">From</span>
                            <span role="columnheader">To</span>
                            <span role="columnheader">Status</span>
                            <span role="columnheader">Made by</span>
                            <span role="columnheader" aria-label="Actions" />
                        </div>
                        {redirects.map((redirect) => {
                            const destination = destinationOf(redirect.to);
                            const madeBy = madeByOf(redirect);
                            return (
                                <div key={redirect.id} className="k-redirects__row" role="row">
                                    <span className="k-redirects__from" role="cell">
                                        <button type="button" className="k-redirects__open" onClick={() => setEditing(redirect)}>
                                            <span className="k-ellipsis">{redirect.from}</span>
                                        </button>
                                        {redirect.origin === 'rename' ? <Lock size={13} strokeWidth={1.75} aria-label="Read only" /> : null}
                                    </span>
                                    <span className="k-redirects__to" role="cell">
                                        <span className="k-ellipsis">{destination.title}</span>
                                        {destination.detail === undefined ? null : (
                                            <span className="k-redirects__detail k-ellipsis">{destination.detail}</span>
                                        )}
                                    </span>
                                    <span className="k-redirects__status" role="cell">
                                        {statusLabelOf(redirect.status)}
                                    </span>
                                    <span className="k-redirects__by" role="cell">
                                        {'person' in madeBy ? (
                                            <>
                                                <Avatar person={madeBy.person} size={20} />
                                                <span className="k-ellipsis">{madeBy.person.name}</span>
                                            </>
                                        ) : (
                                            <span className="k-ellipsis">{madeBy.text}</span>
                                        )}
                                    </span>
                                    <span className="k-redirects__actions" role="cell">
                                        <button
                                            type="button"
                                            className="k-button k-button--secondary k-button--small"
                                            onClick={() => setDeleting(redirect)}>
                                            Delete
                                        </button>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            <RedirectDialog
                connection={connection}
                site={site}
                editing={deleting === undefined ? editing : undefined}
                onClose={() => setEditing(undefined)}
                onSaved={(saved) => {
                    setEditing(undefined);
                    toasts.add({
                        description: `Saved the redirect from ${saved.from}.`,
                    });
                    void load();
                }}
                onDelete={setDeleting}
            />
            <ConfirmDialog
                confirming={
                    deleting === undefined
                        ? undefined
                        : {
                              label: 'Delete',
                              question: deleteRedirectQuestionOf(deleting),
                          }
                }
                onConfirm={() => {
                    if (deleting !== undefined) void remove(deleting);
                }}
                onCancel={() => setDeleting(undefined)}
            />
        </>
    );
}

/**
 * The old addresses that redirect to a document, under its Info, each
 * removable with Undo: a site's own when it has several, and the CMS's with
 * one.
 */
export function OldAddresses({ connection, refValue, site }: { connection: Connection; refValue: string; site: string | undefined }) {
    const { offerUndo } = useEditorContext();
    const toasts = Toast.useToastManager();
    const [redirects, setRedirects] = useState<RedirectView[] | undefined>();

    const load = useCallback(async (): Promise<void> => {
        const call = redirectCallOf(site, 'list', {
            query: {
                to: refValue,
            },
        });
        const answer = await connection.call<{ redirects: RedirectView[] }>(call.name, call.input);
        setRedirects(answer.status === 200 ? answer.body.redirects : []);
    }, [connection, refValue, site]);

    useEffect(() => {
        void load();
    }, [load]);

    const remove = async (redirect: RedirectView): Promise<void> => {
        const call = redirectCallOf(site, 'delete', {
            id: redirect.id,
        });
        const answer = await connection.call(call.name, call.input, {
            approved: true,
        });
        await load();
        if (answer.status >= 300) {
            toasts.add({
                description: problemOf(answer, 'It was not removed'),
            });
            return;
        }
        offerUndo?.(`Removed ${redirect.from}.`, () => {
            const again = redirectCallOf(site, 'create', {
                body: recreateBodyOf(redirect),
            });
            void connection.call(again.name, again.input).then(async (answered) => {
                if (answered.status >= 300) {
                    toasts.add({
                        description: problemOf(answered, 'It was not brought back'),
                    });
                }
                await load();
            });
        });
    };

    if (redirects === undefined || redirects.length === 0) return null;
    return (
        <div className="k-linked-from">
            <p className="k-linked-from__title">Old addresses</p>
            <ul className="k-linked-from__list">
                {redirects.map((redirect) => (
                    <li key={redirect.id} className="k-old-address">
                        <span className="k-ellipsis">{redirect.from}</span>
                        <button
                            type="button"
                            className="k-icon-button k-old-address__remove"
                            aria-label={`Remove ${redirect.from}`}
                            onClick={() => void remove(redirect)}>
                            <X {...ICON} />
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
