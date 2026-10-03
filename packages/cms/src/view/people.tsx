import { useEffect, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Check, UserRound } from 'lucide-react';
import type { Connection } from './connection.js';
import { ICON } from './context.js';
import type { PersonView, ReviewState } from './schema.js';

export interface People {
    me: string;
    people: PersonView[];
}

/**
 * Everyone who edits, and which of them is using the editor, loaded once.
 */
export const usePeople = (connection: Connection): People | undefined => {
    const [people, setPeople] = useState<People | undefined>();
    useEffect(() => {
        void connection.call<People>('editing_people_list').then((answer) => {
            if (answer.status === 200) setPeople(answer.body);
        });
    }, [connection]);
    return people;
};

const initials = (name: string): string =>
    name
        .split(/\s+/)
        .filter((part) => part !== '')
        .slice(0, 2)
        .map((part) => part[0]!.toUpperCase())
        .join('');

export function Avatar({ person, size = 22 }: { person: PersonView; size?: number }) {
    const [broken, setBroken] = useState(false);
    return (
        <span
            className="k-avatar"
            title={person.name}
            style={{
                width: size,
                height: size,
                fontSize: Math.round(size * 0.42),
            }}>
            {person.image !== undefined && !broken ? (
                <img src={person.image} alt="" onError={() => setBroken(true)} />
            ) : (
                initials(person.name)
            )}
        </span>
    );
}

export function Avatars({ people, size = 22 }: { people: readonly PersonView[]; size?: number }) {
    return (
        <span className="k-avatars">
            {people.map((person) => (
                <Avatar key={person.id} person={person} size={size} />
            ))}
        </span>
    );
}

const names = (people: readonly PersonView[]): string =>
    people.length <= 2 ? people.map((person) => person.name.split(' ')[0]).join(' and ') : `${people.length} people`;

/**
 * Where a review stands, in a few words with the faces of who it waits for or
 * who answered.
 */
export function ReviewBadge({ review, me }: { review: ReviewState; me: string | undefined }) {
    const waitingForMe = review.status === 'open' && review.reviewers.some((reviewer) => reviewer.id === me);
    const text =
        review.status === 'open'
            ? waitingForMe
                ? `${review.requestedBy.name.split(' ')[0]} asked you to review`
                : `Waiting for ${names(review.reviewers)}`
            : review.status === 'approved'
              ? `Approved by ${review.decidedBy?.name.split(' ')[0] ?? 'a reviewer'}`
              : review.status === 'changes'
                ? `Changes requested`
                : 'Approval outdated';
    const faces =
        review.status === 'open'
            ? waitingForMe
                ? [review.requestedBy]
                : review.reviewers
            : review.decidedBy === null
              ? []
              : [review.decidedBy];
    return (
        <span className="k-review-badge" data-status={review.status} title={review.decisionNote ?? review.note ?? undefined}>
            <Avatars people={faces} size={18} />
            {text}
        </span>
    );
}

/**
 * Everyone who edits as a list to tick, the owner first.
 */
export function PeoplePicker({
    people,
    selected,
    onToggle,
    owner,
    exclude,
}: {
    people: readonly PersonView[];
    selected: ReadonlySet<string>;
    onToggle: (id: string) => void;
    owner?: string | null;
    exclude?: string;
}) {
    const listed = people
        .filter((person) => person.id !== exclude)
        .sort((left, right) => Number(right.id === owner) - Number(left.id === owner));
    if (listed.length === 0) return <p className="k-help">Nobody else edits here yet.</p>;
    return (
        <div className="k-people" role="group">
            {listed.map((person) => (
                <button
                    key={person.id}
                    type="button"
                    className="k-person"
                    aria-pressed={selected.has(person.id)}
                    onClick={() => onToggle(person.id)}>
                    <Avatar person={person} size={28} />
                    <span className="k-person-name">{person.name}</span>
                    {person.id === owner ? <span className="k-review-tag">Owner</span> : null}
                    <span className="k-person-check">{selected.has(person.id) ? <Check {...ICON} /> : null}</span>
                </button>
            ))}
        </div>
    );
}

/**
 * Who looks after the document: their face and name, and a dialog to pick
 * someone else.
 */
export function OwnerControl({
    owner,
    people,
    title,
    onChange,
}: {
    owner: PersonView | null;
    people: People | undefined;
    title: string;
    onChange: (owner: string | null) => Promise<void>;
}) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const pick = async (id: string | null): Promise<void> => {
        setBusy(true);
        await onChange(id);
        setBusy(false);
        setOpen(false);
    };
    if (people === undefined || people.people.length === 0) return null;
    return (
        <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger className="k-owner" aria-label={owner === null ? 'Name an owner' : `Owner: ${owner.name}`}>
                {owner === null ? (
                    <span className="k-avatar k-avatar-empty">
                        <UserRound {...ICON} />
                    </span>
                ) : (
                    <Avatar person={owner} />
                )}
                <span className="k-owner-name">{owner === null ? 'No owner' : owner.name.split(' ')[0]}</span>
            </Dialog.Trigger>
            <Dialog.Portal>
                <Dialog.Backdrop className="k-backdrop" />
                <Dialog.Popup className="k-dialog">
                    <Dialog.Title className="k-dialog-title">Who looks after {title}?</Dialog.Title>
                    <Dialog.Description className="k-help">They are suggested first when someone asks for a review.</Dialog.Description>
                    <PeoplePicker
                        people={people.people}
                        selected={new Set(owner === null ? [] : [owner.id])}
                        onToggle={(id) => void pick(id === owner?.id ? null : id)}
                    />
                    <div className="k-dialog-actions">
                        {owner !== null ? (
                            <button type="button" className="k-button k-button-secondary" disabled={busy} onClick={() => void pick(null)}>
                                Remove owner
                            </button>
                        ) : null}
                        <Dialog.Close className="k-button k-button-secondary">Done</Dialog.Close>
                    </div>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
