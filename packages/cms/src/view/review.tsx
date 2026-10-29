import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Checkbox } from '@base-ui/react/checkbox';
import { Check, CircleAlert, LoaderCircle, Undo2 } from 'lucide-react';
import { toolsFor, type Connection } from './connection.js';
import { ICON, useEditorContext } from './context.js';
import type { MediaRecord } from './media.js';
import { PeoplePicker, ReviewBadge, type People } from './people.js';
import { changeView, referencesOf, textOf, type ChangeView, type Shown, type ValueShape } from './change-value.js';
import type { Description, PersonView, ReviewState } from './schema.js';

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
    canPublishPastReview: boolean;
}

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
    return source === undefined ? <span className="k-review__thumb" /> : <img className="k-review__thumb" src={source} alt="" />;
}

/**
 * A value as it reads, in the space of a line or a few.
 */
function ShownValue({ shown }: { shown: Shown }) {
    if (shown.kind === 'empty') return <span className="k-review__note">Empty</span>;
    if (shown.kind === 'image') {
        return (
            <span className="k-review__image">
                <Thumbnail image={shown} />
                <span className={shown.alt === undefined ? 'k-review__note' : undefined}>{shown.alt ?? 'No alt text'}</span>
            </span>
        );
    }
    if (shown.kind === 'text' && shown.prose) return <span className="k-review__prose">{shown.text}</span>;
    return <span>{textOf(shown)}</span>;
}

/**
 * What one change does, shown the way its value reads.
 */
function ChangeValue({ view }: { view: ChangeView }) {
    if (view.kind === 'words') {
        return (
            <p className="k-review__text">
                {view.pieces.map((piece, index) =>
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
    if (view.kind === 'image') {
        return (
            <div className="k-review__images">
                <Thumbnail image={view.image} />
                <ul className="k-review__facts">
                    {view.facts.map((fact) => (
                        <li key={fact}>{fact}</li>
                    ))}
                </ul>
            </div>
        );
    }
    if (view.kind === 'list') {
        return (
            <div className="k-review__list-change">
                {view.summary === undefined ? null : <p className="k-review__note">{view.summary}</p>}
                {view.items.length === 0 && view.removed.length === 0 ? <p className="k-review__note">Empty</p> : null}
                <ol className="k-review__items">
                    {view.items.map((item, index) => (
                        <li key={index}>
                            <ShownValue shown={item.value} />
                            {item.added ? <span className="k-review__tag">Added</span> : null}
                        </li>
                    ))}
                    {view.removed.map((item, index) => (
                        <li key={`removed-${index}`} className="k-review__removed">
                            <del>
                                <ShownValue shown={item} />
                            </del>
                            <span className="k-review__tag">Removed</span>
                        </li>
                    ))}
                </ol>
            </div>
        );
    }
    if (view.kind === 'fields') {
        return (
            <dl className="k-review__fields">
                {view.entries.map((entry) => (
                    <div key={entry.label} className="k-review__field">
                        <dt>{entry.label}</dt>
                        <dd>
                            <ChangeValue view={entry.change} />
                        </dd>
                    </div>
                ))}
            </dl>
        );
    }
    if (view.before.kind === 'empty') {
        return (
            <p className="k-review__swap">
                <ShownValue shown={view.after} />
            </p>
        );
    }
    return (
        <p className="k-review__swap">
            <del>
                <ShownValue shown={view.before} />
            </del>
            <span className="k-review__arrow" aria-hidden="true">
                →
            </span>
            {view.after.kind === 'empty' ? (
                <span className="k-review__note">Cleared</span>
            ) : (
                <ins>
                    <ShownValue shown={view.after} />
                </ins>
            )}
        </p>
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
    changes: Array<
        DraftChange & {
            view: ChangeView;
        }
    >;
    owner: PersonView | null;
    review: ReviewState | null;
    requireReview: boolean;
    /**
     * Whether the person may publish it before its review is approved.
     */
    canPublishPastReview: boolean;
    problem?: string;
}

/**
 * Names as a sentence lists them: "Kari", "Kari or Ola", "Kari, Ola or Nils".
 */
const eitherOf = (names: readonly string[]): string =>
    names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)!}`;

/**
 * Why a document cannot go live yet, or undefined when it can.
 */
const heldBack = (document: Pending): string | undefined => {
    if (!document.requireReview || document.review?.status === 'approved') return undefined;
    const review = document.review;
    if (review === null) return 'Needs an approval before it goes live.';
    if (review.status === 'open') {
        const names = review.reviewers.map((reviewer) => reviewer.name);
        return names.length === 0
            ? 'Needs an approval before it goes live.'
            : `${eitherOf(names)} needs to approve this before it goes live.`;
    }
    if (review.status === 'changes') return 'Changes were requested. Ask for a new review once they are made.';
    return 'Changed after the approval. Ask for a new review.';
};

/**
 * What the dialog asks before someone publishes past a review.
 */
const publishPastQuestion = (document: Pending): string => {
    const review = document.review;
    const names = review?.status === 'open' ? review.reviewers.map((reviewer) => reviewer.name.split(' ')[0]!) : [];
    if (names.length === 1) return `Publish without ${names[0]}'s approval?`;
    if (names.length > 1) return `Publish without an approval from ${eitherOf(names)}?`;
    return 'Publish without an approval?';
};

/**
 * How each change's value reads, from the fields `describe` lists and the
 * labels of the items its ids name. A field it cannot find, or a label it
 * cannot look up, shows the stored value plainly.
 */
const changeViewsOf = async (
    connection: Connection,
    ref: string,
    changes: readonly DraftChange[]
): Promise<Array<DraftChange & { view: ChangeView }>> => {
    const described = await connection.call<Description>('editing_describe', {
        query: {
            ref,
        },
    });
    const fields = described.status === 200 ? described.body.fields : [];
    const shapeOf = (path: string): ValueShape => {
        const field = fields.find((candidate) => candidate.path === path);
        return field === undefined
            ? {
                  schema: {},
                  root: {},
              }
            : {
                  schema: field.schema,
                  root: field.schema,
                  options: field.options,
                  brand: field.brand,
              };
    };
    const wanted = new Map<string, Set<string>>();
    for (const change of changes) {
        for (const { brand, id } of [
            ...referencesOf(change.before, shapeOf(change.path)),
            ...referencesOf(change.after, shapeOf(change.path)),
        ]) {
            wanted.set(brand, (wanted.get(brand) ?? new Set()).add(id));
        }
    }
    const labels = new Map<string, string>();
    await Promise.all(
        [...wanted].map(async ([brand, ids]) => {
            const answer = await connection.call<{ items: Array<{ id: string; label: string }> }>('editing_search_items', {
                params: {
                    brand,
                },
                query: {
                    ids: [...ids],
                },
            });
            if (answer.status !== 200) return;
            for (const item of answer.body.items) labels.set(`${brand}\n${item.id}`, item.label);
        })
    );
    const labelOf = (brand: string, id: string): string | undefined => labels.get(`${brand}\n${id}`);
    return changes.map((change) => ({
        ...change,
        view: changeView(change.before, change.after, shapeOf(change.path), labelOf),
    }));
};

/**
 * What the dialog shows: the changes, or a step of asking for or answering a
 * review.
 */
type Step = 'changes' | 'ask' | 'requestChanges' | 'publishPast';

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
     * The id of what says why the button is disabled.
     */
    describedBy?: string | undefined;
    /**
     * Called after a revert or a publish, so the form and the preview show the
     * drafts as they now stand.
     */
    onChanged: (refs: string[]) => void;
    /**
     * Called once everything listed is published.
     */
    onPublished: (titles: string[]) => void;
    ref?: Ref<PublishReviewHandle>;
}

export interface PublishReviewHandle {
    /**
     * Opens the dialog on asking for a review of what changed.
     */
    ask: () => void;
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
    describedBy,
    onChanged,
    onPublished,
    ref,
}: PublishReviewProps) {
    const [open, setOpen] = useState(false);
    // Set by `ask`, so the dialog moves on to asking once the changes load.
    const askOnLoad = useRef(false);
    const [pending, setPending] = useState<Pending[] | undefined>();
    const [busy, setBusy] = useState<string | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    // Documents left out of this publish or request.
    const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
    const [step, setStep] = useState<Step>('changes');
    const [reviewers, setReviewers] = useState<ReadonlySet<string>>(new Set());
    const [note, setNote] = useState('');
    const blockerId = useId();
    // The document someone is about to publish past its review.
    const [publishingPast, setPublishingPast] = useState<Pending | undefined>();

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
                    changes: await changeViewsOf(connection, candidate.ref, answer.body.changes),
                    owner: answer.body.owner,
                    review: answer.body.review,
                    requireReview: answer.body.requireReview,
                    canPublishPastReview: answer.body.canPublishPastReview,
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

    const publish = async (documents: readonly Pending[], force: boolean): Promise<void> => {
        if (pending === undefined) return;
        setBusy('publish');
        setProblem(undefined);
        const failed: Pending[] = [];
        for (const document of documents) {
            // The person confirmed in this review, so the route runs without asking again.
            const answer = await connection.call(
                `${document.tools.prefix}_publish`,
                {
                    params: document.tools.params,
                    body: force
                        ? {
                              force: true,
                          }
                        : {},
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
        setStep('changes');
        onChanged(documents.map((document) => document.ref));
        const published = documents.filter((document) => !failed.some((failure) => failure.ref === document.ref));
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

    useImperativeHandle(
        ref,
        () => ({
            ask: () => {
                askOnLoad.current = true;
                setOpen(true);
            },
        }),
        []
    );

    // Once the changes load, a dialog opened by `ask` moves on to asking.
    useEffect(() => {
        if (!askOnLoad.current || pending === undefined) return;
        askOnLoad.current = false;
        if (selected.length > 0) startAsking();
    }, [pending]);

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
    // Why Publish leaves something out, or is off: said beside the button, which points at it.
    // Someone with an approver role may publish past a review, which they can do from beside the reason.
    const blockers: Array<{ text: string; publishPast?: Pending }> =
        pending === undefined
            ? []
            : pending.length === 0
              ? [
                    {
                        text: 'Nothing changed since the last publish.',
                    },
                ]
              : selected.length === 0
                ? [
                      {
                          text: 'Choose at least one document to publish.',
                      },
                  ]
                : selected.flatMap((document) => {
                      const reason = heldBack(document);
                      if (reason === undefined) return [];
                      return [
                          {
                              text: several ? `${document.title}: ${reason}` : reason,
                              ...(document.canPublishPastReview
                                  ? {
                                        publishPast: document,
                                    }
                                  : {}),
                          },
                      ];
                  });

    return (
        <AlertDialog.Root open={open} onOpenChange={setOpen}>
            <AlertDialog.Trigger
                className="k-button k-button--primary k-review__trigger"
                disabled={disabled}
                aria-describedby={describedBy}>
                {waiting > 0 ? `Review ${waiting}` : 'Publish'}
            </AlertDialog.Trigger>
            <AlertDialog.Portal>
                <AlertDialog.Backdrop className="k-backdrop" />
                <AlertDialog.Popup className="k-dialog k-review">
                    <AlertDialog.Title className="k-dialog__title">
                        {step === 'ask'
                            ? `Who should review ${selected.length === 1 ? selected[0]!.title : `${selected.length} documents`}?`
                            : step === 'requestChanges'
                              ? 'What should change?'
                              : step === 'publishPast' && publishingPast !== undefined
                                ? publishPastQuestion(publishingPast)
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
                              : step === 'publishPast'
                                ? `${publishingPast?.title ?? 'This'} goes live before anyone approves it. The review records that you published it.`
                                : pending === undefined
                                  ? 'Listing what changed.'
                                  : everywhere
                                    ? 'Some of this shows on every page, so every visitor sees it.'
                                    : `${count} ${count === 1 ? 'change goes' : 'changes go'} live for visitors when you publish.`}
                    </AlertDialog.Description>
                    {step === 'ask' ? (
                        <div className="k-review__panel">
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
                        <div className="k-review__panel">
                            <textarea
                                className="k-input k-textarea"
                                placeholder="What to change"
                                value={note}
                                autoFocus
                                onChange={(event) => setNote(event.target.value)}
                            />
                        </div>
                    ) : null}
                    <div className="k-review__list" hidden={step !== 'changes'}>
                        {pending === undefined ? (
                            <p className="k-help">
                                <LoaderCircle {...ICON} className="k-spin" /> Listing the changes
                            </p>
                        ) : pending.length === 0 ? null : (
                            pending.map((document) => (
                                <section key={document.ref} className="k-review__group" data-skipped={skipped.has(document.ref)}>
                                    {several || document.review !== null ? (
                                        <div className="k-review__heading">
                                            {several ? (
                                                <Checkbox.Root
                                                    className="k-check"
                                                    aria-label={`Include ${document.title}`}
                                                    checked={!skipped.has(document.ref)}
                                                    onCheckedChange={() => toggle(document.ref)}>
                                                    <Checkbox.Indicator className="k-check__indicator">
                                                        <Check {...ICON} />
                                                    </Checkbox.Indicator>
                                                </Checkbox.Root>
                                            ) : null}
                                            <h3 className="k-review__document">{document.title}</h3>
                                            {document.review !== null ? <ReviewBadge review={document.review} me={me} /> : null}
                                        </div>
                                    ) : null}
                                    {document.review?.note !== null &&
                                    document.review?.note !== undefined &&
                                    document.review.status === 'open' ? (
                                        <p className="k-review__quote">{document.review.note}</p>
                                    ) : null}
                                    {document.review?.decisionNote !== null &&
                                    document.review?.decisionNote !== undefined &&
                                    document.review.status !== 'open' ? (
                                        <p className="k-review__quote">{document.review.decisionNote}</p>
                                    ) : null}
                                    {document.problem !== undefined ? (
                                        <p className="k-error" role="alert">
                                            <CircleAlert {...ICON} />
                                            {document.problem}
                                        </p>
                                    ) : null}
                                    {document.changes.map((change) => (
                                        <div key={change.path} className="k-review__row">
                                            <div className="k-review__body">
                                                <p className="k-review__label">
                                                    {change.label}
                                                    {change.before === undefined ? <span className="k-review__tag">New</span> : null}
                                                </p>
                                                <ChangeValue view={change.view} />
                                            </div>
                                            <button
                                                type="button"
                                                className="k-button k-button--secondary k-button--small"
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
                    {step === 'changes' && mine.length === 0 && blockers.length > 0 ? (
                        <div className="k-review__blocker" id={blockerId}>
                            {blockers.map((blocker) => (
                                <p key={blocker.text}>
                                    <CircleAlert {...ICON} />
                                    <span>{blocker.text}</span>
                                    {blocker.publishPast === undefined ? null : (
                                        <button
                                            type="button"
                                            className="k-button k-button--secondary k-button--small"
                                            disabled={busy !== undefined}
                                            onClick={() => {
                                                setPublishingPast(blocker.publishPast);
                                                setStep('publishPast');
                                            }}>
                                            Publish anyway
                                        </button>
                                    )}
                                </p>
                            ))}
                        </div>
                    ) : null}
                    <div className="k-dialog__actions k-review__actions">
                        {step === 'changes' ? (
                            <>
                                <button
                                    type="button"
                                    className="k-button k-button--secondary"
                                    disabled={writable.length === 0 || busy !== undefined}
                                    onClick={() => void revert(writable, 'all')}>
                                    Revert all
                                </button>
                                <span className="k-review__spacer" />
                                <AlertDialog.Close className="k-button k-button--secondary">Cancel</AlertDialog.Close>
                                {mine.length > 0 ? (
                                    <>
                                        <button
                                            type="button"
                                            className="k-button k-button--secondary"
                                            disabled={busy !== undefined}
                                            onClick={() => {
                                                setNote('');
                                                setStep('requestChanges');
                                            }}>
                                            Request changes
                                        </button>
                                        <button
                                            type="button"
                                            className="k-button k-button--primary"
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
                                                className="k-button k-button--secondary"
                                                disabled={busy !== undefined || selected.length === 0}
                                                onClick={startAsking}>
                                                Ask for review
                                            </button>
                                        ) : null}
                                        <button
                                            type="button"
                                            className="k-button k-button--primary"
                                            disabled={busy !== undefined || publishable.length === 0}
                                            aria-describedby={blockers.length > 0 ? blockerId : undefined}
                                            onClick={() => void publish(publishable, false)}>
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
                                <span className="k-review__spacer" />
                                <button
                                    type="button"
                                    className="k-button k-button--secondary"
                                    disabled={busy !== undefined}
                                    onClick={() => setStep('changes')}>
                                    Back
                                </button>
                                {step === 'ask' ? (
                                    <button
                                        type="button"
                                        className="k-button k-button--primary"
                                        disabled={busy !== undefined || reviewers.size === 0}
                                        onClick={() => void ask()}>
                                        {busy === 'ask' ? 'Sending' : 'Send request'}
                                    </button>
                                ) : step === 'publishPast' ? (
                                    <button
                                        type="button"
                                        className="k-button k-button--primary"
                                        disabled={busy !== undefined || publishingPast === undefined}
                                        onClick={() => {
                                            if (publishingPast !== undefined) void publish([publishingPast], true);
                                        }}>
                                        {busy === 'publish' ? 'Publishing' : 'Publish anyway'}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="k-button k-button--primary"
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
