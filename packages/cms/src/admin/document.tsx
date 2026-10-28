import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Tabs } from '@base-ui/react/tabs';
import { CircleAlert, ExternalLink, Info, PanelRight } from 'lucide-react';
import { toolsFor, type Connection, type ToolAnswer } from '../view/connection.js';
import { EditorContext, ICON, type EditorContextValue } from '../view/context.js';
import { FieldForm, fieldDomId, type FieldFormHandle, type SaveFailure, type SaveState } from '../view/form.js';
import { OwnerControl, ReviewBadge, type People } from '../view/people.js';
import { PublishReview, type PublishReviewHandle } from '../view/review.js';
import { documentTitle, valueAt, type Description, type Draft } from '../view/schema.js';
import { sameContent } from '../same-content.js';
import { parseRef } from '../refs.js';
import { blockerOf, documentDatesOf } from './document-menu.js';
import { DocumentMore } from './document-more.js';
import { savedAtOf, type VersionSummary } from './history.js';
import { hrefOf } from './navigation.js';
import { PageHeader, type Crumb } from './page-header.js';
import { Loading, SaveIndicator, Status, problemOf } from './parts.js';
import { relativeTimeOf } from './time.js';
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

type DocumentView = 'edit' | 'versions';

/**
 * Where a document stands, as the header's line says it.
 */
const STATUS_FACT: Record<string, string> = {
    empty: 'Not published',
    draft: 'Draft',
    published: 'Published',
    changed: 'Draft changes',
};

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
const crumbOf = (ref: string, collectionLabel: (name: string) => string | undefined): Crumb => {
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
 * How often "Updated 4 min ago" is worked out again.
 */
const CLOCK_MS = 30_000;

const useNow = (): Date => {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), CLOCK_MS);
        return () => window.clearInterval(timer);
    }, []);
    return now;
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
    const [view, setView] = useState<DocumentView>('edit');
    const [previewOn, setPreviewOn] = useState(false);
    // The preview stays loaded once opened, so turning it back on shows the page where it was.
    const [previewOpened, setPreviewOpened] = useState(false);
    const [versions, setVersions] = useState<VersionSummary[] | undefined>();
    const [updatedBy, setUpdatedBy] = useState<string | null>(null);
    const review = useRef<PublishReviewHandle>(null);
    const [pointed, setPointed] = useState<string | undefined>();
    const [updatedAt, setUpdatedAt] = useState<string | null>(null);
    const now = useNow();
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
        setUpdatedAt(null);
        setUpdatedBy(null);
        setVersions(undefined);
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
            setUpdatedAt(marker);
            setUpdatedBy(answer.body.updatedBy);
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

    // The versions, for their count on the tab and the dates beside the fields.
    const documentVersion = document?.version;
    useEffect(() => {
        const tools = toolsFor(documentRef);
        if (tools === undefined || documentVersion === undefined) return;
        let current = true;
        void connection
            .call<{ versions: VersionSummary[] }>(`${tools.prefix}_history`, {
                params: tools.params,
            })
            .then((answer) => {
                if (current && answer.status === 200) setVersions(answer.body.versions);
            });
        return () => {
            current = false;
        };
    }, [connection, documentRef, documentVersion]);

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
                    setUpdatedAt(answer.body.updatedAt);
                    setUpdatedBy(answer.body.updatedBy);
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

    if (document === undefined) {
        return (
            <div className="k-document">
                <PageHeader crumbs={[crumb]} title="" />
                <div className="k-admin__body">
                    <Loading problem={loadProblem} />
                </div>
            </div>
        );
    }

    const title = documentTitle(document);
    const previewPath = siteUrl === null ? null : document.previewPath;
    // A document that stops showing on a page, after a change or a reload, loses the preview.
    const previewShown = previewOn && previewPath !== null && view === 'edit';
    const unsaved = saveState === 'pending' || saveState === 'saving';
    const blocker = document.complete ? undefined : blockerOf(document.missing, document.fields);
    const askable = people !== undefined && people.people.some((person) => person.id !== people.me);
    const updatedByName = updatedBy === null ? undefined : (people?.people.find((person) => person.id === updatedBy)?.name ?? undefined);
    const dates = documentDatesOf(versions ?? []);
    const showBlocker = (): void => {
        const name = document.missing[0];
        if (name === undefined) return;
        const section = window.document.getElementById(fieldDomId(name));
        section?.scrollIntoView({
            block: 'center',
            behavior: 'smooth',
        });
        section?.querySelector<HTMLElement>('input, textarea, button, [contenteditable="true"]')?.focus({
            preventScroll: true,
        });
    };

    const owner =
        people === undefined || people.people.length === 0 ? null : (
            <OwnerControl
                owner={document.owner}
                people={people}
                title={title}
                onChange={async (picked) => {
                    const tools = toolsFor(document.ref);
                    if (tools === undefined) return;
                    await connection.call(`${tools.prefix}_set_owner`, {
                        params: tools.params,
                        body: {
                            owner: picked,
                        },
                    });
                    await describe(document.ref);
                }}
            />
        );

    const info = (
        <Popover.Root>
            <Popover.Trigger className="k-tab k-document__info-toggle">
                <Info {...ICON} />
                Info
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Positioner sideOffset={6} align="end" className="k-positioner">
                    <Popover.Popup className="k-popup k-document-info">
                        <Popover.Title className="k-document-info__heading">Document</Popover.Title>
                        <dl className="k-document-info__list">
                            <dt>Status</dt>
                            <dd>
                                <Status status={document.status} />
                            </dd>
                            {dates.created === null ? null : (
                                <>
                                    <dt>Created</dt>
                                    <dd>{savedAtOf(dates.created, now)}</dd>
                                </>
                            )}
                            {updatedAt === null ? null : (
                                <>
                                    <dt>Updated</dt>
                                    <dd>{savedAtOf(updatedAt, now)}</dd>
                                </>
                            )}
                            {dates.published === null ? null : (
                                <>
                                    <dt>Published</dt>
                                    <dd>{savedAtOf(dates.published, now)}</dd>
                                </>
                            )}
                        </dl>
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );

    return (
        <EditorContext.Provider value={editorContext}>
            <Tabs.Root value={view} onValueChange={(key: DocumentView) => setView(key)} className="k-document" data-preview={previewShown}>
                <PageHeader
                    crumbs={[crumb]}
                    title={title}
                    meta={[
                        {
                            label: 'Status',
                            value: STATUS_FACT[document.status] ?? document.status,
                        },
                        updatedAt === null
                            ? null
                            : {
                                  label: 'Updated',
                                  value: `${relativeTimeOf(updatedAt, now)}${updatedByName === undefined ? '' : ` by ${updatedByName}`}`,
                              },
                        owner === null
                            ? null
                            : {
                                  label: 'Owner',
                                  value: owner,
                              },
                        siteUrl === null || document.path === null
                            ? null
                            : {
                                  label: 'Page',
                                  value: (
                                      <button
                                          type="button"
                                          className="k-document-info__link"
                                          onClick={() => void openOnSite(document.path!)}>
                                          <span className="k-ellipsis">{document.path}</span>
                                          <ExternalLink {...ICON} />
                                      </button>
                                  ),
                              },
                        document.usedOn.everywhere
                            ? {
                                  label: 'Shows',
                                  value: 'On every page',
                              }
                            : null,
                        document.review === null
                            ? null
                            : {
                                  label: 'Review',
                                  value: <ReviewBadge review={document.review} me={people?.me} />,
                              },
                    ]}
                    tabs={
                        <>
                            <Tabs.List className="k-document__views" aria-label="Document">
                                <Tabs.Tab value="edit" className="k-tab">
                                    Edit
                                </Tabs.Tab>
                                <Tabs.Tab value="versions" className="k-tab">
                                    Versions
                                    {versions === undefined || versions.length === 0 ? null : (
                                        <span className="k-tab__count">{versions.length}</span>
                                    )}
                                </Tabs.Tab>
                            </Tabs.List>
                            <span className="k-document__divider" aria-hidden="true" />
                            {previewPath === null ? null : (
                                <button
                                    type="button"
                                    className="k-tab k-document__preview-toggle"
                                    aria-pressed={previewShown}
                                    onClick={() => {
                                        setPreviewOn(!previewShown);
                                        setPreviewOpened(true);
                                        setView('edit');
                                    }}>
                                    <PanelRight {...ICON} />
                                    <span className="k-document__long">Live preview</span>
                                    <span className="k-document__short">Preview</span>
                                </button>
                            )}
                            {info}
                        </>
                    }
                    actions={
                        <>
                            <SaveIndicator state={saveState} />
                            {blocker === undefined ? null : (
                                <button type="button" className="k-document__blocker" id="k-document-blocker" onClick={showBlocker}>
                                    <CircleAlert {...ICON} />
                                    {blocker}
                                </button>
                            )}
                            <button
                                type="button"
                                className="k-button k-button--secondary k-button--small"
                                disabled={saveState !== 'pending'}
                                onClick={() => void form.current?.flush()}>
                                Save draft
                            </button>
                            <PublishReview
                                ref={review}
                                connection={connection}
                                candidates={reviewCandidates}
                                people={people}
                                waiting={waiting.length}
                                everywhere={document.usedOn.everywhere}
                                disabled={unsaved || saveState === 'failed' || (blocker !== undefined && waiting.length === 0)}
                                describedBy={blocker === undefined ? undefined : 'k-document-blocker'}
                                onChanged={(refs) => {
                                    onReviewsChanged();
                                    if (refs.includes(document.ref)) void describe(document.ref);
                                }}
                                onPublished={() => undefined}
                            />
                            <DocumentMore
                                connection={connection}
                                document={document}
                                title={title}
                                askable={askable}
                                onAsk={() => review.current?.ask()}
                                onChanged={() =>
                                    void describe(document.ref, {
                                        remount: false,
                                    })
                                }
                                onProblem={setLinkProblem}
                            />
                        </>
                    }
                />
                {linkProblem === undefined ? null : (
                    <p className="k-error k-document__problem" role="alert">
                        <CircleAlert {...ICON} />
                        {linkProblem}
                    </p>
                )}
                <Tabs.Panel value="edit" keepMounted className="k-document__body">
                    <div className="k-document__fields">
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
                            missing={document.complete ? [] : document.missing}
                        />
                    </div>
                    {previewOpened && siteUrl !== null && previewPath !== null ? (
                        <div className="k-document__preview" hidden={!previewShown}>
                            <AdminPreview
                                connection={connection}
                                siteUrl={siteUrl}
                                path={previewPath}
                                onPoint={pointAt}
                                onOpen={() => void openOnSite(previewPath)}
                            />
                        </div>
                    ) : null}
                </Tabs.Panel>
                <Tabs.Panel value="versions" className="k-document__versions">
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
                        onOpen={() => setView('edit')}
                    />
                </Tabs.Panel>
            </Tabs.Root>
        </EditorContext.Provider>
    );
}
