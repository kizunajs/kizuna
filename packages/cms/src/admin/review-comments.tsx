import { useState } from 'react';
import { CircleAlert, MessageCircle } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { Avatar } from '../view/people.js';
import type { PersonView, CommentView, ReviewState } from '../view/schema.js';
import { problemOf } from './parts.js';
import { commenterOf, commentsOn, takesPart } from './review-state.js';
import { relativeTimeOf } from './time.js';

/**
 * Comment, beside a change on the Changes tab, which opens the composer
 * under it.
 */
export function CommentButton({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
    return (
        <button type="button" className="k-comment-toggle" aria-expanded={open} aria-label={`Comment on ${label}`} onClick={onToggle}>
            <MessageCircle {...ICON} />
            Comment
        </button>
    );
}

function CommentLine({
    comment,
    me,
    now,
    onResolve,
    onReply,
    busy,
}: {
    comment: CommentView;
    me: string | undefined;
    now: Date;
    onResolve: (() => void) | undefined;
    onReply: (() => void) | undefined;
    busy: boolean;
}) {
    return (
        <div className="k-comment" data-resolved={comment.resolvedAt !== null || undefined}>
            <Avatar person={comment.by} size={22} />
            <span className="k-comment__head">
                <span className="k-comment__who">{commenterOf(comment, me)}</span>
                <span className="k-comment__when">{relativeTimeOf(comment.createdAt, now)}</span>
            </span>
            <p className="k-comment__text">{comment.text}</p>
            {comment.resolvedBy !== null ? (
                <p className="k-comment__resolved">Resolved by {comment.resolvedBy.id === me ? 'you' : comment.resolvedBy.name}</p>
            ) : onResolve === undefined && onReply === undefined ? null : (
                <div className="k-comment__actions">
                    {onResolve === undefined ? null : (
                        <button type="button" className="k-text-button" disabled={busy} onClick={onResolve}>
                            Resolve
                        </button>
                    )}
                    {onReply === undefined ? null : (
                        <button type="button" className="k-text-button" onClick={onReply}>
                            Reply
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * The comments on one field of a review's draft, under that field: the open
 * ones with Resolve and Reply, the resolved ones folded behind a count, and
 * the composer when it is open. Enter adds the comment and Escape closes it.
 */
export function FieldComments({
    review,
    path,
    label,
    me,
    now,
    connection,
    composing,
    onComposingChange,
    onChanged,
}: {
    review: ReviewState;
    path: string;
    label: string;
    me: string | undefined;
    now: Date;
    connection: Connection;
    composing: boolean;
    onComposingChange: (composing: boolean) => void;
    /**
     * Called with the review as it stands after a comment or a resolve.
     */
    onChanged: (review: ReviewState) => void;
}) {
    const { open, resolved } = commentsOn(review, path);
    const [showResolved, setShowResolved] = useState(false);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | undefined>();
    const mayComment = takesPart(review, me);
    const self: PersonView | undefined = [review.requestedBy, review.decidedBy, ...review.reviewers].find(
        (person): person is PersonView => person !== null && person.id === me
    );

    if (open.length === 0 && resolved.length === 0 && !composing) return null;

    const send = async (): Promise<void> => {
        if (text.trim() === '') return;
        setBusy(true);
        setProblem(undefined);
        const answer = await connection.call<ReviewState>('editing_reviews_comment', {
            body: {
                review: review.id,
                path,
                text: text.trim(),
            },
        });
        setBusy(false);
        if (answer.status !== 201) {
            setProblem(problemOf(answer, 'The comment was not added'));
            return;
        }
        setText('');
        onComposingChange(false);
        onChanged(answer.body);
    };

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
        onChanged(answer.body);
    };

    return (
        <div className="k-comments" role="group" aria-label={`Comments on ${label}`}>
            {open.map((comment, index) => (
                <CommentLine
                    key={comment.id}
                    comment={comment}
                    me={me}
                    now={now}
                    busy={busy}
                    onResolve={mayComment ? () => void resolve(comment.id) : undefined}
                    onReply={mayComment && !composing && index === open.length - 1 ? () => onComposingChange(true) : undefined}
                />
            ))}
            {resolved.length === 0 ? null : (
                <button type="button" className="k-text-button" aria-expanded={showResolved} onClick={() => setShowResolved(!showResolved)}>
                    {resolved.length === 1 ? '1 resolved comment' : `${resolved.length} resolved comments`}
                </button>
            )}
            {showResolved
                ? resolved.map((comment) => (
                      <CommentLine
                          key={comment.id}
                          comment={comment}
                          me={me}
                          now={now}
                          busy={busy}
                          onResolve={undefined}
                          onReply={undefined}
                      />
                  ))
                : null}
            {composing && mayComment ? (
                <div className="k-comment-composer">
                    {self === undefined ? <span className="k-comment-composer__space" /> : <Avatar person={self} size={22} />}
                    <textarea
                        className="k-input k-textarea k-comment-composer__input"
                        rows={1}
                        maxLength={2000}
                        autoFocus
                        aria-label={`Comment on ${label}`}
                        placeholder={`Comment on ${label}`}
                        disabled={busy}
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                void send();
                            }
                            if (event.key === 'Escape') {
                                setText('');
                                onComposingChange(false);
                            }
                        }}
                    />
                </div>
            ) : null}
            {problem === undefined ? null : (
                <p className="k-error" role="alert">
                    <CircleAlert {...ICON} />
                    {problem}
                </p>
            )}
        </div>
    );
}
