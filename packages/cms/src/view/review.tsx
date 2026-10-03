import { useCallback, useEffect, useState } from 'react';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Check, CircleAlert, LoaderCircle, Undo2 } from 'lucide-react';
import { toolsFor, type Connection } from './connection.js';
import { ICON, useEditorContext } from './context.js';
import type { MediaRecord } from './media.js';
import { PeoplePicker, ReviewBadge, type People } from './people.js';
import type { PersonView, ReviewState } from './schema.js';

/**
 * One field the draft changes, as the changes route lists it.
 */
export interface DraftChange {
    path: string;
    label: string;
    before?: unknown;
    after?: unknown;
    writable: boolean;
}

interface Changes {
    label: string;
    published: boolean;
    changes: DraftChange[];
    owner: PersonView | null;
    review: ReviewState | null;
    requireReview: boolean;
}

const isImage = (value: unknown): value is { id: string; alt?: string } =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === 'string' &&
    'alt' in value;

/**
 * Portable Text as the words it holds, so a rich-text change reads as text.
 */
const richText = (value: unknown): string | undefined => {
    if (!Array.isArray(value) || !value.every((block) => typeof block === 'object' && block !== null && '_type' in block)) return undefined;
    return value
        .map((block: { _type?: string; children?: Array<{ text?: string }> }) =>
            block._type === 'block' ? (block.children ?? []).map((span) => span.text ?? '').join('') : '[image]'
        )
        .join('\n');
};

const asText = (value: unknown): string | undefined => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return richText(value);
};

type Piece = { kind: 'same' | 'added' | 'removed'; text: string };

/**
 * A word-level diff: the longest run the two texts share, with what was
 * removed and added around it.
 */
const wordDiff = (before: string, after: string): Piece[] | undefined => {
    // Each word keeps the space after it, so a run of changed words stays one run.
    const left = before.match(/\S+\s*|\s+/g) ?? [];
    const right = after.match(/\S+\s*|\s+/g) ?? [];
    if (left.length * right.length > 250_000) return undefined;
    const table = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));
    for (let row = left.length - 1; row >= 0; row--) {
        for (let column = right.length - 1; column >= 0; column--) {
            table[row]![column] =
                left[row] === right[column]
                    ? table[row + 1]![column + 1]! + 1
                    : Math.max(table[row + 1]![column]!, table[row]![column + 1]!);
        }
    }
    const pieces: Piece[] = [];
    const push = (kind: Piece['kind'], text: string): void => {
        const last = pieces.at(-1);
        if (last?.kind === kind) last.text += text;
        else
            pieces.push({
                kind,
                text,
            });
    };
    let row = 0;
    let column = 0;
    while (row < left.length && column < right.length) {
        if (left[row] === right[column]) {
            push('same', left[row]!);
            row++;
            column++;
        } else if (table[row + 1]![column]! >= table[row]![column + 1]!) {
            push('removed', left[row]!);
            row++;
        } else {
            push('added', right[column]!);
            column++;
        }
    }
    while (row < left.length) push('removed', left[row++]!);
    while (column < right.length) push('added', right[column++]!);
    return pieces;
};

function Thumbnail({ image }: { image: { id: string } }) {
    const { connection, resolveUrl } = useEditorContext();
    const [source, setSource] = useState<string | undefined>();
    useEffect(() => {
        void connection
            .call<MediaRecord>('editing_media_get', {
                params: {
                    id: image.id,
                },
            })
            .then((answer) => {
                if (answer.status === 200) setSource(resolveUrl(`${answer.body.url}?w=240`));
            });
    }, [connection, resolveUrl, image.id]);
    return source === undefined ? <span className="k-review-thumb" /> : <img className="k-review-thumb" src={source} alt="" />;
}

type ImageValue = {
    id: string;
    alt?: string;
    crop?: unknown;
    focalPoint?: unknown;
};

/**
 * What changed about the same image, in words, since two thumbnails of it
 * look alike.
 */
const imageFacts = (before: ImageValue, after: ImageValue): string[] => {
    const facts: string[] = [];
    if ((before.alt ?? '') !== (after.alt ?? '')) {
        facts.push(after.alt === undefined || after.alt === '' ? 'Alt text removed' : `Alt text: ${after.alt}`);
    }
    if (JSON.stringify(before.focalPoint ?? null) !== JSON.stringify(after.focalPoint ?? null)) {
        facts.push(after.focalPoint === undefined ? 'Focus point removed' : 'Focus point moved');
    }
    if (JSON.stringify(before.crop ?? null) !== JSON.stringify(after.crop ?? null)) {
        facts.push(after.crop === undefined ? 'Crop removed' : 'Crop changed');
    }
    return facts.length === 0 ? ['Same image, settings changed'] : facts;
};

const brief = (value: unknown): string => {
    const json = JSON.stringify(value);
    return json === undefined ? '' : json.length > 140 ? `${json.slice(0, 140)}…` : json;
};

/**
 * What one change does, shown the way its value reads.
 */
function ChangeValue({ change }: { change: DraftChange }) {
    if (change.after === undefined) return <p className="k-review-note">Cleared</p>;
    if (isImage(change.before) && isImage(change.after) && change.before.id === change.after.id) {
        return (
            <div className="k-review-images">
                <Thumbnail image={change.after} />
                <ul className="k-review-facts">
                    {imageFacts(change.before, change.after).map((fact) => (
                        <li key={fact}>{fact}</li>
                    ))}
                </ul>
            </div>
        );
    }
    if (isImage(change.before) || isImage(change.after)) {
        return (
            <div className="k-review-images">
                {isImage(change.before) ? <Thumbnail image={change.before} /> : <span className="k-review-note">No image</span>}
                <span className="k-review-arrow">→</span>
                {isImage(change.after) ? <Thumbnail image={change.after} /> : <span className="k-review-note">No image</span>}
            </div>
        );
    }
    const before = change.before === undefined ? '' : asText(change.before);
    const after = asText(change.after);
    if (before !== undefined && after !== undefined) {
        const pieces = wordDiff(before, after);
        if (pieces !== undefined) {
            return (
                <p className="k-review-text">
                    {pieces.map((piece, index) =>
                        piece.kind === 'same' ? (
                            <span key={index}>{piece.text}</span>
                        ) : piece.kind === 'added' ? (
                            <ins key={index}>{piece.text}</ins>
                        ) : (
                            <del key={index}>{piece.text}</del>
                        )
                    )}
                </p>
            );
        }
    }
    return (
        <div className="k-review-json">
            {change.before === undefined ? null : <del>{brief(change.before)}</del>}
            <ins>{brief(change.after)}</ins>
        </div>
    );
}

/**
 * A document with unpublished changes, as the review shows it.
 */
interface Pending {
    ref: string;
    title: string;
    tools: { prefix: string; params: Record<string, string> };
    published: boolean;
    changes: DraftChange[];
    owner: PersonView | null;
    review: ReviewState | null;
    requireReview: boolean;
    problem?: string;
}

/**
 * Why a document cannot go live yet, or undefined when it can.
 */
const heldBack = (document: Pending): string | undefined => {
    if (!document.requireReview || document.review?.status === 'approved') return undefined;
    const review = document.review;
    if (review === null) return 'Needs an approval before it goes live.';
    if (review.status === 'open') return 'Waiting for an approval.';
    if (review.status === 'changes') return 'Changes were requested. Ask for a new review once they are made.';
    return 'Changed after the approval. Ask for a new review.';
};

/**
 * What the dialog shows: the changes, or a step of asking for or answering a
 * review.
 */
type Step = 'changes' | 'ask' | 'requestChanges';

export interface PublishReviewProps {
    connection: Connection;
    /**
     * The documents to look at: the open one, the ones edited here, and every
     * page the CMS lists as changed. Those with nothing to publish drop out.
     */
    candidates: () => Promise<Array<{ ref: string; title: string }>>;
    people: People | undefined;
    /**
     * How many reviews wait for the person, which the button says.
     */
    waiting: number;
    everywhere: boolean;
    disabled: boolean;
    /**
     * Called after a revert or a publish, so the form and the preview show the
     * drafts as they now stand.
     */
    onChanged: (refs: string[]) => void;
    /**
     * Called once everything listed is published.
     */
    onPublished: (titles: string[]) => void;
}

/**
 * Publish, after a look at what goes live: each change every edited document
 * makes, as before and after, with a way to revert any of them or all, then
 * publish them together.
 */
export function PublishReview({
    connection,
    candidates,
    people,
    waiting,
    everywhere,
    disabled,
    onChanged,
    onPublished,
}: PublishReviewProps) {
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState<Pending[] | undefined>();
    const [busy, setBusy] = useState<string | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    // Documents left out of this publish or request.
    const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
    const [step, setStep] = useState<Step>('changes');
    const [reviewers, setReviewers] = useState<ReadonlySet<string>>(new Set());
    const [note, setNote] = useState('');

    const load = useCallback(async () => {
        const listed = await candidates();
        const found = await Promise.all(
            listed.map(async (candidate): Promise<Pending | undefined> => {
                const tools = toolsFor(candidate.ref);
                if (tools === undefined) return undefined;
                const answer = await connection.call<Changes>(`${tools.prefix}_changes`, {
                    params: tools.params,
                });
                if (answer.status !== 200 || answer.body.changes.length === 0) return undefined;
                return {
                    ...candidate,
                    title: answer.body.label,
                    tools,
                    published: answer.body.published,
                    changes: answer.body.changes,
                    owner: answer.body.owner,
                    review: answer.body.review,
                    requireReview: answer.body.requireReview,
                };
            })
        );
        setPending(found.filter((entry): entry is Pending => entry !== undefined));
    }, [connection, candidates]);

    useEffect(() => {
        if (!open) return;
        setPending(undefined);
        setProblem(undefined);
        setSkipped(new Set());
        setStep('changes');
        setNote('');
        void load();
    }, [open, load]);

    const revert = async (entries: Array<{ document: Pending; paths: string[] }>, key: string): Promise<void> => {
        setBusy(key);
        setProblem(undefined);
        for (const { document, paths } of entries) {
            // The person chose this in the editor, so a global's approval is theirs already.
            const answer = await connection.call(
                `${document.tools.prefix}_revert`,
                {
                    params: document.tools.params,
                    body: {
                        paths,
                    },
                },
                {
                    approved: true,
                }
            );
            if (answer.status !== 200) {
                setProblem((answer.body as { detail?: string } | undefined)?.detail ?? `The revert failed (${answer.status}).`);
                break;
            }
        }
        setBusy(undefined);
        onChanged(entries.map((entry) => entry.document.ref));
        await load();
    };

    const selected = (pending ?? []).filter((document) => !skipped.has(document.ref));
    const publishable = selected.filter((document) => heldBack(document) === undefined);
    const me = people?.me;
    const mine = selected.filter(
        (document) => document.review?.status === 'open' && document.review.reviewers.some((reviewer) => reviewer.id === me)
    );

    const publish = async (): Promise<void> => {
        if (pending === undefined) return;
        setBusy('publish');
        setProblem(undefined);
        const failed: Pending[] = [];
        for (const document of publishable) {
            // The person confirmed in this review, so the route runs without asking again.
            const answer = await connection.call(
                `${document.tools.prefix}_publish`,
                {
                    params: document.tools.params,
                    body: {},
                },
                {
                    approved: true,
                }
            );
            if (answer.status !== 200) {
                failed.push({
                    ...document,
                    problem: (answer.body as { detail?: string } | undefined)?.detail ?? `Publishing failed (${answer.status}).`,
                });
            }
        }
        setBusy(undefined);
        onChanged(publishable.map((document) => document.ref));
        const published = publishable.filter((document) => !failed.some((failure) => failure.ref === document.ref));
        if (published.length > 0) onPublished(published.map((document) => document.title));
        const left = pending.filter((document) => !published.some((done) => done.ref === document.ref));
        if (left.length === 0) {
            setOpen(false);
            return;
        }
        setPending(left.map((document) => failed.find((failure) => failure.ref === document.ref) ?? document));
        if (failed.length > 0) {
            setProblem(`${failed.length === 1 ? 'One document was' : `${failed.length} documents were`} not published. See below.`);
        }
    };

    const startAsking = (): void => {
        const owners = selected.map((document) => document.owner?.id).filter((id): id is string => id !== undefined && id !== me);
        setReviewers(new Set(owners));
        setNote('');
        setStep('ask');
    };

    const ask = async (): Promise<void> => {
        setBusy('ask');
        setProblem(undefined);
        const answer = await connection.call('editing_reviews_request', {
            body: {
                refs: selected.map((document) => document.ref),
                reviewers: [...reviewers],
                ...(note.trim() === ''
                    ? {}
                    : {
                          note: note.trim(),
                      }),
            },
        });
        setBusy(undefined);
        if (answer.status !== 201) {
            setProblem((answer.body as { detail?: string } | undefined)?.detail ?? `The request failed (${answer.status}).`);
            return;
        }
        onChanged(selected.map((document) => document.ref));
        setStep('changes');
        await load();
    };

    const decide = async (decision: 'approve' | 'requestChanges'): Promise<void> => {
        setBusy(decision);
        setProblem(undefined);
        // The person answered in this dialog, so the route runs without asking again.
        const answer = await connection.call(
            'editing_reviews_decide',
            {
                body: {
                    ids: mine.map((document) => document.review!.id),
                    decision,
                    ...(note.trim() === ''
                        ? {}
                        : {
                              note: note.trim(),
                          }),
                },
            },
            {
                approved: true,
            }
        );
        setBusy(undefined);
        if (answer.status !== 200) {
            setProblem((answer.body as { detail?: string } | undefined)?.detail ?? `The answer did not save (${answer.status}).`);
            return;
        }
        onChanged(mine.map((document) => document.ref));
        setStep('changes');
        setNote('');
        await load();
    };

    const toggle = (ref: string): void =>
        setSkipped((previous) => {
            const next = new Set(previous);
            if (next.has(ref)) next.delete(ref);
            else next.add(ref);
            return next;
        });

    const writable = selected
        .map((document) => ({
            document,
            paths: document.changes.filter((change) => change.writable).map((change) => change.path),
        }))
        .filter((entry) => entry.paths.length > 0);
    const count = selected.reduce((total, document) => total + document.changes.length, 0);
    const several = (pending ?? []).length > 1;

    return (
        <AlertDialog.Root open={open} onOpenChange={setOpen}>
            <AlertDialog.Trigger className="k-button k-button-primary" disabled={disabled}>
                {waiting > 0 ? `Review ${waiting}` : 'Publish'}
            </AlertDialog.Trigger>
            <AlertDialog.Portal>
                <AlertDialog.Backdrop className="k-backdrop" />
                <AlertDialog.Popup className="k-dialog k-review">
                    <AlertDialog.Title className="k-dialog-title">
                        {step === 'ask'
                            ? `Who should review ${selected.length === 1 ? selected[0]!.title : `${selected.length} documents`}?`
                            : step === 'requestChanges'
                              ? 'What should change?'
                              : pending === undefined
                                ? 'Publish?'
                                : mine.length > 0
                                  ? `Review ${mine.length === 1 ? mine[0]!.title : `${mine.length} documents`}`
                                  : pending.length <= 1
                                    ? `Publish ${pending[0]?.title ?? ''}?`
                                    : selected.length === pending.length
                                      ? `Publish ${pending.length} documents?`
                                      : `Publish ${selected.length} of ${pending.length} documents?`}
                    </AlertDialog.Title>
                    <AlertDialog.Description className="k-help">
                        {step === 'ask'
                            ? 'Each of them sees the request in the editor, and when they ask what is waiting for them.'
                            : step === 'requestChanges'
                              ? `${mine[0]?.review?.requestedBy.name.split(' ')[0] ?? 'They'} see${mine.length === 1 ? 's' : ''} your note on the page.`
                              : pending === undefined
                                ? 'Listing what changed.'
                                : everywhere
                                  ? 'Some of this shows on every page, so every visitor sees it.'
                                  : `${count} ${count === 1 ? 'change goes' : 'changes go'} live for visitors when you publish.`}
                    </AlertDialog.Description>
                    {step === 'ask' ? (
                        <div className="k-review-panel">
                            <PeoplePicker
                                people={people?.people ?? []}
                                exclude={me}
                                owner={selected.length === 1 ? (selected[0]!.owner?.id ?? null) : null}
                                selected={reviewers}
                                onToggle={(id) =>
                                    setReviewers((previous) => {
                                        const next = new Set(previous);
                                        if (next.has(id)) next.delete(id);
                                        else next.add(id);
                                        return next;
                                    })
                                }
                            />
                            <textarea
                                className="k-input k-textarea"
                                placeholder="A note for the reviewers (optional)"
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                            />
                        </div>
                    ) : null}
                    {step === 'requestChanges' ? (
                        <div className="k-review-panel">
                            <textarea
                                className="k-input k-textarea"
                                placeholder="What to change"
                                value={note}
                                autoFocus
                                onChange={(event) => setNote(event.target.value)}
                            />
                        </div>
                    ) : null}
                    <div className="k-review-list" hidden={step !== 'changes'}>
                        {pending === undefined ? (
                            <p className="k-help">
                                <LoaderCircle {...ICON} className="k-spin" /> Listing the changes
                            </p>
                        ) : pending.length === 0 ? (
                            <p className="k-help">Nothing changed since the last publish.</p>
                        ) : (
                            pending.map((document) => (
                                <section key={document.ref} className="k-review-group" data-skipped={skipped.has(document.ref)}>
                                    {several || document.review !== null ? (
                                        <div className="k-review-heading">
                                            {several ? (
                                                <button
                                                    type="button"
                                                    className="k-check"
                                                    role="checkbox"
                                                    aria-checked={!skipped.has(document.ref)}
                                                    aria-label={`Include ${document.title}`}
                                                    data-checked={skipped.has(document.ref) ? undefined : ''}
                                                    onClick={() => toggle(document.ref)}>
                                                    {skipped.has(document.ref) ? null : <Check {...ICON} />}
                                                </button>
                                            ) : null}
                                            <h3 className="k-review-document">{document.title}</h3>
                                            {document.review !== null ? <ReviewBadge review={document.review} me={me} /> : null}
                                        </div>
                                    ) : null}
                                    {document.review?.note !== null &&
                                    document.review?.note !== undefined &&
                                    document.review.status === 'open' ? (
                                        <p className="k-review-quote">{document.review.note}</p>
                                    ) : null}
                                    {document.review?.decisionNote !== null &&
                                    document.review?.decisionNote !== undefined &&
                                    document.review.status !== 'open' ? (
                                        <p className="k-review-quote">{document.review.decisionNote}</p>
                                    ) : null}
                                    {heldBack(document) !== undefined && document.review?.status !== 'open' ? (
                                        <p className="k-review-blocked">{heldBack(document)}</p>
                                    ) : null}
                                    {document.problem !== undefined ? (
                                        <p className="k-error" role="alert">
                                            <CircleAlert {...ICON} />
                                            {document.problem}
                                        </p>
                                    ) : null}
                                    {document.changes.map((change) => (
                                        <div key={change.path} className="k-review-row">
                                            <div className="k-review-body">
                                                <p className="k-review-label">
                                                    {change.label}
                                                    {change.before === undefined ? <span className="k-review-tag">New</span> : null}
                                                </p>
                                                <ChangeValue change={change} />
                                            </div>
                                            <button
                                                type="button"
                                                className="k-button k-button-secondary k-button-small"
                                                disabled={!change.writable || busy !== undefined}
                                                title={
                                                    change.writable
                                                        ? 'Set this back to what is published'
                                                        : 'Your role cannot change this field'
                                                }
                                                onClick={() =>
                                                    void revert(
                                                        [
                                                            {
                                                                document,
                                                                paths: [change.path],
                                                            },
                                                        ],
                                                        `${document.ref}:${change.path}`
                                                    )
                                                }>
                                                {busy === `${document.ref}:${change.path}` ? (
                                                    <LoaderCircle {...ICON} className="k-spin" />
                                                ) : (
                                                    <Undo2 {...ICON} />
                                                )}
                                                Revert
                                            </button>
                                        </div>
                                    ))}
                                </section>
                            ))
                        )}
                    </div>
                    {problem !== undefined ? (
                        <p className="k-error" role="alert">
                            <CircleAlert {...ICON} />
                            {problem}
                        </p>
                    ) : null}
                    <div className="k-dialog-actions k-review-actions">
                        {step === 'changes' ? (
                            <>
                                <button
                                    type="button"
                                    className="k-button k-button-secondary"
                                    disabled={writable.length === 0 || busy !== undefined}
                                    onClick={() => void revert(writable, 'all')}>
                                    Revert all
                                </button>
                                <span className="k-review-spacer" />
                                <AlertDialog.Close className="k-button k-button-secondary">Cancel</AlertDialog.Close>
                                {mine.length > 0 ? (
                                    <>
                                        <button
                                            type="button"
                                            className="k-button k-button-secondary"
                                            disabled={busy !== undefined}
                                            onClick={() => {
                                                setNote('');
                                                setStep('requestChanges');
                                            }}>
                                            Request changes
                                        </button>
                                        <button
                                            type="button"
                                            className="k-button k-button-primary"
                                            disabled={busy !== undefined}
                                            onClick={() => void decide('approve')}>
                                            {busy === 'approve' ? 'Approving' : mine.length > 1 ? 'Approve all' : 'Approve'}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        {people !== undefined && people.people.some((person) => person.id !== me) ? (
                                            <button
                                                type="button"
                                                className="k-button k-button-secondary"
                                                disabled={busy !== undefined || selected.length === 0}
                                                onClick={startAsking}>
                                                Ask for review
                                            </button>
                                        ) : null}
                                        <button
                                            type="button"
                                            className="k-button k-button-primary"
                                            disabled={busy !== undefined || publishable.length === 0}
                                            onClick={() => void publish()}>
                                            {busy === 'publish'
                                                ? 'Publishing'
                                                : publishable.length > 1
                                                  ? `Publish ${publishable.length}`
                                                  : 'Publish'}
                                        </button>
                                    </>
                                )}
                            </>
                        ) : (
                            <>
                                <span className="k-review-spacer" />
                                <button
                                    type="button"
                                    className="k-button k-button-secondary"
                                    disabled={busy !== undefined}
                                    onClick={() => setStep('changes')}>
                                    Back
                                </button>
                                {step === 'ask' ? (
                                    <button
                                        type="button"
                                        className="k-button k-button-primary"
                                        disabled={busy !== undefined || reviewers.size === 0}
                                        onClick={() => void ask()}>
                                        {busy === 'ask' ? 'Sending' : 'Send request'}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="k-button k-button-primary"
                                        disabled={busy !== undefined || note.trim() === ''}
                                        onClick={() => void decide('requestChanges')}>
                                        {busy === 'requestChanges' ? 'Sending' : 'Send back'}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </AlertDialog.Popup>
            </AlertDialog.Portal>
        </AlertDialog.Root>
    );
}
