import { useId, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { ChevronDown, CircleAlert, Lock } from 'lucide-react';
import { creditOf } from '../credit.js';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { showValue, type ChangeView } from '../view/change-value.js';
import { Avatar } from '../view/people.js';
import { shapeOfField, type DraftChange } from '../view/review.js';
import { valueAt, type DescribedField, type DescribedLayout, type PersonView, type CommentView, type ReviewState } from '../view/schema.js';
import { ShownValue, SideOf } from './diff.js';
import { Loading, problemOf } from './parts.js';
import { CommentButton, FieldComments } from './review-comments.js';
import { changeQuestionOf, sendBackLabelOf, takesPart, unchangedLineOf } from './review-state.js';
import { sectionLabelOf } from './sections.js';
import { relativeTimeOf } from './time.js';

/**
 * A change the draft makes, with how it reads.
 */
export type ViewedChange = DraftChange & {
    view: ChangeView;
};

/**
 * A note on a review in plain type: who wrote it, what they did and when,
 * and what they said under it.
 */
export function ReviewNote({
    person,
    action,
    at,
    text,
    now,
    via = null,
    children,
}: {
    person: PersonView;
    /**
     * What they did, after their name: "asked", "sent it back".
     */
    action: string;
    at: string | null;
    text: string | null;
    now: Date;
    /**
     * The agent that did it for them, like `Claude`.
     */
    via?: string | null;
    children?: React.ReactNode;
}) {
    return (
        <div className="k-review-note">
            <Avatar person={person} size={26} />
            <span className="k-review-note__head">
                <span className="k-review-note__who">{creditOf(person.name, via)}</span>
                <span className="k-review-note__when">
                    {action}
                    {at === null ? '' : ` ${relativeTimeOf(at, now)}`}
                </span>
            </span>
            {text === null ? null : <p className="k-review-note__text">{text}</p>}
            {children}
        </div>
    );
}

/**
 * One changed field as a locked field: what is live over what the draft
 * holds, the words it lost struck and the words it gained marked.
 */
function ChangedValue({ view }: { view: ChangeView }) {
    return (
        <div className="k-read-only k-review-change__value k-diff">
            <span className="k-review-change__lead">Live</span>
            <div className="k-review-change__before">
                <SideOf view={view} side="before" />
            </div>
            <span className="k-review-change__lead">Draft</span>
            <div className="k-review-change__after">
                <SideOf view={view} side="after" />
            </div>
            <span className="k-read-only__lock k-review-change__lock" aria-hidden="true">
                <Lock size={13} strokeWidth={1.75} />
            </span>
        </div>
    );
}

/**
 * The fields the draft leaves alone, folded into one line that opens to
 * show each as it reads.
 */
function UnchangedFields({
    fields,
    draft,
    labelOf,
}: {
    fields: readonly DescribedField[];
    draft: Record<string, unknown> | null;
    labelOf: (field: DescribedField) => string;
}) {
    const [open, setOpen] = useState(false);
    if (fields.length === 0) return null;
    return (
        <div className="k-review-change-unchanged">
            <button type="button" className="k-review-change-unchanged__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
                <ChevronDown {...ICON} />
                {unchangedLineOf(fields.map(labelOf))}
            </button>
            {open
                ? fields.map((field) => (
                      <section key={field.path} className="k-review-change" aria-label={labelOf(field)}>
                          <span className="k-review-change__label">{labelOf(field)}</span>
                          <div className="k-read-only k-review-change__value k-diff" data-unchanged>
                              <div className="k-review-change__same">
                                  <ShownValue shown={showValue(valueAt(draft, field.path), shapeOfField(field), () => undefined)} />
                              </div>
                              <span className="k-read-only__lock k-review-change__lock" aria-hidden="true">
                                  <Lock size={13} strokeWidth={1.75} />
                              </span>
                          </div>
                      </section>
                  ))
                : null}
        </div>
    );
}

/**
 * The Changes tab: the note from whoever asked, then each changed field
 * locked, live over draft, with Comment beside its label and its comments
 * under it, and the fields left alone folded into one line.
 */
export function ChangesScreen({
    review,
    changes,
    fields,
    layout,
    draft,
    me,
    now,
    connection,
    onReviewChanged,
}: {
    review: ReviewState;
    changes: readonly ViewedChange[] | undefined;
    fields: readonly DescribedField[];
    layout: readonly DescribedLayout[];
    draft: Record<string, unknown> | null;
    me: string | undefined;
    now: Date;
    connection: Connection;
    onReviewChanged: (review: ReviewState) => void;
}) {
    const [composing, setComposing] = useState<string | undefined>();
    const commenting = takesPart(review, me);
    const labelOfPath = (path: string, fallback: string): string => sectionLabelOf(fields, layout, path, fallback);
    const changed = new Set(changes?.map((change) => change.path) ?? []);
    const unchanged = fields.filter((field) => field.parent === undefined && !changed.has(field.path));
    return (
        <div className="k-review-changes">
            {review.note === null && (review.requestedVia ?? null) === null ? null : (
                <ReviewNote
                    person={review.requestedBy}
                    action="asked"
                    at={review.createdAt}
                    text={review.note}
                    now={now}
                    via={review.requestedVia ?? null}
                />
            )}
            {changes === undefined ? (
                <Loading />
            ) : (
                <>
                    {changes.map((change) => {
                        const label = labelOfPath(change.path, change.label);
                        return (
                            <section key={change.path} className="k-review-change" aria-label={label}>
                                <div className="k-review-change__head">
                                    <span className="k-review-change__label">{label}</span>
                                    {commenting ? (
                                        <CommentButton
                                            label={label}
                                            open={composing === change.path}
                                            onToggle={() => setComposing(composing === change.path ? undefined : change.path)}
                                        />
                                    ) : null}
                                </div>
                                <ChangedValue view={change.view} />
                                <FieldComments
                                    review={review}
                                    path={change.path}
                                    label={label}
                                    me={me}
                                    now={now}
                                    connection={connection}
                                    composing={composing === change.path}
                                    onComposingChange={(next) => setComposing(next ? change.path : undefined)}
                                    onChanged={onReviewChanged}
                                />
                            </section>
                        );
                    })}
                    <UnchangedFields fields={unchanged} draft={draft} labelOf={(field) => labelOfPath(field.path, field.name)} />
                </>
            )}
        </div>
    );
}

/**
 * What the reviewer sent back, once, at the top of the form of the person
 * who asked: their note, then each open comment with the field it is on,
 * which shows that field.
 */
export function SentBackNotes({
    review,
    by,
    at,
    note,
    comments,
    labelOf,
    now,
    connection,
    onShow,
    onReviewChanged,
}: {
    review: ReviewState;
    by: PersonView;
    at: string | null;
    note: string | null;
    comments: readonly CommentView[];
    labelOf: (path: string) => string;
    now: Date;
    connection: Connection;
    onShow: (path: string) => void;
    onReviewChanged: (review: ReviewState) => void;
}) {
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | undefined>();

    const resolve = async (id: string): Promise<void> => {
        setBusy(true);
        setProblem(undefined);
        const answer = await connection.call<ReviewState>('editing_reviews_resolve_comment', {
            params: {
                id,
            },
        });
        setBusy(false);
        if (answer.status !== 200) {
            setProblem(problemOf(answer, 'The comment was not resolved'));
            return;
        }
        onReviewChanged(answer.body);
    };

    return (
        <section className="k-sent-back" aria-label="Sent back">
            <ReviewNote person={by} action="sent it back" at={at} text={note} now={now}>
                {comments.length === 0 ? null : (
                    <ul className="k-sent-back__comments">
                        {comments.map((comment) => (
                            <li key={comment.id} className="k-sent-back__comment">
                                <button type="button" className="k-sent-back__field" onClick={() => onShow(comment.path)}>
                                    {labelOf(comment.path)}
                                </button>
                                <span className="k-sent-back__text">{comment.text}</span>
                                <button
                                    type="button"
                                    className="k-text-button k-sent-back__resolve"
                                    disabled={busy || review.status !== 'changes'}
                                    onClick={() => void resolve(comment.id)}>
                                    Resolve
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </ReviewNote>
            {problem === undefined ? null : (
                <p className="k-error" role="alert">
                    <CircleAlert {...ICON} />
                    {problem}
                </p>
            )}
        </section>
    );
}

/**
 * Send back, beside Approve and publish: a note for the person who asked,
 * sent back with the draft and the comments on its fields.
 */
export function SendBack({ review, busy, onSend }: { review: ReviewState; busy: boolean; onSend: (note: string) => Promise<boolean> }) {
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
                Send back
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
