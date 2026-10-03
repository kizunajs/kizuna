import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { ICON } from './context.js';
import { Control, Row } from './controls.js';
import { labelOf, valueAt, type DescribedField } from './schema.js';

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

/**
 * Every field of a document, a section each. A change saves to the draft a
 * moment after typing stops.
 */
export function FieldForm({ fields, draft, onSave, onState, changed, pointed }: FieldFormProps) {
    const [values, setValues] = useState<Record<string, unknown>>({});
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

    return (
        <div className="k-form">
            {fields
                .filter((field) => field.parent === undefined)
                .map((field) => {
                    const children = fields.filter((candidate) => candidate.parent === field.path);
                    return (
                        <section key={field.path} id={domId(field.path)} className="k-section">
                            <label className="k-section-title" htmlFor={children.length === 0 ? domId(field.path) + '-input' : undefined}>
                                {labelOf(field)}
                            </label>
                            {children.length === 0 ? (
                                <div
                                    className="k-field"
                                    data-changed={isMarked(field.path, changed)}
                                    data-pointed={isMarked(field.path, pointed)}>
                                    {control(field, field.writable)}
                                </div>
                            ) : (
                                <div className="k-group">
                                    {children.map((child) => (
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
                })}
            {problem !== undefined ? (
                <p className="k-error" role="alert">
                    <CircleAlert {...ICON} />
                    {problem}
                </p>
            ) : null}
        </div>
    );
}
