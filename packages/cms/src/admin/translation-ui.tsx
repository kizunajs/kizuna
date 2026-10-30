import type { ReactNode } from 'react';
import { Menu } from '@base-ui/react/menu';
import { Check, ChevronDown, Circle, CircleCheck, Languages, LayoutGrid, Lock, ArrowDown } from 'lucide-react';
import { ICON } from '../view/context.js';
import { Control } from '../view/controls.js';
import { richTextOf, wordDiff } from '../view/change-value.js';
import { readOnlyTextOf } from '../view/read-only.js';
import { labelOf, type DescribedField, type Description, type DocumentLocales } from '../view/schema.js';

/**
 * Bokmål names itself Norsk, as people who write it do.
 */
const NAMED_AS: Readonly<Record<string, string>> = {
    nb: 'no',
};

/**
 * A language as it names itself, like Dansk or Svenska.
 */
export const languageNameOf = (code: string): string => {
    try {
        const named = NAMED_AS[code] ?? code;
        const name = new Intl.DisplayNames([named], {
            type: 'language',
        }).of(named);
        return name === undefined ? code : `${name.charAt(0).toLocaleUpperCase(named)}${name.slice(1)}`;
    } catch {
        return code;
    }
};

type LocaleEntry = DocumentLocales['locales'][number];

/**
 * Where one language's copy stands, in a few words.
 */
export const localeStateOf = (entry: LocaleEntry, source: string): string => {
    if (entry.code === source) return 'Source';
    if (entry.status === 'empty') return 'Not translated';
    const parts = [
        entry.changed.length === 0 ? undefined : `${entry.changed.length} changed`,
        entry.missing.length === 0 ? undefined : `${entry.missing.length} missing`,
    ].filter((part) => part !== undefined);
    return parts.length === 0 ? 'Up to date' : parts.join(', ');
};

export const isEmptyValue = (value: unknown): boolean =>
    value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

/**
 * Why a translated field waits for someone: its source changed, or the
 * source holds it and the translation leaves it empty.
 */
export type Pending = 'changed' | 'missing';

/**
 * The fields of an open translation that wait for someone, in the form's
 * order, leaving out those already filled in.
 */
export const pendingFieldsOf = (
    document: Description,
    filled: ReadonlySet<string>
): Array<{
    field: DescribedField;
    pending: Pending;
}> => {
    const locale = document.locale;
    if (locale === undefined || locale.current === locale.source) return [];
    return document.fields.flatMap((field) => {
        if (field.parent !== undefined || field.translated !== true || filled.has(field.path)) return [];
        if (field.sourceChanged === true) {
            return [
                {
                    field,
                    pending: 'changed' as Pending,
                },
            ];
        }
        if (!isEmptyValue(field.sourceValue) && isEmptyValue(document.draft?.[field.path])) {
            return [
                {
                    field,
                    pending: 'missing' as Pending,
                },
            ];
        }
        return [];
    });
};

const textOf = (field: DescribedField, value: unknown): string =>
    typeof value === 'string' ? value : (richTextOf(value) ?? readOnlyTextOf(field.schema, value, field.options) ?? '');

/**
 * A source's text before and now, the words it lost struck out in the first
 * and the words it gained marked in the second.
 */
export function SourceChange({ field, code }: { field: DescribedField; code?: string }) {
    const before = textOf(field, field.sourceBefore);
    const now = textOf(field, field.sourceValue);
    const pieces = wordDiff(before, now);
    const lead = code === undefined ? null : <span className="k-source__code">{code}</span>;
    return (
        <div className="k-source-change">
            <p className="k-source-change__before">
                {lead}
                <span>
                    {pieces === undefined
                        ? before
                        : pieces
                              .filter((piece) => piece.kind !== 'added')
                              .map((piece, index) => (piece.kind === 'removed' ? <del key={index}>{piece.text}</del> : piece.text))}
                </span>
            </p>
            <p className="k-source-change__now">
                {lead}
                <span>
                    {pieces === undefined
                        ? now
                        : pieces
                              .filter((piece) => piece.kind !== 'removed')
                              .map((piece, index) => (piece.kind === 'added' ? <ins key={index}>{piece.text}</ins> : piece.text))}
                </span>
            </p>
        </div>
    );
}

/**
 * The open document's language, which lists every language with where its
 * copy stands, and All languages.
 */
export function LanguageMenu({
    locales,
    showingAll,
    onOpen,
    onAll,
}: {
    locales: DocumentLocales;
    showingAll: boolean;
    onOpen: (code: string) => void;
    onAll: () => void;
}) {
    return (
        <Menu.Root>
            <Menu.Trigger className="k-tab k-language-menu__trigger">
                {showingAll ? 'All languages' : languageNameOf(locales.current)}
                <ChevronDown size={13} strokeWidth={1.75} aria-hidden />
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner sideOffset={6} align="end" className="k-positioner">
                    <Menu.Popup className="k-popup k-menu k-language-menu">
                        {locales.locales.map((entry) => (
                            <Menu.Item key={entry.code} className="k-menu__item k-language-menu__item" onClick={() => onOpen(entry.code)}>
                                <span className="k-language-menu__check">
                                    {!showingAll && entry.code === locales.current ? (
                                        <Check size={14} strokeWidth={1.75} aria-hidden />
                                    ) : null}
                                </span>
                                <span className="k-language-menu__code">{entry.code.toUpperCase()}</span>
                                <span className="k-language-menu__name">{languageNameOf(entry.code)}</span>
                                <span className="k-language-menu__state">{localeStateOf(entry, locales.source)}</span>
                            </Menu.Item>
                        ))}
                        <Menu.Separator className="k-menu__separator" />
                        <Menu.Item className="k-menu__item k-language-menu__item" onClick={onAll}>
                            <span className="k-language-menu__check">
                                {showingAll ? <Check size={14} strokeWidth={1.75} aria-hidden /> : null}
                            </span>
                            <span className="k-language-menu__code">
                                <LayoutGrid size={14} strokeWidth={1.75} aria-hidden />
                            </span>
                            <span className="k-language-menu__name">All languages</span>
                        </Menu.Item>
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}

/**
 * Every translated field against every language, with where each stands and
 * a way to translate what waits.
 */
export function LanguagesGrid({ document, onTranslate }: { document: Description; onTranslate: (code: string) => void }) {
    const locales = document.locale;
    if (locales === undefined) return null;
    const languages = locales.locales.filter((entry) => entry.code !== locales.source);
    const rows = document.fields.filter((field) => field.parent === undefined && field.translated === true);
    return (
        <div className="k-languages">
            <table className="k-languages__grid">
                <thead>
                    <tr>
                        <th className="k-languages__field-head">Field</th>
                        {languages.map((entry) => (
                            <th key={entry.code}>
                                <span className="k-languages__name">{languageNameOf(entry.code)}</span>
                                <span className="k-languages__state">{localeStateOf(entry, locales.source)}</span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((field) => (
                        <tr key={field.path}>
                            <td className="k-languages__field">{labelOf(field)}</td>
                            {languages.map((entry) => (
                                <td key={entry.code}>
                                    {entry.changed.includes(field.name) ? (
                                        <span className="k-languages__cell" data-changed="">
                                            <span className="k-languages__dot" />
                                            Changed
                                        </span>
                                    ) : entry.missing.includes(field.name) || entry.status === 'empty' ? (
                                        <span className="k-languages__cell" aria-label="Missing">
                                            <Circle {...ICON} aria-hidden />
                                        </span>
                                    ) : (
                                        <span className="k-languages__cell" aria-label="Up to date">
                                            <CircleCheck {...ICON} aria-hidden />
                                        </span>
                                    )}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td />
                        {languages.map((entry) => {
                            const waiting = entry.changed.length + entry.missing.length;
                            return (
                                <td key={entry.code}>
                                    {waiting === 0 ? null : (
                                        <button
                                            type="button"
                                            className="k-button k-button--secondary k-button--small"
                                            onClick={() => onTranslate(entry.code)}>
                                            <Languages {...ICON} />
                                            Translate {waiting}
                                        </button>
                                    )}
                                </td>
                            );
                        })}
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}

/**
 * How a field left translate mode.
 */
export type Outcome = 'updated' | 'kept';

/**
 * One field at a time, of those that wait: the source above with what
 * changed in it, the translation under it, and Update, Keep or Translate.
 */
export function TranslateMode({
    document,
    steps,
    current,
    drafts,
    outcomes,
    busy,
    revision,
    onGo,
    onChange,
    onTranslate,
    onKeep,
}: {
    document: Description;
    steps: ReadonlyArray<{
        field: DescribedField;
        pending: Pending;
    }>;
    current: number;
    drafts: Readonly<Record<string, unknown>>;
    outcomes: Readonly<Record<string, Outcome>>;
    busy: boolean;
    /**
     * Counts the answers from the model, so the input shows each one.
     */
    revision: number;
    onGo: (index: number) => void;
    onChange: (path: string, value: unknown) => void;
    onTranslate: (path: string) => void;
    onKeep: (path: string) => void;
}) {
    const locales = document.locale!;
    const step = steps[current];
    if (step === undefined) return null;
    const { field, pending } = step;
    const value = field.path in drafts ? drafts[field.path] : document.draft?.[field.path];
    const sourceCode = locales.source.toUpperCase();
    return (
        <div className="k-translate-mode">
            <nav className="k-translate-mode__outline" aria-label="Fields to translate">
                {steps.map((entry, index) => {
                    const outcome = outcomes[entry.field.path];
                    return (
                        <button
                            key={entry.field.path}
                            type="button"
                            className="k-translate-mode__row"
                            aria-current={index === current ? 'step' : undefined}
                            onClick={() => onGo(index)}>
                            <span className="k-translate-mode__mark">
                                {outcome !== undefined ? (
                                    <Check {...ICON} aria-hidden />
                                ) : entry.pending === 'changed' ? (
                                    <span className="k-translate-mode__dot" />
                                ) : (
                                    <Circle {...ICON} aria-hidden />
                                )}
                            </span>
                            <span className="k-translate-mode__label">{labelOf(entry.field)}</span>
                            <span className="k-translate-mode__state">
                                {outcome === 'updated'
                                    ? 'Updated'
                                    : outcome === 'kept'
                                      ? 'Kept'
                                      : entry.pending === 'changed'
                                        ? 'Changed'
                                        : 'Missing'}
                            </span>
                        </button>
                    );
                })}
            </nav>
            <section className="k-translate-mode__focus" aria-label={labelOf(field)}>
                <h2 className="k-translate-mode__title">{labelOf(field)}</h2>
                <div className="k-translate-mode__pair">
                    <span className="k-translate-mode__caption">
                        <span className="k-source__code">{sourceCode}</span>
                        {languageNameOf(locales.source)}
                    </span>
                    <div className="k-read-only k-translate-mode__source">
                        {pending === 'changed' ? (
                            <SourceChange field={field} />
                        ) : (
                            <span className="k-read-only__text">{textOf(field, field.sourceValue)}</span>
                        )}
                        <span className="k-read-only__lock">
                            <Lock size={13} strokeWidth={1.75} aria-hidden />
                        </span>
                    </div>
                </div>
                <div className="k-translate-mode__pair">
                    <span className="k-translate-mode__caption">
                        <span className="k-source__code">{locales.current.toUpperCase()}</span>
                        {languageNameOf(locales.current)}
                    </span>
                    {/* A new value from the model replaces the input, which rich text reads only once. */}
                    <Control
                        key={`${field.path}:${revision}`}
                        id={`translate-${field.path}`}
                        name={field.name}
                        label={labelOf(field)}
                        schema={field.schema}
                        root={field.schema}
                        value={value}
                        onChange={(next) => onChange(field.path, next)}
                        disabled={!field.writable || busy}
                        brand={field.brand}
                        searchTool={field.searchTool}
                        labels={field.options}
                        blocks={field.blocks}
                        required
                    />
                </div>
                <div className="k-translate-mode__actions">
                    <button
                        type="button"
                        className="k-button k-button--secondary k-button--small"
                        disabled={busy || !field.writable}
                        onClick={() => onTranslate(field.path)}>
                        <Languages {...ICON} />
                        {busy ? 'Translating…' : pending === 'changed' ? 'Update' : 'Translate'}
                    </button>
                    {pending === 'changed' ? (
                        <button type="button" className="k-text-button" disabled={busy} onClick={() => onKeep(field.path)}>
                            <Check {...ICON} />
                            Keep
                        </button>
                    ) : null}
                    <span className="k-translate-mode__grow" />
                    {current + 1 < steps.length ? (
                        <button type="button" className="k-text-button k-translate-mode__next" onClick={() => onGo(current + 1)}>
                            Next
                            <ArrowDown {...ICON} />
                        </button>
                    ) : null}
                </div>
            </section>
        </div>
    );
}

/**
 * How far translate mode has come: the field shown, of how many, and a bar
 * filling as they are done.
 */
export function TranslateProgress({ current, total, done }: { current: number; total: number; done: number }): ReactNode {
    return (
        <span className="k-translate-progress">
            <b>
                {Math.min(current + 1, total)} of {total}
            </b>
            <span className="k-translate-progress__meter">
                <i
                    style={{
                        width: `${total === 0 ? 0 : Math.round((done / total) * 100)}%`,
                    }}
                />
            </span>
        </span>
    );
}
