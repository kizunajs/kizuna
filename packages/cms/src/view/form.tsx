import {
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
    type Ref,
} from 'react';
import { Collapsible } from '@base-ui/react/collapsible';
import { Tabs } from '@base-ui/react/tabs';
import { ChevronDown, CircleAlert, Lock } from 'lucide-react';
import { conditionHolds } from '../condition.js';
import { arrange, inSidebar, tabSets, type Arranged } from './arrange.js';
import { ICON } from './context.js';
import { Control, foldsItems, listsItems, Required } from './controls.js';
import { Hint } from './hint.js';
import { lockReasonOf, readOnlyTextOf, readsAsText } from './read-only.js';
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
    /**
     * The changes never landed, so the form keeps them to send with the
     * next save, as Retry does.
     */
    retry?: boolean;
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
    /**
     * The top-level fields the draft still needs before it can publish, each
     * marked where it sits.
     */
    missing?: readonly string[];
    /**
     * What shows first in the sidebar, above any field that sits there. With
     * it, the sidebar shows even when no field does.
     */
    aside?: ReactNode;
    /**
     * What shows under a field, like the comments a review left on it.
     */
    below?: (field: DescribedField) => ReactNode;
    /**
     * Shows every field as it stands, for a record nobody may save.
     */
    readOnly?: boolean;
    ref?: Ref<FieldFormHandle>;
}

export interface FieldFormHandle {
    /**
     * Saves what the person typed at once, instead of after the pause.
     */
    flush: () => Promise<void>;
}

/**
 * The id of the element that holds a field, to scroll to it.
 */
export const fieldDomId = (path: string): string => `field-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

/**
 * The changes as JSON carries them. An emptied field goes as `null`, which
 * the server reads as clearing an optional field, where `undefined` would
 * drop the key and the change with it.
 */
export const changesForWire = (changes: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(Object.entries(changes).map(([path, value]) => [path, value === undefined ? null : value]));

/**
 * Every field of a document, a section each, arranged in its tabs, rows and
 * collapsibles, with the sidebar beside them when the form is wide enough. A
 * change saves to the draft a moment after typing stops.
 */
export function FieldForm({
    fields,
    layout,
    draft,
    onSave,
    onState,
    changed,
    pointed,
    missing,
    aside,
    below,
    readOnly,
    ref,
}: FieldFormProps) {
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
        const failure = await latestSave.current(changesForWire(sending));
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
        const typedSince = Object.keys(pending.current).length > 0;
        if (failure?.retry === true) {
            pending.current = {
                ...sending,
                ...pending.current,
            };
        }
        if (typedSince) {
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

    useImperativeHandle(
        ref,
        () => ({
            flush,
        }),
        [flush]
    );

    const valueOf = (path: string): unknown => (path in values ? values[path] : valueAt(draft, path));

    /**
     * Whether a field's condition holds on the values beside it as the person
     * has them, a field with no value reading as its default.
     */
    const shows = (field: DescribedField): boolean => {
        if (field.condition === undefined) return true;
        const path = field.parent === undefined ? field.condition.field : `${field.parent}.${field.condition.field}`;
        const value = valueOf(path);
        return conditionHolds(
            field.condition,
            value === undefined ? fields.find((candidate) => candidate.path === path)?.schema.default : value
        );
    };
    const hidden = fields
        .filter((field) => !shows(field))
        .map((field) => field.path)
        .join(' ');

    // A hidden field leaves the form, so a tab, row or collapsible holding only hidden fields goes with it.
    const arranged = useMemo(() => {
        const hiddenPaths = new Set(hidden.split(' '));
        const visible = fields.filter((field) => !hiddenPaths.has(field.path));
        const top = arrange(
            visible.filter((field) => field.parent === undefined),
            layout
        );
        const blocks = new Map<string, Arranged[]>();
        for (const field of visible) {
            const children = visible.filter((candidate) => candidate.parent === field.path);
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
    }, [fields, layout, hidden]);

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
        const section = document.getElementById(fieldDomId(pointed));
        section?.scrollIntoView({
            block: 'nearest',
            behavior: 'smooth',
        });
        section?.querySelector<HTMLElement>('input, textarea, [contenteditable="true"], button')?.focus({
            preventScroll: true,
        });
    }, [pointed]);

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

    const control = (field: DescribedField, writable: boolean, heading?: ReactNode): ReactNode => {
        const error = errorFor(field.path);
        // A list shows its help beside its Add button.
        const list = listsItems(field.schema);
        return (
            <>
                <div className="k-field__input" data-invalid={error !== undefined}>
                    {error === undefined ? null : (
                        <p className="k-field__error" role="alert">
                            <CircleAlert {...ICON} />
                            {error}
                        </p>
                    )}
                    <Control
                        id={fieldDomId(field.path) + '-input'}
                        name={field.name}
                        label={labelOf(field)}
                        heading={heading}
                        schema={field.schema}
                        root={field.schema}
                        value={valueOf(field.path)}
                        onChange={(value) => change(field.path, value)}
                        disabled={!writable}
                        brand={field.brand}
                        searchTool={field.searchTool}
                        labels={field.options}
                        blocks={field.blocks}
                        help={list ? field.help : undefined}
                        placeholder={typeof field.sharedValue === 'string' ? field.sharedValue : undefined}
                        required
                    />
                </div>
                {field.help !== undefined && !list ? <p className="k-help">{field.help}</p> : null}
                {writable ? null : <p className="k-help">{lockReasonOf(field, readOnly === true)}</p>}
            </>
        );
    };

    const isMarked = (path: string, marks: ReadonlySet<string> | string | undefined): boolean => {
        if (marks === undefined) return false;
        if (typeof marks === 'string') return marks === path || marks.startsWith(`${path}.`);
        for (const mark of marks) if (mark === path || mark.startsWith(`${path}.`)) return true;
        return false;
    };

    const section = (field: DescribedField, headed = true): ReactNode => {
        const children = fields.filter((candidate) => candidate.parent === field.path);
        if (children.length > 0) {
            const content = arranged.blocks.get(field.path);
            if (content === undefined) return null;
            // A block's fields sit under its name as a heading, with no surface of their own. A tab that holds it alone already names it.
            return (
                <section
                    key={field.path}
                    id={fieldDomId(field.path)}
                    className="k-group"
                    data-headed={headed}
                    aria-label={headed ? undefined : labelOf(field)}
                    aria-labelledby={headed ? fieldDomId(field.path) + '-heading' : undefined}>
                    {headed ? (
                        <div className="k-group__head">
                            <h3 className="k-group__title" id={fieldDomId(field.path) + '-heading'}>
                                {labelOf(field)}
                            </h3>
                            {field.help === undefined ? null : <p className="k-group__description">{field.help}</p>}
                        </div>
                    ) : field.help === undefined ? null : (
                        <p className="k-group__description">{field.help}</p>
                    )}
                    <div className="k-fields">{shown(content, 'k-fields', (child) => leaf(child, child.writable && field.writable))}</div>
                </section>
            );
        }
        return leaf(field, field.writable);
    };

    /**
     * One field: its label, its input and its help. A list whose items fold
     * draws its label itself, with Collapse all and Expand all beside it. A
     * field the editor cannot change and whose value reads as text shows it
     * in a locked box the shape of its input.
     */
    const leaf = (field: DescribedField, writable: boolean): ReactNode => {
        const folds = foldsItems(field.schema, field.schema);
        const locked = readOnly === true || field.readOnly || !writable;
        const label = (
            <label className="k-field__label" htmlFor={folds ? undefined : fieldDomId(field.path) + '-input'}>
                {labelOf(field)}
                {field.required ? <Required /> : null}
                {field.belongsTo === undefined ? null : <span className="k-field__owner">{field.belongsTo}</span>}
            </label>
        );
        const needed = field.parent === undefined && missing?.includes(field.name) === true;
        if (locked && readsAsText(field.schema)) {
            const text = readOnlyTextOf(field.schema, valueOf(field.path), field.options);
            const reason = lockReasonOf(field, readOnly === true);
            return (
                <section key={field.path} id={fieldDomId(field.path)} className="k-field">
                    <span className="k-field__label" id={fieldDomId(field.path) + '-label'}>
                        {labelOf(field)}
                        {field.required ? <Required /> : null}
                        {field.belongsTo === undefined ? null : <span className="k-field__owner">{field.belongsTo}</span>}
                    </span>
                    <div className="k-field__control" data-changed={isMarked(field.path, changed)}>
                        <p className="k-read-only" aria-labelledby={fieldDomId(field.path) + '-label'} data-empty={text === undefined}>
                            <span className="k-read-only__text">{text ?? 'Not set'}</span>
                            <Hint label={reason}>
                                <span className="k-read-only__lock" role="img" aria-label={reason} tabIndex={0}>
                                    <Lock size={13} strokeWidth={1.75} aria-hidden />
                                </span>
                            </Hint>
                        </p>
                        {field.help === undefined ? null : <p className="k-help">{field.help}</p>}
                    </div>
                    {below?.(field)}
                </section>
            );
        }
        return (
            <section key={field.path} id={fieldDomId(field.path)} className="k-field">
                {folds ? null : label}
                <div
                    className="k-field__control"
                    data-changed={isMarked(field.path, changed)}
                    data-pointed={isMarked(field.path, pointed)}
                    data-missing={needed}>
                    {control(field, writable && readOnly !== true, folds ? label : undefined)}
                    {needed ? <p className="k-field__needed">Needed before publishing.</p> : null}
                </div>
                {below?.(field)}
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
                                    className="k-layout-row__cell"
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
                    <Collapsible.Root
                        key={id}
                        className="k-collapsible k-collapsible--strip"
                        open={!folded.has(id)}
                        onOpenChange={(open) =>
                            setFolded((previous) => {
                                if (open !== previous.has(id)) return previous;
                                const next = new Set(previous);
                                if (open) next.delete(id);
                                else next.add(id);
                                return next;
                            })
                        }>
                        <Collapsible.Trigger className="k-collapsible__trigger">
                            {entry.item.label}
                            <span className="k-collapsible__chevron">
                                <ChevronDown {...ICON} />
                            </span>
                        </Collapsible.Trigger>
                        <Collapsible.Panel keepMounted className={`k-collapsible__panel ${stack}`}>
                            {shown(entry.content, stack, leaf)}
                        </Collapsible.Panel>
                    </Collapsible.Root>
                );
            }
            const active = shownTabs[entry.id] ?? entry.id;
            return (
                <Tabs.Root
                    key={entry.id}
                    className="k-tabs"
                    value={active}
                    onValueChange={(tab: string) =>
                        setShownTabs((previous) => ({
                            ...previous,
                            [entry.id]: tab,
                        }))
                    }>
                    <Tabs.List className="k-tab-bar k-tab-bar--underline">
                        {entry.tabs.map((tab) => (
                            <Tabs.Tab key={tab.item.id} value={tab.item.id} className="k-tab k-tab--underline">
                                {tab.item.label}
                            </Tabs.Tab>
                        ))}
                    </Tabs.List>
                    {entry.tabs.map((tab) => (
                        <Tabs.Panel key={tab.item.id} value={tab.item.id} keepMounted className={stack}>
                            {shown(tab.content, stack, (field) =>
                                leaf === section && (tab.content.length === 1 || labelOf(field) === tab.item.label)
                                    ? section(field, false)
                                    : leaf(field)
                            )}
                        </Tabs.Panel>
                    ))}
                </Tabs.Root>
            );
        });

    const hasSidebar = (aside !== undefined && aside !== null && aside !== false) || arranged.sidebar.length > 0;

    return (
        <div className="k-form">
            <div className="k-form__columns" data-sidebar={hasSidebar}>
                <div className="k-form__main">
                    <div className="k-form__fields k-stack">{shown(arranged.main, 'k-stack', section)}</div>
                </div>
                {hasSidebar ? (
                    <aside className="k-form__sidebar k-stack" aria-label="Sidebar">
                        {aside}
                        {shown(arranged.sidebar, 'k-stack', section)}
                    </aside>
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
