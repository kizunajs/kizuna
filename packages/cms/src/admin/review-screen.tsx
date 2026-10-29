import { useId, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { ExternalLink } from 'lucide-react';
import { ICON } from '../view/context.js';
import type { ChangeView } from '../view/change-value.js';
import { Avatar, Avatars } from '../view/people.js';
import type { DraftChange } from '../view/review.js';
import type { DescribedField, DescribedLayout, PersonView, ReviewState } from '../view/schema.js';
import { DiffSections, type DiffEntry } from './diff.js';
import { savedAtOf } from './history.js';
import { Loading } from './parts.js';
import { changeQuestionOf, draftOwnerOf, sendBackLabelOf, verdictsOf } from './review-state.js';
import { sectionLabelOf, sectionTitleOf, sectionsOf, sentenceOf } from './sections.js';
import { relativeTimeOf } from './time.js';

/**
 * A change the draft makes, with how it reads.
 */
export type ViewedChange = DraftChange & {
    view: ChangeView;
};

/**
 * A fact in the header that names people, their faces before their names,
 * as the Owner fact shows its owner: "Waiting for review by", the faces, then
 * "Kari Nordmann and Ola Berg".
 */
export function PeopleFact({ lead, people }: { lead: string; people: readonly PersonView[] }) {
    return (
        <span className="k-fact-people">
            {lead}
            {people.length === 0 ? null : (
                <>
                    {people.length === 1 ? <Avatar person={people[0]!} /> : <Avatars people={people} />}
                    <span>{sentenceOf(people.map((person) => person.name))}</span>
                </>
            )}
        </span>
    );
}

/**
 * One note on a review, on a card: who wrote it and when, and what they
 * said.
 */
export function ReviewCard({
    person,
    title,
    at,
    text,
    now,
}: {
    person: PersonView;
    title: string;
    at: string | null;
    text: string;
    now: Date;
}) {
    return (
        <div className="k-review-card">
            <div className="k-review-card__head">
                <Avatar person={person} size={24} />
                <span className="k-review-card__title">{title}</span>
                {at === null ? null : <span className="k-review-card__when">{relativeTimeOf(at, now)}</span>}
            </div>
            <p className="k-review-card__text">{text}</p>
        </div>
    );
}

/**
 * What the reviewer said when they answered, as its card's title says it.
 */
const decisionTitleOf = (review: ReviewState, me: string | undefined): string | undefined => {
    if (review.decidedBy === null || review.status === 'open') return undefined;
    const who = review.decidedBy.id === me ? 'You' : review.decidedBy.name;
    return review.status === 'changes' ? `${who} asked for changes` : `${who} approved`;
};

/**
 * The reviewer's answer on a card, when it came with a note.
 */
export function DecisionCard({ review, me, now }: { review: ReviewState; me: string | undefined; now: Date }) {
    const title = decisionTitleOf(review, me);
    if (title === undefined || review.decidedBy === null || review.decisionNote === null) return null;
    return <ReviewCard person={review.decidedBy} title={title} at={review.decidedAt} text={review.decisionNote} now={now} />;
}

/**
 * The changes the draft makes, as the Review tab lists them: by the tab of
 * the form they sit in.
 */
export const reviewSectionsOf = (changes: readonly ViewedChange[], fields: readonly DescribedField[], layout: readonly DescribedLayout[]) =>
    sectionsOf(
        changes.map(
            (change): DiffEntry => ({
                key: change.path,
                label: sectionLabelOf(fields, layout, change.path, change.label),
                view: change.view,
            })
        ),
        (entry) => sectionTitleOf(fields, layout, entry.key)
    );

/**
 * The Review tab: each change beside what is live now, grouped by section,
 * and beside them the request, the answer, who was asked, and when the draft
 * was saved and the page went live.
 */
export function ReviewScreen({
    review,
    changes,
    fields,
    layout,
    me,
    now,
    savedAt,
    liveSince,
    onOpenOnSite,
}: {
    review: ReviewState;
    changes: readonly ViewedChange[] | undefined;
    fields: readonly DescribedField[];
    layout: readonly DescribedLayout[];
    me: string | undefined;
    now: Date;
    savedAt: string | null;
    liveSince: string | null;
    onOpenOnSite: (() => void) | undefined;
}) {
    const sections = changes === undefined ? [] : reviewSectionsOf(changes, fields, layout);
    const titles = sections.map((section) => section.title).filter((title) => title !== '');
    const count = changes?.length ?? 0;
    return (
        <div className="k-review-screen">
            <section className="k-review-screen__changes" aria-label="Changes">
                {changes === undefined ? (
                    <Loading />
                ) : changes.length === 0 ? (
                    <p className="k-help">The draft holds what is live now.</p>
                ) : (
                    <DiffSections sections={sections} layout="side" beforeLabel="Live now" afterLabel={draftOwnerOf(review, me)} />
                )}
            </section>
            <aside className="k-review-screen__aside" aria-label="Review">
                <div className="k-review-screen__block">
                    <span className="k-review-screen__heading">Request</span>
                    <ReviewCard
                        person={review.requestedBy}
                        title={review.requestedBy.id === me ? 'You' : review.requestedBy.name}
                        at={review.createdAt}
                        text={review.note ?? 'No note.'}
                        now={now}
                    />
                </div>
                <DecisionCard review={review} me={me} now={now} />
                <div className="k-review-screen__block" role="group" aria-label="Reviewers">
                    <span className="k-review-screen__heading">Reviewers</span>
                    {verdictsOf(review, me).map((entry) => (
                        <div key={entry.person.id} className="k-review-screen__reviewer">
                            <Avatar person={entry.person} size={26} />
                            <span className="k-review-screen__name">
                                {entry.person.name}
                                {entry.you ? ' (you)' : ''}
                            </span>
                            <span className="k-review-screen__verdict">{entry.verdict}</span>
                        </div>
                    ))}
                </div>
                <dl className="k-review-screen__facts">
                    {changes === undefined ? null : (
                        <>
                            <dt>Changed</dt>
                            <dd>
                                {count === 0 ? 'Nothing' : count === 1 ? '1 field' : `${count} fields`}
                                {titles.length === 0 ? '' : ` in ${sentenceOf(titles)}`}
                            </dd>
                        </>
                    )}
                    {savedAt === null ? null : (
                        <>
                            <dt>Draft saved</dt>
                            <dd>{savedAtOf(savedAt, now)}</dd>
                        </>
                    )}
                    {liveSince === null ? null : (
                        <>
                            <dt>Live since</dt>
                            <dd>{savedAtOf(liveSince, now)}</dd>
                        </>
                    )}
                </dl>
                {onOpenOnSite === undefined ? null : (
                    <button type="button" className="k-button k-button--secondary k-review-screen__open" onClick={onOpenOnSite}>
                        <ExternalLink {...ICON} />
                        Open the draft on the site
                    </button>
                )}
            </aside>
        </div>
    );
}

/**
 * Request changes, beside Approve: a note for the person who asked, sent
 * back with the draft.
 */
export function RequestChanges({
    review,
    busy,
    onSend,
}: {
    review: ReviewState;
    busy: boolean;
    onSend: (note: string) => Promise<boolean>;
}) {
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState('');
    const noteId = useId();
    return (
        <Popover.Root
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) setNote('');
            }}>
            <Popover.Trigger className="k-button k-button--secondary" disabled={busy}>
                Request changes
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Positioner sideOffset={8} align="end" className="k-positioner">
                    <Popover.Popup className="k-popup k-send-back" aria-labelledby={`${noteId}-label`}>
                        <label id={`${noteId}-label`} htmlFor={noteId} className="k-send-back__label">
                            {changeQuestionOf(review)}
                        </label>
                        <textarea
                            id={noteId}
                            className="k-input k-textarea"
                            rows={4}
                            maxLength={2000}
                            autoFocus
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                        />
                        <div className="k-send-back__actions">
                            <Popover.Close className="k-button k-button--secondary">Cancel</Popover.Close>
                            <button
                                type="button"
                                className="k-button k-button--primary"
                                disabled={busy || note.trim() === ''}
                                onClick={() =>
                                    void onSend(note.trim()).then((sent) => {
                                        if (sent) setOpen(false);
                                    })
                                }>
                                {busy ? 'Sending' : sendBackLabelOf(review)}
                            </button>
                        </div>
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}
