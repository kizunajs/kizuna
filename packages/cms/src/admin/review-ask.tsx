import { useEffect, useId, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Check, CircleAlert, X } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { Avatar, type People } from '../view/people.js';
import type { PersonView } from '../view/schema.js';
import { problemOf } from './parts.js';

/**
 * Everyone who may review, the owner first, leaving out the person asking.
 */
export const reviewersToOffer = (people: readonly PersonView[], owner: string | null, me: string | undefined): PersonView[] =>
    people.filter((person) => person.id !== me).sort((left, right) => Number(right.id === owner) - Number(left.id === owner));

/**
 * Asks people to review one document's draft: a tick for each person, the
 * owner first and already ticked, and a note shown above the changes. Send
 * request waits until someone is ticked.
 */
export function AskForReview({
    open,
    onOpenChange,
    connection,
    documentRef,
    owner,
    people,
    changeCount,
    onSent,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    connection: Connection;
    documentRef: string;
    owner: PersonView | null;
    people: People | undefined;
    /**
     * How many fields the draft changes, or undefined while they load.
     */
    changeCount: number | undefined;
    onSent: () => void;
}) {
    const me = people?.me;
    const offered = reviewersToOffer(people?.people ?? [], owner?.id ?? null, me);
    const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | undefined>();
    const noteId = useId();
    const labelId = useId();

    useEffect(() => {
        if (!open) return;
        setChosen(new Set(owner === null || owner.id === me ? [] : [owner.id]));
        setNote('');
        setProblem(undefined);
    }, [open, owner?.id, me]);

    const toggle = (id: string): void =>
        setChosen((previous) => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const send = async (): Promise<void> => {
        setBusy(true);
        setProblem(undefined);
        const answer = await connection.call('editing_reviews_request', {
            body: {
                refs: [documentRef],
                reviewers: offered.filter((person) => chosen.has(person.id)).map((person) => person.id),
                ...(note.trim() === ''
                    ? {}
                    : {
                          note: note.trim(),
                      }),
            },
        });
        setBusy(false);
        if (answer.status !== 201) {
            setProblem(problemOf(answer, 'The request was not sent'));
            return;
        }
        onOpenChange(false);
        onSent();
    };

    const fields = changeCount === 1 ? 'changed field' : 'changed fields';
    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Backdrop className="k-backdrop" />
                <Dialog.Popup className="k-dialog k-ask">
                    <div className="k-ask__head">
                        <div className="k-ask__heading">
                            <Dialog.Title className="k-dialog__title">Ask for review</Dialog.Title>
                            <Dialog.Description className="k-dialog__detail k-ask__detail">
                                Reviewers see {changeCount === undefined ? 'your changes' : `your ${changeCount} ${fields}`} side by side
                                with what is live, and approve or ask for changes.
                            </Dialog.Description>
                        </div>
                        <Dialog.Close className="k-icon-button k-dialog__close" aria-label="Close">
                            <X {...ICON} />
                        </Dialog.Close>
                    </div>
                    <div className="k-ask__body">
                        <div className="k-ask__group" role="group" aria-labelledby={labelId}>
                            <span id={labelId} className="k-ask__label">
                                Reviewers
                            </span>
                            {offered.length === 0 ? (
                                <p className="k-help">Nobody else edits here yet.</p>
                            ) : (
                                <div className="k-ask__people">
                                    {offered.map((person) => (
                                        <button
                                            key={person.id}
                                            type="button"
                                            role="checkbox"
                                            aria-checked={chosen.has(person.id)}
                                            className="k-ask__person"
                                            onClick={() => toggle(person.id)}>
                                            <Avatar person={person} size={28} />
                                            <span className="k-ask__who">
                                                <span className="k-ask__name">{person.name}</span>
                                                {person.id === owner?.id ? <span className="k-ask__role">Owner of this page</span> : null}
                                            </span>
                                            <span className="k-ask__box" aria-hidden="true">
                                                {chosen.has(person.id) ? <Check {...ICON} /> : null}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="k-ask__group">
                            <label htmlFor={noteId} className="k-ask__label">
                                Note
                            </label>
                            <textarea
                                id={noteId}
                                className="k-input k-textarea"
                                rows={3}
                                maxLength={2000}
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                            />
                            <p className="k-help">Shown to reviewers above your changes.</p>
                        </div>
                        {problem === undefined ? null : (
                            <p className="k-error" role="alert">
                                <CircleAlert {...ICON} />
                                {problem}
                            </p>
                        )}
                    </div>
                    <div className="k-ask__foot">
                        <span className="k-ask__count">
                            {chosen.size === 0
                                ? 'Pick at least one reviewer'
                                : chosen.size === 1
                                  ? '1 reviewer'
                                  : `${chosen.size} reviewers`}
                        </span>
                        <Dialog.Close className="k-button k-button--secondary">Cancel</Dialog.Close>
                        <button
                            type="button"
                            className="k-button k-button--primary"
                            disabled={chosen.size === 0 || busy}
                            onClick={() => void send()}>
                            {busy ? 'Sending' : 'Send request'}
                        </button>
                    </div>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
