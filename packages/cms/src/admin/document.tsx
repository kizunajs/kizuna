import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Tabs } from '@base-ui/react/tabs';
import { Toast } from '@base-ui/react/toast';
import { Check, CircleAlert, ExternalLink, Info, PanelRight, RotateCcw, Undo2 } from 'lucide-react';
import { toolsFor, type Connection, type ToolAnswer } from '../view/connection.js';
import { EditorContext, ICON, type EditorContextValue } from '../view/context.js';
import { FieldForm, fieldDomId, type FieldFormHandle, type SaveFailure, type SaveState } from '../view/form.js';
import { OwnerControl, type People } from '../view/people.js';
import { PublishReview, changeViewsOf, type AskedReview, type Changes, type PublishReviewHandle } from '../view/review.js';
import { documentTitle, valueAt, type Description, type Draft, type ReviewState } from '../view/schema.js';
import { sameContent } from '../same-content.js';
import { parseRef } from '../refs.js';
import { withMediaSite } from './connection.js';
import { ConfirmDialog } from './confirm.js';
import { blockerOf, documentDatesOf, menuEntriesOf } from './document-menu.js';
import { DocumentMore, type DocumentMoreHandle } from './document-more.js';
import { savedAtOf, type VersionSummary } from './history.js';
import { hasSites, hrefOf, navigate, siteOf } from './navigation.js';
import { SiteFact, SiteTabs } from './site-switcher.js';
import type { AdminSite } from './config.js';
import { ShowsOn } from './shows-on.js';
import { PageHeader, type Crumb } from './page-header.js';
import { LocaleTabs } from './locale-tabs.js';
import { Loading, SaveIndicator, Status, problemOf } from './parts.js';
import { documentNounOf, documentStateOf, roleSubjectOf, titleOfRef } from './access.js';
import { OfflineBadge, SaveFailedNotice, retriesSave, useOnline, useRetry, type SaveProblem } from './save-failed.js';
import { NoAccess, NotFound, shownAddress, type Way } from './states.js';
import { relativeTimeOf } from './time.js';
import { AdminPreview } from './preview-pane.js';
import { AskForReview } from './review-ask.js';
import { CommentLinks, FieldComments } from './review-comments.js';
import { DecisionCard, PeopleFact, RequestChanges, ReviewScreen, type ViewedChange } from './review-screen.js';
import { askAgainLabelOf, askAgainOf, gateNoteOf, mayUndoApproval, mayWithdraw, reviewStatusPartsOf, waitsForMe } from './review-state.js';
import { sectionLabelOf } from './sections.js';
import { ownValueCount, setsOwnValue, siteValuesRefOf } from './site-view.js';
import { useOfferUndo } from './toasts.js';
import { refreshLineOf, type Refresh } from './refresh-line.js';
import { Versions } from './versions.js';
import type { WaitingReview } from './dashboard.js';
import type { PaletteAction } from './search.js';

/**
 * What `translating` holds while the whole translation is drafted.
 */
const TRANSLATING_ALL = '*';

const NAMES = new Intl.ListFormat('en', {
    type: 'conjunction',
});

/**
 * Names as a sentence lists them: "Nils", "Nils and Kari".
 */
const listOfNames = (names: readonly string[]): string => NAMES.format(names);

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

type DocumentView = 'edit' | 'versions' | 'review';

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
    if (!retriesSave(answer.status)) {
        return {
            problem: problem?.detail ?? `The save failed (${answer.status}).`,
        };
    }
    // The header says why, and the form keeps the changes to send again.
    return {
        retry: true,
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
 * The list a document opens from, for the trail above it. A global opens
 * from the sidebar alone, so its trail is the dashboard and its title.
 */
const crumbsOf = (ref: string, collectionLabel: (name: string) => string | undefined): Crumb[] => {
    const parsed = parseRef(ref);
    if (parsed?.type === 'item') {
        return [
            {
                label: collectionLabel(parsed.collection) ?? parsed.collection,
                href: hrefOf({
                    kind: 'collection',
                    name: parsed.collection,
                    ...(parsed.site === undefined
                        ? {}
                        : {
                              site: parsed.site,
                          }),
                }),
            },
        ];
    }
    if (parsed?.type === 'page') {
        return [
            {
                label: 'Pages',
                href: hrefOf({
                    kind: 'pages',
                    ...(parsed.site === undefined
                        ? {}
                        : {
                              site: parsed.site,
                          }),
                }),
            },
        ];
    }
    return [];
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
    role,
    onSearch,
    onTitle,
    paletteActions,
    siteTabs,
    showsOn,
}: {
    connection: Connection;
    documentRef: string;
    siteUrl: string | null;
    people: People | undefined;
    waiting: readonly WaitingReview[];
    collectionLabel: (name: string) => string | undefined;
    onReviewsChanged: () => void;
    /**
     * The role the editor signed in with, which a document they may not edit names.
     */
    role: string | null;
    onSearch: () => void;
    /**
     * Hears the document's title once it loads, for the browser tab.
     */
    onTitle?: (title: string | undefined) => void;
    /**
     * Where the screen leaves what ⌘K offers while it is open: what its
     * header's buttons do as the document stands.
     */
    paletteActions?: RefObject<(() => PaletteAction[]) | undefined>;
    /**
     * The tabs of a shared document that sites set values on: Shared, and
     * each site the editor may open, with the one `documentRef` edits.
     */
    siteTabs?:
        | {
              sharedRef: string;
              sites: readonly AdminSite[];
              /**
               * The site whose values the screen edits, or `undefined` for
               * the shared ones.
               */
              current: string | undefined;
          }
        | undefined;
    /**
     * The sites an item of a collection that chooses its sites offers under
     * Shows on.
     */
    showsOn?: readonly AdminSite[] | undefined;
}) {
    const [document, setDocument] = useState<Description | undefined>();
    const [loadProblem, setLoadProblem] = useState<string | undefined>();
    const [loadStatus, setLoadStatus] = useState<number | undefined>();
    const [saveProblem, setSaveProblem] = useState<SaveProblem | undefined>();
    const [noticeOpen, setNoticeOpen] = useState(false);
    const online = useOnline();
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
    const [askOpen, setAskOpen] = useState(false);
    // The version shown beside the draft under Versions, and the one about to be restored.
    const [compared, setCompared] = useState<number | undefined>();
    const [restoring, setRestoring] = useState<number | undefined>();
    const [deciding, setDeciding] = useState(false);
    // What Translate is drafting: the whole translation, or one field's path.
    const [translating, setTranslating] = useState<string | undefined>();
    // The field whose review comments the person is replying to on the Edit tab.
    const [replyingOn, setReplyingOn] = useState<string | undefined>();
    const [draftChanges, setDraftChanges] = useState<{ changes: Changes; views: ViewedChange[] } | undefined>();
    // The document the screen last opened, so a review waiting for the person opens on its tab once.
    const opened = useRef<string | undefined>(undefined);
    const toasts = Toast.useToastManager();
    const offerUndo = useOfferUndo();
    // Undo of a restore puts back this document's draft, so it goes once the document closes.
    const closeRestoreUndo = useRef<(() => void) | undefined>(undefined);
    useEffect(() => () => closeRestoreUndo.current?.(), []);
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
    const failing = useRef<SaveProblem | undefined>(undefined);
    const retry = useCallback(() => void form.current?.flush(), []);
    const publishButton = useRef<PublishReviewHandle>(null);
    const moreMenu = useRef<DocumentMoreHandle>(null);
    // Set as the screen renders, so ⌘K reads the buttons as they stand.
    const offered = useRef<() => PaletteAction[]>(() => []);
    useEffect(() => {
        if (paletteActions === undefined) return;
        paletteActions.current = () => offered.current();
        return () => {
            paletteActions.current = undefined;
        };
    }, [paletteActions]);
    useRetry(saveProblem, online, retry);

    const describe = useCallback(
        async (ref: string, options: { remount?: boolean } = {}): Promise<Description | undefined> => {
            const answer = await connection.call<Description>('editing_describe', {
                query: {
                    ref,
                },
            });
            if (answer.status !== 200) {
                setLoadProblem(problemOf(answer, 'The CMS answered'));
                setLoadStatus(answer.status);
                return undefined;
            }
            setLoadProblem(undefined);
            setLoadStatus(undefined);
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
        setCompared(undefined);
        setDraftChanges(undefined);
        setView('edit');
        void describe(documentRef);
    }, [describe, documentRef]);

    // A review waiting for the person opens the document on its Review tab.
    useEffect(() => {
        if (document === undefined || people === undefined || opened.current === document.ref) return;
        opened.current = document.ref;
        if (waitsForMe(document.review, people.me)) setView('review');
    }, [document, people]);

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

    // What the draft changes from what is live, for the Review tab and the request.
    const reviewKey = `${document?.review?.id ?? ''}:${document?.review?.status ?? ''}`;
    useEffect(() => {
        const tools = toolsFor(documentRef);
        const fields = latest.current?.fields;
        if (tools === undefined || documentVersion === undefined || fields === undefined) return;
        let current = true;
        void (async () => {
            const answer = await connection.call<Changes>(`${tools.prefix}_changes`, {
                params: tools.params,
            });
            if (!current || answer.status !== 200) return;
            const views = await changeViewsOf(connection, documentRef, answer.body.changes, fields);
            if (current) {
                setDraftChanges({
                    changes: answer.body,
                    views,
                });
            }
        })();
        return () => {
            current = false;
        };
    }, [connection, documentRef, documentVersion, reviewKey]);

    useEffect(() => {
        if (changed.size === 0) return;
        const timer = window.setTimeout(() => setChanged(new Set()), CHANGED_MS);
        return () => window.clearTimeout(timer);
    }, [changed]);

    // A site's values carry only its own fields, so its tab takes the shared document's title.
    const [sharedTitle, setSharedTitle] = useState<string | undefined>();
    const titleRef = siteTabs?.current === undefined ? undefined : siteTabs.sharedRef;
    useEffect(() => {
        if (titleRef === undefined) return;
        let current = true;
        void connection
            .call<Description>('editing_describe', {
                query: {
                    ref: titleRef,
                },
            })
            .then((answer) => {
                if (current && answer.status === 200) setSharedTitle(documentTitle(answer.body));
            });
        return () => {
            current = false;
        };
    }, [connection, titleRef]);
    const loadedTitle = document === undefined ? undefined : titleRef === undefined ? documentTitle(document) : sharedTitle;
    useEffect(() => {
        onTitle?.(loadedTitle);
    }, [onTitle, loadedTitle]);

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
            navigate(
                hrefOf({
                    kind: 'document',
                    ref,
                })
            );
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
                    if (stillOpen && retriesSave(answer.status)) {
                        if (failing.current === undefined) setNoticeOpen(true);
                        failing.current = {
                            detail: problemOf(answer, 'The save failed'),
                            unreachable: answer.status >= 500,
                        };
                        setSaveProblem(failing.current);
                    }
                    return failureOf(answer);
                }
                if (stillOpen) {
                    failing.current = undefined;
                    setSaveProblem(undefined);
                    setNoticeOpen(false);
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

    // Each tab counts the values its site sets itself. The open tab counts what the form holds.
    const onSiteTab = siteTabs?.current !== undefined;
    const [savedCounts, setSavedCounts] = useState<Readonly<Record<string, number>>>({});
    const tabSharedRef = siteTabs?.sharedRef;
    const tabSiteKeys = siteTabs?.sites.map((site) => site.key).join(',');
    useEffect(() => {
        if (tabSharedRef === undefined || tabSiteKeys === undefined || tabSiteKeys === '') return;
        let current = true;
        void Promise.all(
            tabSiteKeys.split(',').map(async (key): Promise<[string, number]> => {
                const tools = toolsFor(siteValuesRefOf(tabSharedRef, key));
                if (tools === undefined) return [key, 0];
                const answer = await connection.call<Draft>(`${tools.prefix}_get_draft`, {
                    params: tools.params,
                });
                return [key, answer.status === 200 ? ownValueCount(answer.body.content) : 0];
            })
        ).then((counted) => {
            if (current) setSavedCounts(Object.fromEntries(counted));
        });
        return () => {
            current = false;
        };
    }, [connection, tabSharedRef, tabSiteKeys]);
    const siteCounts =
        siteTabs?.current === undefined || document === undefined
            ? savedCounts
            : {
                  ...savedCounts,
                  [siteTabs.current]: ownValueCount(document.draft),
              };

    /**
     * Clears a value the site sets itself, so the site shows the shared one.
     */
    const clearToShared = async (path: string): Promise<void> => {
        const current = latest.current;
        if (current === undefined) return;
        await form.current?.flush();
        const failure = await save(current.ref, {
            [path]: null,
        });
        if (failure === undefined) {
            await describe(current.ref);
        }
    };

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
            // A site's own document picks among the site's images and the shared ones, and shared content among shared images alone.
            connection: withMediaSite(connection, parseRef(documentRef)?.site),
            resolveUrl,
            pageUrl: siteUrl === null || documentPath === undefined ? undefined : new URL(documentPath, siteUrl).toString(),
            offerUndo,
        }),
        [connection, documentRef, resolveUrl, siteUrl, documentPath, offerUndo]
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

    const crumbs = crumbsOf(documentRef, collectionLabel);

    /**
     * Approves the review waiting for the person, or sends it back with a
     * note. Says whether the answer went through.
     */
    const decide = async (decision: 'approve' | 'requestChanges', note: string | undefined): Promise<boolean> => {
        const current = latest.current;
        if (current?.review === null || current?.review === undefined) return false;
        setDeciding(true);
        setLinkProblem(undefined);
        // The person answered on the Review tab, so the route runs without asking again.
        const answer = await connection.call(
            'editing_reviews_decide',
            {
                body: {
                    ids: [current.review.id],
                    decision,
                    ...(note === undefined
                        ? {}
                        : {
                              note,
                          }),
                },
            },
            {
                approved: true,
            }
        );
        setDeciding(false);
        if (answer.status !== 200) {
            setLinkProblem(problemOf(answer, 'The answer did not save'));
            return false;
        }
        onReviewsChanged();
        await describe(current.ref, {
            remount: false,
        });
        return true;
    };

    /**
     * Says who was just asked for a review, with Withdraw, which takes the
     * request back.
     */
    const confirmAsked = (asked: AskedReview): void => {
        const id: string = toasts.add({
            description: asked.names.length === 0 ? 'Asked for review' : `Asked ${listOfNames(asked.names)} for review`,
            ...(asked.ids.length === 0
                ? {}
                : {
                      actionProps: {
                          children: 'Withdraw',
                          onClick: () => {
                              toasts.close(id);
                              void connection
                                  .call('editing_reviews_withdraw', {
                                      body: {
                                          ids: asked.ids,
                                      },
                                  })
                                  .then(() => {
                                      onReviewsChanged();
                                      const current = latest.current;
                                      if (current !== undefined) {
                                          void describe(current.ref, {
                                              remount: false,
                                          });
                                      }
                                  });
                          },
                      },
                  }),
        });
    };

    /**
     * Withdraws the review the person asked for, or undoes their approval of
     * it, so it waits for an answer again.
     */
    const changeReview = async (change: 'withdraw' | 'reopen'): Promise<void> => {
        const current = latest.current;
        if (current?.review === null || current?.review === undefined) return;
        setDeciding(true);
        setLinkProblem(undefined);
        const answer = await connection.call(`editing_reviews_${change}`, {
            body: {
                ids: [current.review.id],
            },
        });
        setDeciding(false);
        if (answer.status !== 200) {
            setLinkProblem(problemOf(answer, change === 'withdraw' ? 'The request was not withdrawn' : 'The approval was not undone'));
            return;
        }
        onReviewsChanged();
        await describe(current.ref, {
            remount: false,
        });
    };

    /**
     * Shows a review as a comment or a resolve left it.
     */
    const reviewChanged = (review: ReviewState): void =>
        setDocument((previous) =>
            previous === undefined || previous.review?.id !== review.id
                ? previous
                : {
                      ...previous,
                      review,
                  }
        );

    /**
     * Says how the sites and partners that show the document took its
     * publish, once their refreshes ran or a few seconds passed.
     */
    const reportRefreshes = async (ref: string): Promise<void> => {
        if (!hasSites()) return;
        let line: string | undefined;
        for (const wait of [1000, 2000, 4000]) {
            await new Promise((resolve) => setTimeout(resolve, wait));
            const answer = await connection.call<{ refreshes: Refresh[] }>('editing_refreshes', {
                query: {
                    ref,
                },
            });
            if (answer.status !== 200) return;
            line = refreshLineOf(answer.body.refreshes);
            if (!answer.body.refreshes.some((refresh) => refresh.status === 'queued')) break;
        }
        if (line !== undefined) {
            toasts.add({
                description: line,
            });
        }
    };

    /**
     * Sends the draft back to whoever asked for changes, once they are made.
     */
    const askAgain = async (person: { id: string; name: string }): Promise<void> => {
        const current = latest.current;
        if (current === undefined) return;
        await form.current?.flush();
        setDeciding(true);
        setLinkProblem(undefined);
        const answer = await connection.call('editing_reviews_request', {
            body: {
                refs: [current.ref],
                reviewers: [person.id],
            },
        });
        setDeciding(false);
        if (answer.status !== 201) {
            setLinkProblem(problemOf(answer, 'The request was not sent'));
            return;
        }
        toasts.add({
            description: `Sent to ${person.name.split(' ')[0]}.`,
        });
        onReviewsChanged();
        await describe(current.ref, {
            remount: false,
        });
    };

    /**
     * Drafts the translation from the published source, or one field of it.
     */
    const translate = async (field?: string): Promise<void> => {
        const tools = toolsFor(documentRef);
        if (tools === undefined) return;
        await form.current?.flush();
        setTranslating(field ?? TRANSLATING_ALL);
        setLinkProblem(undefined);
        const answer = await connection.call(`${tools.prefix}_translate`, {
            params: tools.params,
            body:
                field === undefined
                    ? {}
                    : {
                          fields: [field],
                      },
        });
        setTranslating(undefined);
        if (answer.status !== 200) {
            setLinkProblem(problemOf(answer, 'The translation failed'));
            return;
        }
        await describe(documentRef);
    };

    /**
     * Makes an earlier version the draft, once the person confirmed. Undo
     * restores the draft it replaced, which is the latest version, until the
     * draft changes again.
     */
    const restore = async (version: number, undoing = false): Promise<void> => {
        setRestoring(undefined);
        const tools = toolsFor(documentRef);
        if (tools === undefined) return;
        setLinkProblem(undefined);
        const replaced = latest.current?.version;
        const answer = await connection.call(`${tools.prefix}_rollback`, {
            params: tools.params,
            body: {
                version,
            },
        });
        if (answer.status !== 200) {
            setLinkProblem(problemOf(answer, undoing ? 'The draft was not put back' : 'The version was not restored'));
            return;
        }
        setCompared(undefined);
        const restored = await describe(documentRef);
        if (undoing) {
            toasts.add({
                description: 'Put back the draft you had.',
            });
            return;
        }
        if (replaced === undefined || restored === undefined) {
            toasts.add({
                description: `Restored version ${version} as the draft.`,
            });
            return;
        }
        const savesAtRestore = saves.current;
        closeRestoreUndo.current = offerUndo(`Restored version ${version} as the draft.`, () => {
            const current = latest.current;
            if (current?.ref !== restored.ref || current.version !== restored.version || saves.current !== savesAtRestore) {
                setLinkProblem(`The draft changed after the restore. Restore version ${replaced} under Versions to go back to it.`);
                return;
            }
            void restore(replaced, true);
        });
    };

    const { noun, list } = documentNounOf(documentRef, collectionLabel);
    const back: Way =
        list === undefined
            ? {
                  label: 'Go to the dashboard',
                  href: hrefOf({
                      kind: 'dashboard',
                  }),
              }
            : {
                  label: `Go to ${list.label}`,
                  href: hrefOf(
                      list.collection === undefined
                          ? {
                                kind: 'pages',
                            }
                          : {
                                kind: 'collection',
                                name: list.collection,
                            }
                  ),
              };
    offered.current = () => [];
    const state =
        loadStatus === 404
            ? 'not-found'
            : loadStatus === 403
              ? 'no-access'
              : document === undefined
                ? undefined
                : siteTabs?.current !== undefined
                  ? 'open'
                  : documentStateOf(document);
    if (state === 'not-found') {
        const capitalised = `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`;
        return (
            <div className="k-document">
                <PageHeader
                    crumbs={crumbs}
                    title={`${capitalised} not found`}
                    meta={[
                        {
                            label: 'Address',
                            value: shownAddress(),
                        },
                    ]}
                />
                <NotFound noun={noun} back={back} onSearch={onSearch} />
            </div>
        );
    }
    if (state === 'no-access') {
        const shownTitle = document === undefined ? titleOfRef(documentRef) : documentTitle(document);
        return (
            <div className="k-document">
                <PageHeader
                    crumbs={crumbs}
                    title={shownTitle}
                    meta={
                        document === undefined
                            ? undefined
                            : [
                                  {
                                      label: 'Status',
                                      value: STATUS_FACT[document.status] ?? document.status,
                                  },
                              ]
                    }
                />
                <NoAccess title={shownTitle} role={roleSubjectOf(role)} back={back} />
            </div>
        );
    }

    if (document === undefined) {
        return (
            <div className="k-document">
                <PageHeader crumbs={crumbs} title="" />
                <div className="k-admin__body">
                    <Loading problem={loadProblem} />
                </div>
            </div>
        );
    }

    const title = loadedTitle ?? '';
    const me = people?.me;
    // A review that went away, once its draft was published, takes its tab with it.
    const shownView: DocumentView = view === 'review' && document.review === null ? 'edit' : view;
    const comparing = shownView === 'versions' && compared !== undefined;
    const answering = shownView === 'review' && waitsForMe(document.review, me);
    const sentBackBy = askAgainOf(document.review, me);
    // Someone asked to review it, or who answered, opens the changes from Review beside Publish.
    const reviewer =
        document.review !== null && (document.review.reviewers.some((person) => person.id === me) || document.review.decidedBy?.id === me);
    // The reviewer who sent it back already knows what Publish waits for.
    const gateNote = document.review?.decidedBy?.id === me ? undefined : gateNoteOf(document.requireReview, document.review);
    const canPublishPast = draftChanges?.changes.canPublishPastReview ?? false;
    const previewPath = siteUrl === null ? null : document.previewPath;
    // A document that stops showing on a page, after a change or a reload, loses the preview.
    const previewShown = previewOn && previewPath !== null && shownView === 'edit';
    const unsaved = saveState === 'pending' || saveState === 'saving';
    const blocker = document.complete ? undefined : blockerOf(document.missing, document.fields);
    const askable = people !== undefined && people.people.some((person) => person.id !== people.me);
    const updatedByPerson = updatedBy === null ? undefined : people?.people.find((person) => person.id === updatedBy);
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
                    <Popover.Popup className="k-popup k-document-info" aria-label="Document info">
                        <dl className="k-document-info__list">
                            <dt>Status</dt>
                            <dd>
                                <Status status={document.status} />
                            </dd>
                            {owner === null ? null : (
                                <>
                                    <dt>Owner</dt>
                                    <dd>{owner}</dd>
                                </>
                            )}
                            {siteUrl === null || document.path === null ? null : (
                                <>
                                    <dt>Page</dt>
                                    <dd>
                                        <button
                                            type="button"
                                            className="k-document-info__link"
                                            onClick={() => void openOnSite(document.path!)}>
                                            <span className="k-ellipsis">{document.path}</span>
                                            <ExternalLink {...ICON} />
                                        </button>
                                    </dd>
                                </>
                            )}
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

    const more = (
        <DocumentMore
            ref={moreMenu}
            connection={connection}
            document={document}
            title={title}
            askable={askable}
            onAsk={() => {
                void form.current?.flush().then(() => setAskOpen(true));
            }}
            onChanged={() =>
                void describe(document.ref, {
                    remount: false,
                })
            }
            onProblem={setLinkProblem}
        />
    );

    const normalHeader = !comparing && !answering;
    const publishShown = normalHeader && document.canPublish && !(sentBackBy !== undefined && document.requireReview && !canPublishPast);
    // Shared content the editor drafts goes to an admin over every site, so asking takes Publish's place.
    const askShown =
        normalHeader &&
        !document.canPublish &&
        askable &&
        sentBackBy === undefined &&
        document.review?.status !== 'open' &&
        (document.status === 'draft' || document.status === 'changed');
    const publishDisabled = !online || unsaved || saveState === 'failed' || (blocker !== undefined && waiting.length === 0);
    const saveDraftOffered = normalHeader && shownView !== 'review' && saveProblem === undefined && saveState === 'pending';
    offered.current = () => {
        const actions: PaletteAction[] = [];
        if (publishShown && !publishDisabled && blocker === undefined) {
            actions.push({
                label: 'Publish',
                run: () => publishButton.current?.open(),
            });
        }
        if (saveDraftOffered) {
            actions.push({
                label: 'Save draft',
                run: () => void form.current?.flush(),
            });
        }
        // The `…` menu's entries run through the menu, which asks first where it asks.
        const entries = menuEntriesOf({
            kind: document.kind,
            status: document.status,
            askable,
            actions: document.actions,
        });
        const ask = entries.find((entry) => entry.kind === 'ask');
        if (ask !== undefined) {
            actions.push({
                label: ask.label,
                run: () => moreMenu.current?.choose(ask),
            });
        }
        if (siteUrl !== null && document.path !== null) {
            const path = document.path;
            actions.push({
                label: 'Open on the site',
                run: () => void openOnSite(path),
            });
        }
        for (const entry of entries) {
            if (entry.kind !== 'action') continue;
            actions.push({
                label: entry.label,
                run: () => moreMenu.current?.choose(entry),
            });
        }
        return actions;
    };

    const fieldLabelOf = (path: string): string => sectionLabelOf(document.fields, document.layout, path, path);
    const ownSite = parseRef(document.ref)?.site;
    const siteFact = hasSites() ? <SiteFact site={siteOf(ownSite)} /> : undefined;
    // The note of whoever sent the draft back, and the open comments, at the top of the sidebar while the changes are made.
    const sentBackNote = document.review?.status === 'changes' && document.review.decisionNote !== null;
    const openComments = document.review?.comments.some((comment) => comment.resolvedAt === null) ?? false;
    const reviewAside =
        document.review !== null && (sentBackNote || openComments) ? (
            <section className="k-review-aside" aria-label="Review">
                <h2 className="k-review-screen__heading">Review</h2>
                {sentBackNote ? <DecisionCard review={document.review} me={me} now={now} /> : null}
                <CommentLinks review={document.review} labelOf={fieldLabelOf} me={me} now={now} onShow={(path) => setPointed(path)} />
            </section>
        ) : undefined;

    return (
        <EditorContext.Provider value={editorContext}>
            <Tabs.Root
                value={shownView}
                onValueChange={(key: DocumentView) => {
                    setView(key);
                    if (key !== 'versions') setCompared(undefined);
                }}
                className="k-document"
                data-preview={previewShown}>
                <PageHeader
                    crumbs={crumbs}
                    title={title}
                    meta={[
                        {
                            label: 'Status',
                            value:
                                saveProblem !== undefined ? (
                                    'Unsaved changes'
                                ) : document.review === null ? (
                                    (STATUS_FACT[document.status] ?? document.status)
                                ) : (
                                    <PeopleFact {...reviewStatusPartsOf(document.review, me)} />
                                ),
                        },
                        shownView === 'review' && document.review !== null
                            ? {
                                  label: 'Requested',
                                  value: (
                                      <PeopleFact
                                          lead={`${relativeTimeOf(document.review.createdAt, now)} by`}
                                          people={[document.review.requestedBy]}
                                      />
                                  ),
                              }
                            : updatedAt === null
                              ? null
                              : {
                                    label: 'Updated',
                                    value:
                                        updatedByPerson === undefined ? (
                                            relativeTimeOf(updatedAt, now)
                                        ) : (
                                            <PeopleFact lead={`${relativeTimeOf(updatedAt, now)} by`} people={[updatedByPerson]} />
                                        ),
                                },
                        owner === null
                            ? null
                            : {
                                  label: 'Owner',
                                  value: owner,
                              },
                        document.usedOn.everywhere
                            ? {
                                  label: 'Shows on',
                                  value: 'every page',
                              }
                            : null,
                        document.usedOn.partners.length === 0
                            ? null
                            : {
                                  label: 'Partners',
                                  value: document.usedOn.partners.map((partner) => partner.label).join(', '),
                              },
                        siteFact === undefined
                            ? null
                            : {
                                  label: 'Site',
                                  value: siteFact,
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
                            <span className="k-document__spacer" />
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
                                    <span className="k-document__long">Live Preview</span>
                                    <span className="k-document__short">Preview</span>
                                </button>
                            )}
                            {info}
                        </>
                    }
                    actions={
                        comparing ? (
                            <>
                                <button
                                    type="button"
                                    className="k-button k-button--primary"
                                    disabled={unsaved}
                                    onClick={() => setRestoring(compared)}>
                                    <RotateCcw {...ICON} />
                                    Restore this version
                                </button>
                                {more}
                            </>
                        ) : answering && document.review !== null ? (
                            <>
                                <RequestChanges
                                    review={document.review}
                                    busy={deciding}
                                    onSend={(note) => decide('requestChanges', note)}
                                />
                                <button
                                    type="button"
                                    className="k-button k-button--primary"
                                    disabled={deciding}
                                    onClick={() => void decide('approve', undefined)}>
                                    <Check {...ICON} />
                                    {deciding ? 'Approving' : 'Approve'}
                                </button>
                                {more}
                            </>
                        ) : (
                            <>
                                {online ? null : <OfflineBadge />}
                                {saveProblem === undefined ? <SaveIndicator state={saveState} /> : null}
                                {blocker === undefined ? null : (
                                    <button type="button" className="k-document__blocker" id="k-document-blocker" onClick={showBlocker}>
                                        <CircleAlert {...ICON} />
                                        {blocker}
                                    </button>
                                )}
                                {blocker !== undefined || gateNote === undefined ? null : (
                                    <span className="k-document__gate">{gateNote}</span>
                                )}
                                {shownView === 'review' ? null : saveProblem === undefined ? (
                                    <button
                                        type="button"
                                        className="k-button k-button--secondary k-button--small"
                                        disabled={saveState !== 'pending'}
                                        onClick={() => void form.current?.flush()}>
                                        Save draft
                                    </button>
                                ) : (
                                    <SaveFailedNotice
                                        problem={saveProblem}
                                        offline={!online}
                                        saving={saveState === 'saving'}
                                        open={noticeOpen}
                                        onOpenChange={setNoticeOpen}
                                        onRetry={retry}
                                    />
                                )}
                                {sentBackBy === undefined ? null : (
                                    <button
                                        type="button"
                                        className="k-button k-button--primary"
                                        disabled={deciding || unsaved || saveState === 'failed'}
                                        onClick={() => void askAgain(sentBackBy)}>
                                        {askAgainLabelOf(sentBackBy)}
                                    </button>
                                )}
                                {mayWithdraw(document.review, me) ? (
                                    <button
                                        type="button"
                                        className="k-button k-button--secondary"
                                        disabled={deciding}
                                        onClick={() => void changeReview('withdraw')}>
                                        Withdraw request
                                    </button>
                                ) : null}
                                {mayUndoApproval(document.review, me) ? (
                                    <button
                                        type="button"
                                        className="k-button k-button--secondary"
                                        disabled={deciding}
                                        onClick={() => void changeReview('reopen')}>
                                        Undo approval
                                    </button>
                                ) : null}
                                {reviewer ? (
                                    <button
                                        type="button"
                                        className="k-button k-button--secondary"
                                        aria-pressed={shownView === 'review'}
                                        onClick={() => setView(shownView === 'review' ? 'edit' : 'review')}>
                                        Review
                                    </button>
                                ) : null}
                                {!askShown ? null : (
                                    <button
                                        type="button"
                                        className="k-button k-button--primary"
                                        disabled={!online || saveState === 'failed'}
                                        onClick={() => void form.current?.flush().then(() => setAskOpen(true))}>
                                        Ask for review
                                    </button>
                                )}
                                {!publishShown ? null : (
                                    <PublishReview
                                        ref={publishButton}
                                        connection={connection}
                                        candidates={reviewCandidates}
                                        people={people}
                                        waiting={waiting.filter((entry) => entry.ref !== document.ref).length}
                                        everywhere={document.usedOn.everywhere}
                                        secondary={sentBackBy !== undefined}
                                        disabled={publishDisabled}
                                        describedBy={blocker === undefined ? undefined : 'k-document-blocker'}
                                        onChanged={(refs) => {
                                            onReviewsChanged();
                                            if (refs.includes(document.ref)) void describe(document.ref);
                                        }}
                                        onPublished={() => void reportRefreshes(document.ref)}
                                        onAsked={confirmAsked}
                                    />
                                )}
                                {more}
                            </>
                        )
                    }
                />
                {siteTabs === undefined ? null : (
                    <SiteTabs documentRef={siteTabs.sharedRef} sites={siteTabs.sites} current={siteTabs.current} counts={siteCounts} />
                )}
                {document.locale === undefined ? null : (
                    <LocaleTabs
                        documentRef={document.ref}
                        locales={document.locale}
                        onTranslate={document.locale.translate === true ? () => void translate() : undefined}
                        translating={translating === TRANSLATING_ALL}
                    />
                )}
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
                            locales={document.locale}
                            onTranslate={document.locale?.translate === true ? (field) => void translate(field.path) : undefined}
                            translating={translating}
                            aside={reviewAside}
                            controlFor={(field, input) =>
                                showsOn !== undefined && field.path === 'showsOn' ? <ShowsOn sites={showsOn} input={input} /> : undefined
                            }
                            below={(field) => (
                                <>
                                    {onSiteTab &&
                                    field.parent === undefined &&
                                    field.writable &&
                                    setsOwnValue(document.draft, field.path) ? (
                                        <button
                                            type="button"
                                            className="k-text-button k-use-shared"
                                            onClick={() => void clearToShared(field.path)}>
                                            <Undo2 {...ICON} />
                                            Use shared
                                        </button>
                                    ) : null}
                                    {document.review === null ? null : (
                                        <FieldComments
                                            review={document.review}
                                            path={field.path}
                                            label={fieldLabelOf(field.path)}
                                            me={me}
                                            now={now}
                                            connection={connection}
                                            composing={replyingOn === field.path}
                                            onComposingChange={(next) => setReplyingOn(next ? field.path : undefined)}
                                            onChanged={reviewChanged}
                                        />
                                    )}
                                </>
                            )}
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
                <Tabs.Panel value="versions" className="k-document__versions" data-comparing={comparing || undefined}>
                    <Versions
                        connection={connection}
                        documentRef={document.ref}
                        version={document.version}
                        fields={document.fields}
                        layout={document.layout}
                        draft={document.draft}
                        people={people}
                        disabled={unsaved}
                        compared={compared}
                        onCompare={setCompared}
                        onRestore={setRestoring}
                        onOpen={() => setView('edit')}
                    />
                </Tabs.Panel>
                {document.review === null ? null : (
                    <Tabs.Panel value="review" className="k-document__review">
                        <ReviewScreen
                            review={document.review}
                            changes={draftChanges?.views}
                            fields={document.fields}
                            layout={document.layout}
                            me={me}
                            now={now}
                            savedAt={updatedAt}
                            liveSince={dates.published}
                            onOpenOnSite={siteUrl === null || document.path === null ? undefined : () => void openOnSite(document.path!)}
                            connection={connection}
                            onReviewChanged={reviewChanged}
                        />
                    </Tabs.Panel>
                )}
                <AskForReview
                    open={askOpen}
                    onOpenChange={setAskOpen}
                    connection={connection}
                    documentRef={document.ref}
                    owner={document.owner}
                    people={people}
                    changeCount={draftChanges?.views.length}
                    onSent={(asked) => {
                        onReviewsChanged();
                        void describe(document.ref, {
                            remount: false,
                        });
                        confirmAsked(asked);
                    }}
                />
                <ConfirmDialog
                    confirming={
                        restoring === undefined
                            ? undefined
                            : {
                                  label: 'Restore as draft',
                                  question: `Restore version ${restoring}? Its content replaces the current draft. The live page stays as it is until someone publishes, and the draft you have now is kept under Versions.`,
                              }
                    }
                    onConfirm={() => {
                        if (restoring !== undefined) void restore(restoring);
                    }}
                    onCancel={() => setRestoring(undefined)}
                />
            </Tabs.Root>
        </EditorContext.Provider>
    );
}
