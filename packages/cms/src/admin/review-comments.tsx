import { useId, useState } from 'react';
import { CircleAlert, MessageCircle } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { Avatar } from '../view/people.js';
import type { ReviewComment, ReviewState } from '../view/schema.js';
import { problemOf } from './parts.js';
import { commentHintOf, commentsOn, commentTitleOf, takesPart } from './review-state.js';
import { relativeTimeOf } from './time.js';

/**
 * Comment, beside a change on the Review tab, which opens the composer
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

function CommentCard({
    comment,
    label,
    me,
    now,
    onResolve,
    onReply,
    busy,
}: {
    comment: ReviewComment;
    label: string;
    me: string | undefined;
    now: Date;
    onResolve: (() => void) | undefined;
    onReply: (() => void) | undefined;
    busy: boolean;
}) {
    return (
        <div className="k-comment" data-resolved={comment.resolvedAt !== null || undefined}>
            <div className="k-review-card__head">
                <Avatar person={comment.by} size={22} />
                <span className="k-review-card__title">{commentTitleOf(comment, label, me)}</span>
                <span className="k-review-card__when">{relativeTimeOf(comment.createdAt, now)}</span>
            </div>
            <p className="k-review-card__text">{comment.text}</p>
            {comment.resolvedBy !== null ? (
                <p className="k-comment__resolved">Resolved by {comment.resolvedBy.id === me ? 'you' : comment.resolvedBy.name}</p>
            ) : onResolve === undefined && onReply === undefined ? null : (
                <div className="k-comment__actions">
                    {onResolve === undefined ? null : (
                        <button type="button" className="k-button k-button--secondary k-button--small" disabled={busy} onClick={onResolve}>
                            Resolve
                        </button>
                    )}
                    {onReply === undefined ? null : (
                        <button type="button" className="k-comment-toggle" onClick={onReply}>
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
 * ones with Resolve, the resolved ones folded behind a count, and the
 * composer when it is open.
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
    const textId = useId();
    const mayComment = takesPart(review, me);

    if (open.length === 0 && resolved.length === 0 && !composing) return null;

    const send = async (): Promise<void> => {
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
                <CommentCard
                    key={comment.id}
                    comment={comment}
                    label={label}
                    me={me}
                    now={now}
                    busy={busy}
                    onResolve={mayComment ? () => void resolve(comment.id) : undefined}
                    onReply={mayComment && !composing && index === open.length - 1 ? () => onComposingChange(true) : undefined}
                />
            ))}
            {resolved.length === 0 ? null : (
                <button
                    type="button"
                    className="k-comment-toggle"
                    aria-expanded={showResolved}
                    onClick={() => setShowResolved(!showResolved)}>
                    {resolved.length === 1 ? '1 resolved comment' : `${resolved.length} resolved comments`}
                </button>
            )}
            {showResolved
                ? resolved.map((comment) => (
                      <CommentCard
                          key={comment.id}
                          comment={comment}
                          label={label}
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
                    <label htmlFor={textId} className="k-comment-composer__label">
                        Comment on {label}
                    </label>
                    <textarea
                        id={textId}
                        className="k-input k-textarea"
                        rows={2}
                        maxLength={2000}
                        autoFocus
                        placeholder={commentHintOf(review, me)}
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                    />
                    <div className="k-comment-composer__actions">
                        <button
                            type="button"
                            className="k-button k-button--secondary k-button--small"
                            onClick={() => {
                                setText('');
                                onComposingChange(false);
                            }}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="k-button k-button--primary k-button--small"
                            disabled={busy || text.trim() === ''}
                            onClick={() => void send()}>
                            {busy ? 'Adding' : 'Add comment'}
                        </button>
                    </div>
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

/**
 * The open comments in the sidebar, each a link to the field it is about,
 * for a field that sits in a tab the person is not looking at.
 */
export function CommentLinks({
    review,
    labelOf,
    me,
    now,
    onShow,
}: {
    review: ReviewState;
    labelOf: (path: string) => string;
    me: string | undefined;
    now: Date;
    onShow: (path: string) => void;
}) {
    const open = review.comments.filter((comment) => comment.resolvedAt === null);
    if (open.length === 0) return null;
    return (
        <div className="k-review-screen__block" role="group" aria-label="Comments">
            <span className="k-review-screen__heading">{open.length === 1 ? '1 comment' : `${open.length} comments`}</span>
            {open.map((comment) => (
                <button key={comment.id} type="button" className="k-comment k-comment--link" onClick={() => onShow(comment.path)}>
                    <span className="k-review-card__head">
                        <Avatar person={comment.by} size={22} />
                        <span className="k-review-card__title">{commentTitleOf(comment, labelOf(comment.path), me)}</span>
                        <span className="k-review-card__when">{relativeTimeOf(comment.createdAt, now)}</span>
                    </span>
                    <span className="k-review-card__text">{comment.text}</span>
                </button>
            ))}
        </div>
    );
}
