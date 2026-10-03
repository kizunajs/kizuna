import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import type { App, McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import { Check, CircleAlert, ExternalLink, LoaderCircle, Maximize2, Minimize2 } from 'lucide-react';
import { envelope, openEnvelope, type EditorMessage, type PreviewMessage } from '../preview-messages.js';
import { connect, toolsFor, type ToolAnswer } from './connection.js';
import { EditorContext, ICON, type EditorContextValue } from './context.js';
import { FieldForm, type SaveFailure, type SaveState } from './form.js';
import type { HostEvents } from './host.js';
import { Logo } from './logo.js';
import { PreviewPane, type PreviewMode } from './preview.js';
import { documentTitle, fieldHolding, labelOf, valueAt, type Description, type Draft } from './schema.js';

/**
 * How often the editor checks whether the model, or anyone else, changed the
 * draft it shows.
 */
const POLL_MS = 3000;

/**
 * How long a field someone else changed stays marked.
 */
const CHANGED_MS = 4000;

export interface DocumentViewProps {
    app: App;
    events: HostEvents;
    siteUrl: string | null;
}

interface Problem {
    detail?: string;
    errors?: Array<{
        path: Array<string | number>;
        message: string;
    }>;
}

const STATUS_LABEL: Record<Description['status'], string> = {
    empty: 'Not published',
    draft: 'Draft',
    published: 'Published',
    changed: 'Unpublished changes',
};

const isPending = (document: Description): boolean => document.status === 'draft' || document.status === 'changed';

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

/**
 * The top-level fields whose values differ between two drafts.
 */
const changedPaths = (document: Description, before: Record<string, unknown> | null, after: Record<string, unknown> | null): Set<string> =>
    new Set(
        document.fields
            .filter((field) => field.parent === undefined)
            .filter((field) => JSON.stringify(valueAt(before, field.path)) !== JSON.stringify(valueAt(after, field.path)))
            .map((field) => field.path)
    );

/**
 * The editor: one document's fields, with the site's draft beside them when
 * the host shows it fullscreen.
 */
export function DocumentView({ app, events, siteUrl }: DocumentViewProps) {
    const connection = useMemo(() => connect(app), [app]);
    const [host, setHost] = useState<McpUiHostContext | undefined>(() => app.getHostContext());
    const [document, setDocument] = useState<Description | undefined>();
    const [loadProblem, setLoadProblem] = useState<string | undefined>();
    const [saveState, setSaveState] = useState<SaveState>('idle');
    const [formKey, setFormKey] = useState(0);
    const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());
    const [pointed, setPointed] = useState<string | undefined>();
    const [framedPath, setFramedPath] = useState<string | undefined>();
    const [previewUrl, setPreviewUrl] = useState<string | undefined>();
    const [previewProblem, setPreviewProblem] = useState<string | undefined>();
    const [publishing, setPublishing] = useState(false);
    const [publishProblem, setPublishProblem] = useState<string | undefined>();
    const [publishBusy, setPublishBusy] = useState(false);
    const [previewMode, setPreviewMode] = useState<PreviewMode>('point');
    const frame = useRef<HTMLIFrameElement>(null);
    const seen = useRef<string | null>(null);
    const busy = useRef(false);
    const latest = useRef<Description | undefined>(undefined);
    latest.current = document;
    const context = useRef<{ pointing?: string; edits?: string }>({});

    const fullscreen = host?.displayMode === 'fullscreen';
    const canFullscreen = host?.availableDisplayModes?.includes('fullscreen') ?? false;

    useEffect(
        () =>
            events.onContextChanged((changes) =>
                setHost((previous) => ({
                    ...previous,
                    ...changes,
                }))
            ),
        [events]
    );

    useEffect(() => {
        const theme = host?.theme ?? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
        window.document.documentElement.dataset['theme'] = theme;
    }, [host?.theme]);

    useEffect(() => {
        window.document.documentElement.dataset['display'] = fullscreen ? 'fullscreen' : 'inline';
    }, [fullscreen]);

    const resolveUrl = useCallback(
        (url: string): string | undefined => {
            try {
                return new URL(url, siteUrl ?? undefined).toString();
            } catch {
                return undefined;
            }
        },
        [siteUrl]
    );
    const editorContext = useMemo<EditorContextValue>(
        () => ({
            connection,
            resolveUrl,
        }),
        [connection, resolveUrl]
    );

    const tellPreview = useCallback(
        (message: EditorMessage) => {
            if (siteUrl === null) return;
            frame.current?.contentWindow?.postMessage(envelope(message), siteUrl);
        },
        [siteUrl]
    );

    /**
     * What the model knows about the editor: what the person points at, and
     * what they changed by hand.
     */
    const tellModel = useCallback(
        (update: { pointing?: string; edits?: string }) => {
            context.current = {
                ...context.current,
                ...update,
            };
            const text = [context.current.pointing, context.current.edits].filter((part) => part !== undefined).join('\n');
            if (text === '') return;
            void app
                .updateModelContext({
                    content: [
                        {
                            type: 'text',
                            text,
                        },
                    ],
                })
                .catch(() => undefined);
        },
        [app]
    );

    const describe = useCallback(
        async (query: { ref?: string; url?: string }): Promise<Description | undefined> => {
            const answer = await connection.call<Description>('editing_describe', {
                query,
            });
            if (answer.status !== 200) {
                setLoadProblem((answer.body as Problem | undefined)?.detail ?? `The CMS answered ${answer.status}.`);
                return undefined;
            }
            setLoadProblem(undefined);
            setDocument(answer.body);
            setFormKey((key) => key + 1);
            seen.current = null;
            return answer.body;
        },
        [connection]
    );

    // The tool call that opened the editor names the document.
    useEffect(() => {
        const open = (result: { structuredContent?: unknown }): void => {
            const answer = result.structuredContent as ToolAnswer<Partial<Description> & Partial<Draft>> | undefined;
            const body = answer?.body;
            if (answer === undefined || answer.status >= 400 || body === undefined) {
                setLoadProblem('The tool did not answer with a document.');
                return;
            }
            if (Array.isArray(body.fields)) {
                setDocument(body as Description);
                setFormKey((key) => key + 1);
                return;
            }
            if (typeof body.ref === 'string') {
                void describe({
                    ref: body.ref,
                });
            }
        };
        const arrived = events.toolResult();
        if (arrived !== undefined) open(arrived);
        return events.onToolResult(open);
    }, [events, describe]);

    // Picks up what the model, or another editor, saves while this one is open.
    useEffect(() => {
        if (document === undefined) return;
        const tools = toolsFor(document.ref);
        if (tools === undefined) return;
        const check = async (): Promise<void> => {
            if (busy.current || window.document.visibilityState !== 'visible') return;
            const answer = await connection.call<Draft>(`${tools.prefix}_get_draft`, {
                params: tools.params,
            });
            if (answer.status !== 200) return;
            const marker = answer.body.updatedAt;
            if (seen.current === null) {
                seen.current = marker;
                return;
            }
            if (marker === seen.current || busy.current) return;
            seen.current = marker;
            const before = latest.current;
            const after = await describe({
                ref: document.ref,
            });
            if (before === undefined || after === undefined) return;
            setChanged(changedPaths(after, before.draft, after.draft));
            tellPreview({
                type: 'refresh',
            });
        };
        const timer = window.setInterval(() => void check(), POLL_MS);
        void check();
        return () => window.clearInterval(timer);
    }, [connection, describe, document?.ref, tellPreview]);

    useEffect(() => {
        if (changed.size === 0) return;
        const timer = window.setTimeout(() => setChanged(new Set()), CHANGED_MS);
        return () => window.clearTimeout(timer);
    }, [changed]);

    // Saves into the document the form was showing, which may no longer be the open one when a form flushes on its way out.
    const save = useCallback(
        async (ref: string, fields: Description['fields'], changes: Record<string, unknown>): Promise<SaveFailure | undefined> => {
            const tools = toolsFor(ref);
            if (tools === undefined) {
                return {
                    problem: 'No document is open.',
                };
            }
            busy.current = true;
            try {
                // The person typed it, so a global's approval is theirs already.
                const answer = await connection.call<Draft>(
                    `${tools.prefix}_update_draft`,
                    {
                        params: tools.params,
                        body: {
                            changes,
                            autosave: true,
                        },
                    },
                    {
                        approved: true,
                    }
                );
                const current = latest.current;
                const stillOpen = current?.ref === ref;
                if (answer.status !== 200) {
                    if (answer.status === 409 && stillOpen) {
                        void describe({
                            ref,
                        });
                    }
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
                tellPreview({
                    type: 'refresh',
                });
                const labels = Object.keys(changes).map((path) => {
                    const field = fieldHolding(fields, path);
                    return field === undefined ? path : labelOf(field);
                });
                tellModel({
                    edits: `The person edited ${labels.join(', ')} on ${answer.body.name} (${ref}) by hand. The draft now holds: ${JSON.stringify(changes)}`,
                });
                return undefined;
            } finally {
                busy.current = false;
            }
        },
        [connection, describe, tellModel, tellPreview]
    );

    const publish = async (): Promise<void> => {
        const current = latest.current;
        const tools = current === undefined ? undefined : toolsFor(current.ref);
        if (current === undefined || tools === undefined || publishBusy) return;
        setPublishProblem(undefined);
        setPublishBusy(true);
        const answer = await connection.call<Draft>(
            `${tools.prefix}_publish`,
            {
                params: tools.params,
                body: {},
            },
            {
                approved: true,
            }
        );
        setPublishBusy(false);
        if (answer.status !== 200) {
            setPublishProblem((answer.body as Problem | undefined)?.detail ?? `Publishing failed (${answer.status}).`);
            return;
        }
        seen.current = answer.body.updatedAt;
        setDocument({
            ...current,
            status: answer.body.status,
            version: answer.body.version,
        });
        setPublishing(false);
        tellPreview({
            type: 'refresh',
        });
        tellModel({
            edits: `The person published ${documentTitle(current)} (${current.ref}).`,
        });
    };

    const mintPreview = useCallback(
        async (path: string): Promise<string | undefined> => {
            const answer = await connection.call<{ url: string }>('editing_create_preview', {
                body: {
                    path,
                },
            });
            if (answer.status !== 200) {
                setPreviewProblem((answer.body as Problem | undefined)?.detail ?? 'The draft could not be opened.');
                return undefined;
            }
            setPreviewProblem(undefined);
            return answer.body.url;
        },
        [connection]
    );

    const pagePath = document?.path ?? framedPath ?? '/';

    // Opening fullscreen frames the site on the page being edited.
    useEffect(() => {
        if (!fullscreen || previewUrl !== undefined) return;
        void mintPreview(pagePath).then(setPreviewUrl);
    }, [fullscreen, previewUrl, pagePath, mintPreview]);

    // What the framed site says: where it went, what was clicked, and when its cookie runs out.
    useEffect(() => {
        if (siteUrl === null) return;
        const listener = (event: MessageEvent): void => {
            if (event.origin !== siteUrl || event.source !== frame.current?.contentWindow) return;
            const message = openEnvelope<PreviewMessage>(event.data);
            if (message === undefined) return;
            if (message.type === 'navigated') {
                setFramedPath(message.path);
                tellPreview({
                    type: 'mode',
                    mode: previewMode,
                });
                const current = latest.current;
                if (current?.kind === 'page' && current.path === message.path) return;
                void describe({
                    url: message.path,
                });
                return;
            }
            if (message.type === 'renew') {
                void mintPreview(framedPath ?? pagePath).then((url) => {
                    if (url !== undefined) {
                        tellPreview({
                            type: 'renew',
                            url,
                        });
                    }
                });
                return;
            }
            const point = async (): Promise<void> => {
                let current = latest.current;
                const wanted = message.ref ?? undefined;
                if (wanted !== undefined && current?.ref !== wanted) {
                    current = await describe({
                        ref: wanted,
                    });
                }
                if (wanted === undefined && (current?.kind !== 'page' || current.path !== framedPath)) {
                    current = await describe({
                        url: framedPath ?? '/',
                    });
                }
                if (current === undefined) return;
                setPointed(message.path);
                const field = fieldHolding(current.fields, message.path);
                tellModel({
                    pointing: `The person is pointing at ${field === undefined ? message.path : labelOf(field)} on ${documentTitle(current)} (ref ${current.ref}, path ${message.path}). Its value: ${JSON.stringify(valueAt(current.draft, message.path) ?? null)}`,
                });
            };
            void point();
        };
        window.addEventListener('message', listener);
        return () => window.removeEventListener('message', listener);
    }, [siteUrl, describe, mintPreview, tellModel, tellPreview, framedPath, pagePath, previewMode]);

    const openInTab = async (): Promise<void> => {
        const url = await mintPreview(pagePath);
        if (url !== undefined) {
            await app
                .openLink({
                    url,
                })
                .catch(() => undefined);
        }
    };

    const toggleFullscreen = (): void => {
        void app
            .requestDisplayMode({
                mode: fullscreen ? 'inline' : 'fullscreen',
            })
            .then((result) =>
                setHost((previous) => ({
                    ...previous,
                    displayMode: result.mode,
                }))
            );
    };

    if (document === undefined) {
        return (
            <div className="k-shell">
                <Header />
                <div className="k-empty">
                    {loadProblem === undefined ? (
                        <LoaderCircle {...ICON} className="k-spin" />
                    ) : (
                        <p className="k-error">
                            <CircleAlert {...ICON} />
                            {loadProblem}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    const form = (
        <div className="k-pane">
            {document.usedOn.everywhere || document.usedOn.pages.length > 1 ? (
                <p className="k-note">
                    {document.usedOn.everywhere
                        ? 'This shows on every page.'
                        : `This shows on ${document.usedOn.pages.map((page) => page.path).join(', ')}.`}
                </p>
            ) : null}
            {!document.complete && document.missing.length > 0 ? (
                <p className="k-note">Fill in {document.missing.join(', ')} before publishing.</p>
            ) : null}
            <FieldForm
                key={`${document.ref}:${formKey}`}
                fields={document.fields}
                draft={document.draft}
                onSave={(changes) => save(document.ref, document.fields, changes)}
                onState={setSaveState}
                changed={changed}
                pointed={pointed}
            />
        </div>
    );

    return (
        <EditorContext.Provider value={editorContext}>
            <div className="k-shell" data-fullscreen={fullscreen}>
                <Header>
                    <div className="k-title">
                        <span className="k-title-name">{documentTitle(document)}</span>
                        <span className="k-status" data-status={document.status}>
                            {STATUS_LABEL[document.status]}
                        </span>
                        <SaveIndicator state={saveState} />
                    </div>
                    <div className="k-header-actions">
                        {siteUrl !== null ? (
                            <button type="button" className="k-link" onClick={() => void openInTab()}>
                                <span className="k-ellipsis">{new URL(pagePath, siteUrl).host + pagePath}</span>
                                <ExternalLink {...ICON} />
                            </button>
                        ) : null}
                        {canFullscreen ? (
                            <button
                                type="button"
                                className="k-icon-button"
                                onClick={toggleFullscreen}
                                aria-label={fullscreen ? 'Back to the chat' : 'Open the preview'}>
                                {fullscreen ? <Minimize2 {...ICON} /> : <Maximize2 {...ICON} />}
                            </button>
                        ) : null}
                    </div>
                </Header>
                {fullscreen ? (
                    <div className="k-split">
                        <div className="k-split-form">{form}</div>
                        <PreviewPane
                            url={previewUrl}
                            problem={previewProblem}
                            frame={frame}
                            mode={previewMode}
                            ready={framedPath !== undefined}
                            onMode={(mode) => {
                                setPreviewMode(mode);
                                tellPreview({
                                    type: 'mode',
                                    mode,
                                });
                            }}
                        />
                    </div>
                ) : (
                    form
                )}
                <footer className="k-footer">
                    {!fullscreen && canFullscreen && siteUrl !== null ? (
                        <button type="button" className="k-button k-button-secondary" onClick={toggleFullscreen}>
                            Open preview
                        </button>
                    ) : (
                        <span />
                    )}
                    <AlertDialog.Root
                        open={publishing}
                        onOpenChange={(open) => {
                            setPublishing(open);
                            if (open) setPublishProblem(undefined);
                        }}>
                        <AlertDialog.Trigger
                            className="k-button k-button-primary"
                            disabled={
                                !document.complete ||
                                !isPending(document) ||
                                saveState === 'pending' ||
                                saveState === 'saving' ||
                                saveState === 'failed'
                            }>
                            Publish
                        </AlertDialog.Trigger>
                        <AlertDialog.Portal>
                            <AlertDialog.Backdrop className="k-backdrop" />
                            <AlertDialog.Popup className="k-dialog">
                                <AlertDialog.Title className="k-dialog-title">Publish {documentTitle(document)}?</AlertDialog.Title>
                                <AlertDialog.Description className="k-help">
                                    {document.usedOn.everywhere
                                        ? 'Every page shows this, so every visitor sees the change.'
                                        : 'Visitors see the draft from now on.'}
                                </AlertDialog.Description>
                                {publishProblem !== undefined ? (
                                    <p className="k-error" role="alert">
                                        <CircleAlert {...ICON} />
                                        {publishProblem}
                                    </p>
                                ) : null}
                                <div className="k-dialog-actions">
                                    <AlertDialog.Close className="k-button k-button-secondary">Cancel</AlertDialog.Close>
                                    <button
                                        type="button"
                                        className="k-button k-button-primary"
                                        disabled={publishBusy}
                                        onClick={() => void publish()}>
                                        {publishBusy ? 'Publishing' : 'Publish'}
                                    </button>
                                </div>
                            </AlertDialog.Popup>
                        </AlertDialog.Portal>
                    </AlertDialog.Root>
                </footer>
            </div>
        </EditorContext.Provider>
    );
}

function Header({ children }: { children?: ReactNode }) {
    return (
        <header className="k-header">
            <Logo />
            {children}
        </header>
    );
}

function SaveIndicator({ state }: { state: SaveState }) {
    if (state === 'idle') return null;
    return (
        <span className="k-save" role="status">
            {state === 'saving' || state === 'pending' ? <LoaderCircle {...ICON} className="k-spin" /> : null}
            {state === 'saved' ? <Check {...ICON} /> : null}
            {state === 'failed' ? <CircleAlert {...ICON} /> : null}
            {state === 'failed' ? 'Not saved' : state === 'saved' ? 'Saved' : 'Saving'}
        </span>
    );
}
