import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronRight, CircleAlert } from 'lucide-react';
import { arrange, inSidebar, tabSets, type Arranged } from './arrange.js';
import { ICON } from './context.js';
import { Control, Row } from './controls.js';
import { labelOf, valueAt, type DescribedField, type DescribedLayout } from './schema.js';

/**
 * How long typing pauses before a change saves.
 */
const AUTOSAVE_DELAY = 450;

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'failed';

/**
 * Why a save did not land: one message for the form, or one per field path.
 */
export interface SaveFailure {
    problem?: string;
    fieldErrors?: Record<string, string>;
}

export interface FieldFormProps {
    fields: readonly DescribedField[];
    /**
     * The tabs, rows and collapsibles the fields name.
     */
    layout: readonly DescribedLayout[];
    draft: Record<string, unknown> | null;
    onSave: (changes: Record<string, unknown>) => Promise<SaveFailure | undefined>;
    onState: (state: SaveState) => void;
    /**
     * Fields someone else changed, marked until the person looks.
     */
    changed: ReadonlySet<string>;
    /**
     * The field the person pointed at in the preview.
     */
    pointed: string | undefined;
}

const refusalFor = (field: DescribedField): string =>
    field.readOnly ? 'Read only' : `Only ${(field.roles ?? ['another role']).join(' or ')} can change this`;

const domId = (path: string): string => `field-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

const layoutId = (id: string): string => `layout-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

/**
 * Every field of a document, a section each, arranged in its tabs, rows and
 * collapsibles, with the sidebar beside them when the form is wide enough. A
 * change saves to the draft a moment after typing stops.
 */
export function FieldForm({ fields, layout, draft, onSave, onState, changed, pointed }: FieldFormProps) {
    const [values, setValues] = useState<Record<string, unknown>>({});
    const [shownTabs, setShownTabs] = useState<Readonly<Record<string, string>>>({});
    const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
    const [revealed, setRevealed] = useState<string | undefined>(undefined);
    const [problem, setProblem] = useState<string | undefined>();
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const pending = useRef<Record<string, unknown>>({});
    const saving = useRef(false);
    const timer = useRef<number | undefined>(undefined);
    const latestSave = useRef(onSave);
    latestSave.current = onSave;
    const latestState = useRef(onState);
    latestState.current = onState;

    const flush = useCallback(async (): Promise<void> => {
        window.clearTimeout(timer.current);
        if (saving.current) return;
        const sending = pending.current;
        if (Object.keys(sending).length === 0) return;
        pending.current = {};
        saving.current = true;
        latestState.current('saving');
        const failure = await latestSave.current(sending);
        saving.current = false;
        if (failure === undefined) {
            setProblem(undefined);
            setFieldErrors({});
            setValues((previous) => {
                const next = {
                    ...previous,
                };
                for (const [path, value] of Object.entries(sending)) {
                    if (next[path] === value && !(path in pending.current)) delete next[path];
                }
                return next;
            });
        } else {
            setProblem(failure.problem);
            setFieldErrors(failure.fieldErrors ?? {});
        }
        if (Object.keys(pending.current).length > 0) {
            void flush();
            return;
        }
        latestState.current(failure === undefined ? 'saved' : 'failed');
    }, []);

    useEffect(
        () => () => {
            void flush();
        },
        [flush]
    );

    const arranged = useMemo(() => {
        const top = arrange(
            fields.filter((field) => field.parent === undefined),
            layout
        );
        const blocks = new Map<string, Arranged[]>();
        for (const field of fields) {
            const children = fields.filter((candidate) => candidate.parent === field.path);
            if (children.length > 0) blocks.set(field.path, arrange(children, layout));
        }
        const tabs = tabSets(top);
        for (const content of blocks.values()) tabSets(content, tabs);
        return {
            main: top.filter((entry) => !inSidebar(entry)),
            sidebar: top.filter(inSidebar),
            blocks,
            tabs,
        };
    }, [fields, layout]);

    // A field pointed at in the preview shows its tab and opens its collapsible before it scrolls into view.
    if (pointed !== revealed) {
        setRevealed(pointed);
        const holding =
            pointed === undefined ? [] : fields.filter((field) => pointed === field.path || pointed.startsWith(`${field.path}.`));
        const ids = holding.flatMap((field) => field.layout ?? []);
        if (ids.length > 0) {
            setShownTabs((previous) => {
                const next = {
                    ...previous,
                };
                for (const id of ids) {
                    const set = arranged.tabs.get(id);
                    if (set !== undefined) next[set] = id;
                }
                return next;
            });
            setFolded((previous) => new Set([...previous].filter((id) => !ids.includes(id))));
        }
    }

    useEffect(() => {
        if (pointed === undefined) return;
        const section = document.getElementById(domId(pointed));
        section?.scrollIntoView({
            block: 'nearest',
            behavior: 'smooth',
        });
        section?.querySelector<HTMLElement>('input, textarea, [contenteditable="true"], button')?.focus({
            preventScroll: true,
        });
    }, [pointed]);

    const valueOf = (path: string): unknown => (path in values ? values[path] : valueAt(draft, path));
    const change = (path: string, value: unknown): void => {
        setValues((previous) => ({
            ...previous,
            [path]: value,
        }));
        pending.current = {
            ...pending.current,
            [path]: value,
        };
        latestState.current('pending');
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void flush(), AUTOSAVE_DELAY);
    };
    const errorFor = (path: string): string | undefined =>
        Object.entries(fieldErrors).find(([errorPath]) => errorPath === path || errorPath.startsWith(`${path}.`))?.[1];

    const control = (field: DescribedField, writable: boolean): ReactNode => (
        <>
            <Control
                id={domId(field.path) + '-input'}
                schema={field.schema}
                root={field.schema}
                value={valueOf(field.path)}
                onChange={(value) => change(field.path, value)}
                disabled={!writable}
                brand={field.brand}
                searchTool={field.searchTool}
                labels={field.options}
                required
            />
            {errorFor(field.path) !== undefined ? (
                <p className="k-error" role="alert">
                    <CircleAlert {...ICON} />
                    {errorFor(field.path)}
                </p>
            ) : null}
            {field.help !== undefined ? <p className="k-help">{field.help}</p> : null}
            {writable ? null : <p className="k-help">{refusalFor(field)}</p>}
        </>
    );

    const isMarked = (path: string, marks: ReadonlySet<string> | string | undefined): boolean => {
        if (marks === undefined) return false;
        if (typeof marks === 'string') return marks === path || marks.startsWith(`${path}.`);
        for (const mark of marks) if (mark === path || mark.startsWith(`${path}.`)) return true;
        return false;
    };

    const section = (field: DescribedField): ReactNode => {
        const children = fields.filter((candidate) => candidate.parent === field.path);
        return (
            <section key={field.path} id={domId(field.path)} className="k-section">
                <label className="k-section-title" htmlFor={children.length === 0 ? domId(field.path) + '-input' : undefined}>
                    {labelOf(field)}
                </label>
                {children.length === 0 ? (
                    <div className="k-field" data-changed={isMarked(field.path, changed)} data-pointed={isMarked(field.path, pointed)}>
                        {control(field, field.writable)}
                    </div>
                ) : (
                    <div className="k-group">
                        {shown(arranged.blocks.get(field.path) ?? [], 'k-group', (child) => (
                            <div
                                key={child.path}
                                id={domId(child.path)}
                                className="k-field"
                                data-changed={isMarked(child.path, changed)}
                                data-pointed={isMarked(child.path, pointed)}>
                                <Row label={labelOf(child)} htmlFor={domId(child.path) + '-input'}>
                                    {control(child, child.writable && field.writable)}
                                </Row>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        );
    };

    /**
     * Arranged items as the form shows them, each field drawn by `leaf`, and
     * the items inside a tab or a collapsible spaced as `stack` spaces them.
     */
    const shown = (entries: readonly Arranged[], stack: string, leaf: (field: DescribedField) => ReactNode): ReactNode[] =>
        entries.map((entry) => {
            if (entry.kind === 'field') return leaf(entry.field);
            if (entry.kind === 'row') {
                return (
                    <div key={entry.item.id} className="k-layout-row">
                        {entry.content.map((inner) => {
                            const width = inner.kind === 'field' ? inner.field.width : undefined;
                            return (
                                <div
                                    key={inner.kind === 'field' ? inner.field.path : inner.kind === 'tabs' ? inner.id : inner.item.id}
                                    className="k-layout-cell"
                                    data-width={width !== undefined}
                                    style={
                                        width === undefined
                                            ? undefined
                                            : ({
                                                  '--k-width': width,
                                              } as CSSProperties)
                                    }>
                                    {shown([inner], stack, leaf)}
                                </div>
                            );
                        })}
                    </div>
                );
            }
            if (entry.kind === 'collapsible') {
                const id = entry.item.id;
                return (
                    <details
                        key={id}
                        className="k-collapsible"
                        open={!folded.has(id)}
                        onToggle={(event) => {
                            const open = event.currentTarget.open;
                            setFolded((previous) => {
                                if (open !== previous.has(id)) return previous;
                                const next = new Set(previous);
                                if (open) next.delete(id);
                                else next.add(id);
                                return next;
                            });
                        }}>
                        <summary className="k-collapsible-summary">
                            <ChevronRight {...ICON} />
                            {entry.item.label}
                        </summary>
                        <div className={stack}>{shown(entry.content, stack, leaf)}</div>
                    </details>
                );
            }
            const active = shownTabs[entry.id] ?? entry.id;
            return (
                <div key={entry.id} className="k-tabs">
                    <div className="k-tab-bar" role="tablist">
                        {entry.tabs.map((tab) => (
                            <button
                                key={tab.item.id}
                                id={layoutId(tab.item.id) + '-tab'}
                                type="button"
                                role="tab"
                                aria-selected={tab.item.id === active}
                                aria-controls={layoutId(tab.item.id)}
                                className="k-tab"
                                onClick={() =>
                                    setShownTabs((previous) => ({
                                        ...previous,
                                        [entry.id]: tab.item.id,
                                    }))
                                }>
                                {tab.item.label}
                            </button>
                        ))}
                    </div>
                    {entry.tabs.map((tab) => (
                        <div
                            key={tab.item.id}
                            id={layoutId(tab.item.id)}
                            role="tabpanel"
                            aria-labelledby={layoutId(tab.item.id) + '-tab'}
                            className={stack}
                            hidden={tab.item.id !== active}>
                            {shown(tab.content, stack, leaf)}
                        </div>
                    ))}
                </div>
            );
        });

    return (
        <div className="k-form">
            <div className="k-form-columns" data-sidebar={arranged.sidebar.length > 0}>
                <div className="k-form-main k-stack">{shown(arranged.main, 'k-stack', section)}</div>
                {arranged.sidebar.length > 0 ? (
                    <aside className="k-form-sidebar k-stack">{shown(arranged.sidebar, 'k-stack', section)}</aside>
                ) : null}
            </div>
            {problem !== undefined ? (
                <p className="k-error" role="alert">
                    <CircleAlert {...ICON} />
                    {problem}
                </p>
            ) : null}
        </div>
    );
}
