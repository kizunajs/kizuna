import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { toolsFor, type Connection, type ToolAnswer } from '../view/connection.js';
import { EditorContext, ICON, type EditorContextValue } from '../view/context.js';
import { FieldForm, type FieldFormHandle, type SaveFailure, type SaveState } from '../view/form.js';
import { OwnerControl, ReviewBadge, type People } from '../view/people.js';
import { PublishReview } from '../view/review.js';
import { documentTitle, valueAt, type Description, type Draft } from '../view/schema.js';
import { sameContent } from '../same-content.js';
import { parseRef } from '../refs.js';
import { ItemActions } from './action-buttons.js';
import { hrefOf } from './navigation.js';
import { Loading, SaveIndicator, Status, Topbar, problemOf } from './parts.js';
import { AdminPreview } from './preview-pane.js';
import { Versions } from './versions.js';
import type { WaitingReview } from './dashboard.js';

/**
 * How often the screen checks whether someone else, or a model, changed the
 * draft it shows.
 */
const POLL_MS = 3000;

/**
 * How long a field someone else changed stays marked.
 */
const CHANGED_MS = 4000;

/**
 * How long the field the person pointed at in the preview stays marked.
 */
const POINTED_MS = 1600;

type DocumentTab = 'edit' | 'preview' | 'versions';

const TABS: Array<{ key: DocumentTab; label: string }> = [
    {
        key: 'edit',
        label: 'Edit',
    },
    {
        key: 'preview',
        label: 'Live preview',
    },
    {
        key: 'versions',
        label: 'Versions',
    },
];

interface Problem {
    detail?: string;
    errors?: Array<{
        path: Array<string | number>;
        message: string;
    }>;
}

const failureOf = (answer: ToolAnswer): SaveFailure => {
    const problem = answer.body as Problem | undefined;
    if (answer.status === 422 && problem?.errors !== undefined && problem.errors.length > 0) {
        return {
            fieldErrors: Object.fromEntries(problem.errors.map((error) => [error.path.join('.'), error.message])),
        };
    }
    if (answer.status === 409) {
        return {
            problem: 'Someone else changed this draft. It reloads with their change.',
        };
    }
    return {
        problem: problem?.detail ?? `The save failed (${answer.status}).`,
    };
};

const changedPaths = (document: Description, before: Record<string, unknown> | null, after: Record<string, unknown> | null): Set<string> =>
    new Set(
        document.fields
            .filter((field) => field.parent === undefined)
            .filter((field) => !sameContent(valueAt(before, field.path), valueAt(after, field.path)))
            .map((field) => field.path)
    );

/**
 * The list a document opens from, for the crumb above it.
 */
const crumbOf = (ref: string, collectionLabel: (name: string) => string | undefined): { label: string; href?: string } => {
    const parsed = parseRef(ref);
    if (parsed?.type === 'item') {
        return {
            label: collectionLabel(parsed.collection) ?? parsed.collection,
            href: hrefOf({
                kind: 'collection',
                name: parsed.collection,
            }),
        };
    }
    if (parsed?.type === 'page') {
        return {
            label: 'Pages',
            href: hrefOf({
                kind: 'pages',
            }),
        };
    }
    return {
        label: 'Globals',
    };
};

/**
 * One document's fields in the editor's form, saved to its draft as the
 * person types, with its owner, its review and Publish in the bar above. Its
 * tabs put the site in draft mode beside the fields, and list its versions.
 */
export function DocumentScreen({
    connection,
    documentRef,
    siteUrl,
    people,
    waiting,
    collectionLabel,
    onReviewsChanged,
}: {
    connection: Connection;
    documentRef: string;
    siteUrl: string | null;
    people: People | undefined;
    waiting: readonly WaitingReview[];
    collectionLabel: (name: string) => string | undefined;
    onReviewsChanged: () => void;
}) {
    const [document, setDocument] = useState<Description | undefined>();
    const [loadProblem, setLoadProblem] = useState<string | undefined>();
    const [saveState, setSaveState] = useState<SaveState>('idle');
    const [formKey, setFormKey] = useState(0);
    const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());
    const [linkProblem, setLinkProblem] = useState<string | undefined>();
    const [tab, setTab] = useState<DocumentTab>('edit');
    // The preview stays loaded once opened, so going back to it shows the page where it was.
    const [previewOpened, setPreviewOpened] = useState(false);
    const [pointed, setPointed] = useState<string | undefined>();
    const form = useRef<FieldFormHandle>(null);
    const seen = useRef<string | null>(null);
    const busy = useRef(false);
    const saves = useRef(0);
    const typing = useRef(false);
    const latest = useRef<Description | undefined>(undefined);
    latest.current = document;

    const describe = useCallback(
        async (ref: string, options: { remount?: boolean } = {}): Promise<Description | undefined> => {
            const answer = await connection.call<Description>('editing_describe', {
                query: {
                    ref,
                },
            });
            if (answer.status !== 200) {
                setLoadProblem(problemOf(answer, 'The CMS answered'));
                return undefined;
            }
            setLoadProblem(undefined);
            setDocument(answer.body);
            if (options.remount !== false) setFormKey((key) => key + 1);
            seen.current = null;
            return answer.body;
        },
        [connection]
    );

    useEffect(() => {
        setDocument(undefined);
        setSaveState('idle');
        void describe(documentRef);
    }, [describe, documentRef]);

    // Picks up what a model, or another editor, saves while this one is open.
    useEffect(() => {
        if (document === undefined) return;
        const tools = toolsFor(document.ref);
        if (tools === undefined) return;
        const check = async (): Promise<void> => {
            if (busy.current || typing.current || window.document.visibilityState !== 'visible') return;
            const savesBefore = saves.current;
            const answer = await connection.call<Draft>(`${tools.prefix}_get_draft`, {
                params: tools.params,
            });
            if (answer.status !== 200 || saves.current !== savesBefore || busy.current || typing.current) return;
            const marker = answer.body.updatedAt;
            if (seen.current === null) {
                seen.current = marker;
                return;
            }
            if (marker === seen.current) return;
            seen.current = marker;
            const before = latest.current;
            const after = await describe(document.ref, {
                remount: false,
            });
            if (before !== undefined && after !== undefined) setChanged(changedPaths(after, before.draft, after.draft));
        };
        const timer = window.setInterval(() => void check(), POLL_MS);
        void check();
        return () => window.clearInterval(timer);
    }, [connection, describe, document?.ref]);

    useEffect(() => {
        if (changed.size === 0) return;
        const timer = window.setTimeout(() => setChanged(new Set()), CHANGED_MS);
        return () => window.clearTimeout(timer);
    }, [changed]);

    useEffect(() => {
        if (pointed === undefined) return;
        const timer = window.setTimeout(() => setPointed(undefined), POINTED_MS);
        return () => window.clearTimeout(timer);
    }, [pointed]);

    /**
     * A click on a field in the preview: one of this document's points at it
     * in the form, and another document's opens that document.
     */
    const pointAt = useCallback((ref: string | null, path: string, framedPath: string | undefined): void => {
        const current = latest.current;
        if (current === undefined) return;
        const own = ref === null ? current.kind === 'page' && current.path === framedPath : ref === current.ref;
        if (own) {
            setPointed(path);
            return;
        }
        if (ref !== null) {
            window.location.hash = hrefOf({
                kind: 'document',
                ref,
            });
        }
    }, []);

    const save = useCallback(
        async (ref: string, changes: Record<string, unknown>): Promise<SaveFailure | undefined> => {
            const tools = toolsFor(ref);
            if (tools === undefined) {
                return {
                    problem: 'No document is open.',
                };
            }
            busy.current = true;
            saves.current += 1;
            try {
                const answer = await connection.call<Draft>(`${tools.prefix}_update_draft`, {
                    params: tools.params,
                    body: {
                        changes,
                        autosave: true,
                    },
                });
                const current = latest.current;
                const stillOpen = current?.ref === ref;
                if (answer.status !== 200) {
                    if (answer.status === 409 && stillOpen) void describe(ref);
                    return failureOf(answer);
                }
                if (stillOpen) {
                    seen.current = answer.body.updatedAt;
                    setDocument({
                        ...current,
                        status: answer.body.status,
                        version: answer.body.version,
                        complete: answer.body.complete,
                        missing: answer.body.missing,
                        draft: answer.body.content,
                    });
                }
                return undefined;
            } finally {
                busy.current = false;
            }
        },
        [connection, describe]
    );

    /**
     * What the publish review looks at: the open document, the reviews
     * waiting for the person, and every page with unpublished changes.
     */
    const reviewCandidates = useCallback(async (): Promise<Array<{ ref: string; title: string }>> => {
        const candidates = new Map<string, string>();
        const current = latest.current;
        if (current !== undefined) candidates.set(current.ref, documentTitle(current));
        for (const review of waiting) if (!candidates.has(review.ref)) candidates.set(review.ref, review.label);
        const listed = await connection.call<{ pages: Array<{ ref: string; name: string; path: string; status: string }> }>(
            'editing_pages_list'
        );
        if (listed.status === 200) {
            for (const page of listed.body.pages) {
                if (page.status !== 'draft' && page.status !== 'changed') continue;
                if (!candidates.has(page.ref)) candidates.set(page.ref, page.path === '/' ? page.name : page.path);
            }
        }
        return [...candidates].map(([ref, title]) => ({
            ref,
            title,
        }));
    }, [connection, waiting]);

    const resolveUrl = useCallback(
        (url: string): string | undefined => {
            try {
                return new URL(url, siteUrl ?? window.location.origin).toString();
            } catch {
                return undefined;
            }
        },
        [siteUrl]
    );
    const documentPath = document?.path ?? undefined;
    const editorContext = useMemo<EditorContextValue>(
        () => ({
            connection,
            resolveUrl,
            pageUrl: siteUrl === null || documentPath === undefined ? undefined : new URL(documentPath, siteUrl).toString(),
        }),
        [connection, resolveUrl, siteUrl, documentPath]
    );

    /**
     * The page in a new tab, in draft mode, through a link the CMS mints.
     */
    const openOnSite = async (path: string): Promise<void> => {
        // Opened before the link arrives, so the browser counts it as the click's.
        const opened = window.open('', '_blank');
        const answer = await connection.call<{ url: string }>('editing_create_preview', {
            body: {
                path,
            },
        });
        if (answer.status !== 200) {
            opened?.close();
            setLinkProblem(problemOf(answer, 'The draft could not be opened'));
            return;
        }
        setLinkProblem(undefined);
        if (opened === null) {
            window.location.assign(answer.body.url);
            return;
        }
        opened.opener = null;
        opened.location.href = answer.body.url;
    };

    const crumb = crumbOf(documentRef, collectionLabel);
    const crumbNode = crumb.href === undefined ? crumb.label : <a href={crumb.href}>{crumb.label}</a>;

    if (document === undefined) {
        return (
            <>
                <Topbar crumb={crumbNode} title="" />
                <div className="k-admin-body">
                    <Loading problem={loadProblem} />
                </div>
            </>
        );
    }

    const title = documentTitle(document);
    const previewPath = document.path ?? document.usedOn.pages[0]?.path ?? '/';
    const unsaved = saveState === 'pending' || saveState === 'saving';
    const showTab = (key: DocumentTab): void => {
        setTab(key);
        if (key === 'preview') setPreviewOpened(true);
    };
    return (
        <EditorContext.Provider value={editorContext}>
            <Topbar crumb={crumbNode} title={title}>
                <Status status={document.status} />
                {document.review !== null ? <ReviewBadge review={document.review} me={people?.me} /> : null}
                <SaveIndicator state={saveState} />
                <span className="k-admin-spacer" />
                <div className="k-header-actions">
                    <OwnerControl
                        owner={document.owner}
                        people={people}
                        title={title}
                        onChange={async (owner) => {
                            const tools = toolsFor(document.ref);
                            if (tools === undefined) return;
                            await connection.call(`${tools.prefix}_set_owner`, {
                                params: tools.params,
                                body: {
                                    owner,
                                },
                            });
                            await describe(document.ref);
                        }}
                    />
                    {siteUrl !== null && document.path !== null ? (
                        <button type="button" className="k-link" onClick={() => void openOnSite(document.path!)}>
                            <span className="k-ellipsis">{document.path}</span>
                            <ExternalLink {...ICON} />
                        </button>
                    ) : null}
                </div>
                <button
                    type="button"
                    className="k-button k-button-secondary"
                    disabled={saveState !== 'pending'}
                    onClick={() => void form.current?.flush()}>
                    Save draft
                </button>
                <PublishReview
                    connection={connection}
                    candidates={reviewCandidates}
                    people={people}
                    waiting={waiting.length}
                    everywhere={document.usedOn.everywhere}
                    disabled={saveState === 'pending' || saveState === 'saving' || saveState === 'failed'}
                    onChanged={(refs) => {
                        onReviewsChanged();
                        if (refs.includes(document.ref)) void describe(document.ref);
                    }}
                    onPublished={() => undefined}
                />
            </Topbar>
            <div className="k-admin-body">
                <div className="k-tab-bar k-admin-document-tabs" role="tablist" aria-label="Document">
                    {TABS.map((entry) =>
                        entry.key === 'preview' && siteUrl === null ? null : (
                            <button
                                key={entry.key}
                                id={`document-tab-${entry.key}`}
                                type="button"
                                role="tab"
                                aria-selected={tab === entry.key}
                                aria-controls={`document-panel-${entry.key}`}
                                className="k-tab"
                                onClick={() => showTab(entry.key)}>
                                {entry.label}
                            </button>
                        )
                    )}
                </div>
                {linkProblem === undefined ? null : (
                    <p className="k-error" role="alert">
                        {linkProblem}
                    </p>
                )}
                <div
                    id={`document-panel-${tab}`}
                    role="tabpanel"
                    aria-labelledby={`document-tab-${tab}`}
                    className="k-admin-editing"
                    data-tab={tab}>
                    <div className="k-admin-editing-fields" hidden={tab === 'versions'}>
                        {document.usedOn.everywhere ? <p className="k-note">This shows on every page.</p> : null}
                        {!document.complete && document.missing.length > 0 ? (
                            <p className="k-note">Fill in {document.missing.join(', ')} before publishing.</p>
                        ) : null}
                        <FieldForm
                            key={`${document.ref}:${formKey}`}
                            ref={form}
                            fields={document.fields}
                            layout={document.layout}
                            draft={document.draft}
                            onSave={(changes) => save(document.ref, changes)}
                            onState={(state) => {
                                typing.current = state === 'pending' || state === 'saving';
                                setSaveState(state);
                            }}
                            changed={changed}
                            pointed={pointed}
                        />
                        {document.kind === 'item' ? (
                            <ItemActions
                                connection={connection}
                                documentRef={document.ref}
                                actions={document.actions}
                                onRan={() =>
                                    void describe(document.ref, {
                                        remount: false,
                                    })
                                }
                            />
                        ) : null}
                    </div>
                    {previewOpened && siteUrl !== null ? (
                        <div className="k-admin-preview" hidden={tab !== 'preview'}>
                            <AdminPreview connection={connection} siteUrl={siteUrl} path={previewPath} onPoint={pointAt} />
                        </div>
                    ) : null}
                    {tab === 'versions' ? (
                        <Versions
                            connection={connection}
                            documentRef={document.ref}
                            version={document.version}
                            fields={document.fields}
                            draft={document.draft}
                            people={people}
                            disabled={unsaved}
                            onRestored={async () => {
                                await describe(document.ref);
                            }}
                        />
                    ) : null}
                </div>
            </div>
        </EditorContext.Provider>
    );
}
