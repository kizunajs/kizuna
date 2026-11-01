import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Menu } from '@base-ui/react/menu';
import { CircleAlert, MessageCircle, UserRound } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { Avatar, type People } from '../view/people.js';
import type { CommentView, PersonView } from '../view/schema.js';
import { parseRef } from '../refs.js';
import {
    caretRectOf,
    copyLayout,
    fieldOfNode,
    markRanges,
    offsetIn,
    rangeOver,
    textNodesOf,
    textTargetOf,
    type TextTarget,
} from './comment-anchors.js';
import {
    marksOf,
    mentionCandidatesOf,
    mentionQueryAt,
    mentionsIn,
    phraseOf,
    threadAt,
    withMention,
    type Thread,
} from './comment-threads.js';
import { problemOf } from './parts.js';
import { commenterOf } from './review-state.js';
import { relativeTimeOf } from './time.js';

/**
 * How often the comments on the open document are read again, for the ones
 * other people leave.
 */
const COMMENTS_POLL_MS = 15_000;

/**
 * The comments on a document's draft, read when it opens, every little
 * while after, and again on `reload`.
 */
export const useComments = (
    connection: Connection,
    ref: string | undefined
): {
    comments: CommentView[];
    reload: () => Promise<void>;
} => {
    const [comments, setComments] = useState<CommentView[]>([]);
    const reload = useCallback(async (): Promise<void> => {
        if (ref === undefined) return;
        const answer = await connection.call<{ comments: CommentView[] }>('editing_comments_list', {
            query: {
                ref,
            },
        });
        if (answer.status === 200) setComments(answer.body.comments);
    }, [connection, ref]);
    useEffect(() => {
        setComments([]);
        void reload();
        const timer = window.setInterval(() => {
            if (window.document.visibilityState === 'visible') void reload();
        }, COMMENTS_POLL_MS);
        return () => window.clearInterval(timer);
    }, [reload]);
    return {
        comments,
        reload,
    };
};

/**
 * The people a comment on a document may mention or name: on a site's
 * document, those who hold the site and the admins over every site; on
 * shared content, everyone the people list offers.
 */
export const peopleWhoOpen = (people: People | undefined, ref: string): People['people'] => {
    const everyone = people?.people ?? [];
    const site = parseRef(ref)?.site;
    if (site === undefined || !everyone.some((person) => person.sites !== undefined)) return everyone;
    return everyone.filter((person) => person.roles?.includes('admin') === true || (person.sites?.[site]?.length ?? 0) > 0);
};

/**
 * The phrases a field's open threads quote, marked in its text with a grey
 * fill and underline, and the thread each opens on a click. An input's
 * marks are drawn on a layer laid over it, and rich text's with the
 * browser's highlights.
 */
export function CommentMarks({
    path,
    threads,
    active,
    onOpen,
}: {
    path: string;
    threads: readonly Thread[];
    active: string | undefined;
    onOpen: (thread: string) => void;
}) {
    const [target, setTarget] = useState<TextTarget | undefined>();
    const latestOpen = useRef(onOpen);
    latestOpen.current = onOpen;
    const anchored = threads.filter((thread) => thread.root.anchor !== null && !thread.root.anchor.changed);
    const key = anchored.map((thread) => `${thread.root.id}:${thread.root.anchor?.text ?? ''}`).join('|');

    // The input or editable mounts with the form, after this, and a field that locks or unlocks swaps one for the other.
    useEffect(() => {
        const found = textTargetOf(path);
        if (found?.element !== target?.element) setTarget(found);
    });

    // Rich text and locked text: the browser's highlights over its text nodes, found again whenever the text changes.
    useEffect(() => {
        if (target?.kind !== 'nodes' || anchored.length === 0) return;
        const element = target.element;
        let frame = 0;
        const draw = (): void => {
            const { text, nodes } = textNodesOf(element);
            const marks = marksOf(anchored, text);
            const ranges = (thread: (id: string) => boolean): Range[] =>
                marks.flatMap((mark) => (thread(mark.thread) ? (rangeOver(nodes, mark.start, mark.end) ?? []) : []));
            markRanges(
                path,
                ranges((id) => id !== active),
                ranges((id) => id === active)
            );
        };
        const observer = new MutationObserver(() => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(draw);
        });
        observer.observe(element, {
            subtree: true,
            childList: true,
            characterData: true,
        });
        draw();
        const click = (): void => {
            const selection = window.getSelection();
            if (selection === null || !selection.isCollapsed || selection.anchorNode === null) return;
            const { text, nodes } = textNodesOf(element);
            const offset = offsetIn(nodes, selection.anchorNode, selection.anchorOffset);
            const thread = offset === undefined ? undefined : threadAt(marksOf(anchored, text), offset);
            if (thread !== undefined) latestOpen.current(thread);
        };
        element.addEventListener('click', click);
        return () => {
            observer.disconnect();
            window.cancelAnimationFrame(frame);
            element.removeEventListener('click', click);
            markRanges(path, [], []);
        };
        // The threads are read through `key`, which changes when their phrases do.
    }, [target, key, active, path]);

    if (target?.kind !== 'value' || anchored.length === 0) return null;
    return <ValueMarks element={target.element} threads={anchored} active={active} onOpen={onOpen} />;
}

/**
 * The marks over an input or a textarea: a copy of its text laid exactly
 * over it, the text itself clear and each phrase filled.
 */
function ValueMarks({
    element,
    threads,
    active,
    onOpen,
}: {
    element: HTMLInputElement | HTMLTextAreaElement;
    threads: readonly Thread[];
    active: string | undefined;
    onOpen: (thread: string) => void;
}) {
    const layer = useRef<HTMLDivElement>(null);
    const [value, setValue] = useState(element.value);
    // A value the form puts in, like a translation, fires no input event.
    useLayoutEffect(() => {
        if (element.value !== value) setValue(element.value);
    });
    const marks = marksOf(threads, value);
    const latest = useRef({
        marks,
        onOpen,
    });
    latest.current = {
        marks,
        onOpen,
    };

    useEffect(() => {
        const typed = (): void => setValue(element.value);
        const scrolled = (): void => {
            if (layer.current === null) return;
            layer.current.scrollTop = element.scrollTop;
            layer.current.scrollLeft = element.scrollLeft;
        };
        const click = (): void => {
            if (element.selectionStart === null || element.selectionStart !== element.selectionEnd) return;
            const thread = threadAt(latest.current.marks, element.selectionStart);
            if (thread !== undefined) latest.current.onOpen(thread);
        };
        element.addEventListener('input', typed);
        element.addEventListener('scroll', scrolled);
        element.addEventListener('click', click);
        return () => {
            element.removeEventListener('input', typed);
            element.removeEventListener('scroll', scrolled);
            element.removeEventListener('click', click);
        };
    }, [element]);

    useLayoutEffect(() => {
        const place = (): void => {
            if (layer.current === null) return;
            copyLayout(element, layer.current);
            layer.current.style.top = `${element.offsetTop}px`;
            layer.current.style.left = `${element.offsetLeft}px`;
            layer.current.scrollTop = element.scrollTop;
            layer.current.scrollLeft = element.scrollLeft;
        };
        place();
        const observer = new ResizeObserver(place);
        observer.observe(element);
        return () => observer.disconnect();
    }, [element, value]);

    const parent = element.parentElement;
    if (parent === null) return null;
    const pieces: ReactNode[] = [];
    let at = 0;
    for (const mark of [...marks].sort((left, right) => left.start - right.start)) {
        if (mark.start < at) continue;
        pieces.push(value.slice(at, mark.start));
        pieces.push(
            <mark key={mark.thread} className="k-comment-mark" data-active={mark.thread === active || undefined}>
                {value.slice(mark.start, mark.end)}
            </mark>
        );
        at = mark.end;
    }
    pieces.push(value.slice(at));
    return createPortal(
        <div ref={layer} className="k-comment-layer" aria-hidden="true">
            {pieces}
        </div>,
        parent
    );
}

/**
 * Comment, beside text the person selects in a field, which starts a
 * thread on that phrase.
 */
export function SelectionComment({
    paths,
    container,
    onComment,
}: {
    paths: readonly string[];
    container: HTMLElement | null;
    onComment: (path: string, phrase: string) => void;
}) {
    const [offer, setOffer] = useState<{ path: string; phrase: string; top: number; left: number } | undefined>();
    const key = paths.join(' ');

    useEffect(() => {
        if (container === null) return;
        const check = (): void => {
            const focused = window.document.activeElement;
            if ((focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) && container.contains(focused)) {
                const start = focused.selectionStart;
                const end = focused.selectionEnd;
                const path = fieldOfNode(focused, paths);
                const phrase = start === null || end === null ? undefined : phraseOf(focused.value.slice(start, end));
                if (path === undefined || phrase === undefined || end === null || textTargetOf(path)?.element !== focused) {
                    setOffer(undefined);
                    return;
                }
                const rect = caretRectOf(focused, end);
                setOffer({
                    path,
                    phrase,
                    top: rect.bottom,
                    left: rect.left,
                });
                return;
            }
            const selection = window.getSelection();
            if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) {
                setOffer(undefined);
                return;
            }
            const range = selection.getRangeAt(0);
            const path = fieldOfNode(range.commonAncestorContainer, paths);
            const target = path === undefined ? undefined : textTargetOf(path);
            const phrase = phraseOf(range.toString());
            if (
                path === undefined ||
                target?.kind !== 'nodes' ||
                !target.element.contains(range.commonAncestorContainer) ||
                phrase === undefined
            ) {
                setOffer(undefined);
                return;
            }
            const rects = range.getClientRects();
            const last = rects[rects.length - 1] ?? range.getBoundingClientRect();
            setOffer({
                path,
                phrase,
                top: last.bottom,
                left: last.right,
            });
        };
        const hide = (): void => setOffer(undefined);
        window.document.addEventListener('selectionchange', check);
        container.addEventListener('mouseup', check);
        container.addEventListener('keyup', check);
        window.addEventListener('scroll', hide, true);
        window.addEventListener('resize', hide);
        return () => {
            window.document.removeEventListener('selectionchange', check);
            container.removeEventListener('mouseup', check);
            container.removeEventListener('keyup', check);
            window.removeEventListener('scroll', hide, true);
            window.removeEventListener('resize', hide);
        };
        // The paths are read through `key`.
    }, [container, key]);

    if (offer === undefined) return null;
    return createPortal(
        <button
            type="button"
            className="k-selection-comment"
            style={{
                top: offer.top + 6,
                left: Math.max(8, Math.min(offer.left, window.innerWidth - 120)),
            }}
            // Keeps the selection, which a click would otherwise clear.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
                onComment(offer.path, offer.phrase);
                setOffer(undefined);
            }}>
            <MessageCircle {...ICON} />
            Comment
        </button>,
        window.document.body
    );
}

/**
 * The box a comment is written in. Typing `@` offers the people who open
 * the document, and picking one mentions them. Enter sends, Shift+Enter
 * starts a new line, and Escape closes it.
 */
function Composer({
    label,
    people,
    me,
    busy,
    assignable,
    onSend,
    onCancel,
}: {
    label: string;
    people: readonly PersonView[];
    me: PersonView | undefined;
    busy: boolean;
    /**
     * Offers Assign, for a comment that starts a thread.
     */
    assignable: boolean;
    onSend: (comment: { text: string; mentions: string[]; assignee: string | null }) => Promise<boolean>;
    onCancel: () => void;
}) {
    const [text, setText] = useState('');
    const [caret, setCaret] = useState(0);
    const [picked, setPicked] = useState<PersonView[]>([]);
    const [assignee, setAssignee] = useState<PersonView | null>(null);
    const [choice, setChoice] = useState(0);
    const [dismissed, setDismissed] = useState(false);
    const input = useRef<HTMLTextAreaElement>(null);
    const query = dismissed ? undefined : mentionQueryAt(text, caret);
    const candidates = query === undefined ? [] : mentionCandidatesOf(people, query, me?.id);

    const mention = (person: PersonView): void => {
        const next = withMention(text, caret, person);
        setText(next.text);
        setCaret(next.caret);
        setPicked((previous) => (previous.some((candidate) => candidate.id === person.id) ? previous : [...previous, person]));
        setChoice(0);
        window.requestAnimationFrame(() => {
            input.current?.setSelectionRange(next.caret, next.caret);
            input.current?.focus();
        });
    };

    const send = async (): Promise<void> => {
        if (text.trim() === '' || busy) return;
        const sent = await onSend({
            text: text.trim(),
            mentions: mentionsIn(text, picked),
            assignee: assignee?.id ?? null,
        });
        if (sent) {
            setText('');
            setPicked([]);
            setAssignee(null);
        }
    };

    return (
        <div className="k-comment-composer k-comment-composer--thread">
            {me === undefined ? <span className="k-comment-composer__space" /> : <Avatar person={me} size={22} />}
            <div className="k-comment-composer__box">
                <textarea
                    ref={input}
                    className="k-input k-textarea k-comment-composer__input"
                    rows={1}
                    maxLength={2000}
                    autoFocus
                    aria-label={label}
                    placeholder={label}
                    disabled={busy}
                    value={text}
                    role="combobox"
                    aria-expanded={candidates.length > 0}
                    aria-autocomplete="list"
                    onChange={(event) => {
                        setText(event.target.value);
                        setCaret(event.target.selectionStart);
                        setDismissed(false);
                        setChoice(0);
                    }}
                    onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
                    onKeyDown={(event) => {
                        if (candidates.length > 0) {
                            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                                event.preventDefault();
                                setChoice((index) => (index + (event.key === 'ArrowDown' ? 1 : candidates.length - 1)) % candidates.length);
                                return;
                            }
                            if (event.key === 'Enter' || event.key === 'Tab') {
                                event.preventDefault();
                                mention(candidates[Math.min(choice, candidates.length - 1)]!);
                                return;
                            }
                            if (event.key === 'Escape') {
                                event.preventDefault();
                                setDismissed(true);
                                return;
                            }
                        }
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            void send();
                        }
                        if (event.key === 'Escape') onCancel();
                    }}
                />
                {candidates.length === 0 ? null : (
                    <div className="k-popup k-menu k-mention-menu" role="listbox" aria-label="People">
                        {candidates.map((person, index) => (
                            <div
                                key={person.id}
                                role="option"
                                aria-selected={index === choice}
                                className="k-menu__item"
                                data-highlighted={index === choice || undefined}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    mention(person);
                                }}>
                                <Avatar person={person} size={20} />
                                {person.name}
                            </div>
                        ))}
                    </div>
                )}
                {assignable ? (
                    <Menu.Root>
                        <Menu.Trigger className="k-text-button k-comment-assign" disabled={busy}>
                            {assignee === null ? <UserRound {...ICON} /> : <Avatar person={assignee} size={18} />}
                            {assignee === null ? 'Assign' : `Assigned to ${assignee.name}`}
                        </Menu.Trigger>
                        <Menu.Portal>
                            <Menu.Positioner sideOffset={6} align="start" className="k-positioner">
                                <Menu.Popup className="k-popup k-menu">
                                    {assignee === null ? null : (
                                        <Menu.Item className="k-menu__item" onClick={() => setAssignee(null)}>
                                            <UserRound {...ICON} />
                                            Nobody
                                        </Menu.Item>
                                    )}
                                    {people.map((person) => (
                                        <Menu.Item key={person.id} className="k-menu__item" onClick={() => setAssignee(person)}>
                                            <Avatar person={person} size={20} />
                                            {person.name}
                                        </Menu.Item>
                                    ))}
                                </Menu.Popup>
                            </Menu.Positioner>
                        </Menu.Portal>
                    </Menu.Root>
                ) : null}
            </div>
        </div>
    );
}

/**
 * One comment of a thread: a face, who and when, and what they said.
 */
function ThreadComment({ comment, me, now }: { comment: CommentView; me: string | undefined; now: Date }) {
    return (
        <div className="k-comment" data-resolved={comment.resolvedAt !== null || undefined}>
            <Avatar person={comment.by} size={22} />
            <span className="k-comment__head">
                <span className="k-comment__who">{commenterOf(comment, me)}</span>
                <span className="k-comment__when">{relativeTimeOf(comment.createdAt, now)}</span>
            </span>
            <p className="k-comment__text">{comment.text}</p>
        </div>
    );
}

/**
 * The threads on one field, under it: the one opened from its phrase, or
 * all of them behind a count, and the box for a new one on a phrase the
 * person selected. A thread whose phrase the field lost says so.
 */
export function FieldThreads({
    documentRef,
    label,
    threads,
    open,
    composing,
    people,
    me,
    now,
    connection,
    beforeSend,
    onOpen,
    onComposingEnd,
    onChanged,
}: {
    documentRef: string;
    label: string;
    threads: readonly Thread[];
    /**
     * The thread opened from its phrase, when it is on this field.
     */
    open: string | undefined;
    /**
     * The phrase a new thread quotes, while one is written on this field.
     */
    composing: { path: string; phrase: string } | undefined;
    people: readonly PersonView[];
    me: PersonView | undefined;
    now: Date;
    connection: Connection;
    /**
     * Saves what the person typed, so the phrase is in the draft the
     * comment quotes.
     */
    beforeSend: () => Promise<void>;
    onOpen: (thread: string | undefined) => void;
    onComposingEnd: () => void;
    onChanged: () => Promise<void>;
}) {
    const [expanded, setExpanded] = useState(false);
    const [replying, setReplying] = useState<string | undefined>();
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | undefined>();
    const opened = threads.find((thread) => thread.root.id === open);
    const shown = opened !== undefined ? [opened] : expanded ? threads : [];
    if (threads.length === 0 && composing === undefined) return null;

    const add = async (body: Record<string, unknown>): Promise<boolean> => {
        setBusy(true);
        setProblem(undefined);
        await beforeSend();
        const answer = await connection.call<CommentView>('editing_comments_add', {
            body: {
                ref: documentRef,
                ...body,
            },
        });
        setBusy(false);
        if (answer.status !== 201) {
            setProblem(problemOf(answer, 'The comment was not added'));
            return false;
        }
        await onChanged();
        return true;
    };

    const resolve = async (id: string): Promise<void> => {
        setBusy(true);
        setProblem(undefined);
        const answer = await connection.call<CommentView>('editing_comments_resolve', {
            params: {
                id,
            },
        });
        setBusy(false);
        if (answer.status !== 200) {
            setProblem(problemOf(answer, 'The comment was not resolved'));
            return;
        }
        if (open === id) onOpen(undefined);
        await onChanged();
    };

    return (
        <div className="k-threads" role="group" aria-label={`Comments on ${label}`}>
            {composing === undefined ? null : (
                <div className="k-thread" data-active>
                    <p className="k-thread__quote">
                        <span className="k-thread__phrase">{composing.phrase}</span>
                    </p>
                    <Composer
                        label={`Comment on “${composing.phrase}”`}
                        people={people}
                        me={me}
                        busy={busy}
                        assignable
                        onCancel={onComposingEnd}
                        onSend={async (comment) => {
                            const sent = await add({
                                path: composing.path,
                                anchor: composing.phrase,
                                text: comment.text,
                                mentions: comment.mentions,
                                assignee: comment.assignee,
                            });
                            if (sent) onComposingEnd();
                            return sent;
                        }}
                    />
                </div>
            )}
            {threads.length === 0 || opened !== undefined ? null : (
                <button
                    type="button"
                    className="k-text-button k-threads__toggle"
                    aria-expanded={expanded}
                    onClick={() => setExpanded(!expanded)}>
                    <MessageCircle {...ICON} />
                    {threads.length === 1 ? '1 comment' : `${threads.length} comments`}
                </button>
            )}
            {shown.map((thread) => (
                <div key={thread.root.id} className="k-thread" data-active={thread.root.id === open || undefined}>
                    {thread.root.anchor === null ? null : (
                        <p className="k-thread__quote" data-changed={thread.root.anchor.changed || undefined}>
                            <span className="k-thread__phrase">{thread.root.anchor.text}</span>
                            {thread.root.anchor.changed ? <span className="k-thread__changed">Text changed</span> : null}
                        </p>
                    )}
                    {[thread.root, ...thread.answers].map((comment) => (
                        <ThreadComment key={comment.id} comment={comment} me={me?.id} now={now} />
                    ))}
                    {thread.root.assignee === null ? null : (
                        <p className="k-thread__assignee">
                            <Avatar person={thread.root.assignee} size={18} />
                            Assigned to {thread.root.assignee.id === me?.id ? 'you' : thread.root.assignee.name}
                        </p>
                    )}
                    {replying === thread.root.id ? (
                        <Composer
                            label="Reply"
                            people={people}
                            me={me}
                            busy={busy}
                            assignable={false}
                            onCancel={() => setReplying(undefined)}
                            onSend={async (comment) => {
                                const sent = await add({
                                    replyTo: thread.root.id,
                                    text: comment.text,
                                    mentions: comment.mentions,
                                });
                                if (sent) setReplying(undefined);
                                return sent;
                            }}
                        />
                    ) : (
                        <div className="k-comment__actions k-thread__actions">
                            <button type="button" className="k-text-button" onClick={() => setReplying(thread.root.id)}>
                                Reply
                            </button>
                            <button type="button" className="k-text-button" disabled={busy} onClick={() => void resolve(thread.root.id)}>
                                Resolve
                            </button>
                            {thread.root.id === open ? (
                                <button type="button" className="k-text-button" onClick={() => onOpen(undefined)}>
                                    Close
                                </button>
                            ) : null}
                        </div>
                    )}
                </div>
            ))}
            {problem === undefined ? null : (
                <p className="k-error" role="alert">
                    <CircleAlert {...ICON} />
                    {problem}
                </p>
            )}
        </div>
    );
}
