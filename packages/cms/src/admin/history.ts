import { sameContent } from '../same-content.js';
import { labelOf, valueAt, type DescribedField } from '../view/schema.js';

/**
 * One version of a document as its history lists it.
 */
export interface VersionSummary {
    version: number;
    summary: string | null;
    createdAt: string;
    createdBy: string;
    published: boolean;
}

/**
 * One field that differs between a version and the current draft, each side
 * written out to read.
 */
export interface FieldChange {
    path: string;
    label: string;
    then: string;
    now: string;
}

/**
 * The longest a value shows in a comparison before it is cut.
 */
const SHOWN_LENGTH = 80;

const clip = (text: string): string => {
    const trimmed = text.replace(/\s+/g, ' ').trim();
    return trimmed.length > SHOWN_LENGTH ? `${trimmed.slice(0, SHOWN_LENGTH - 1)}…` : trimmed;
};

const isRichText = (value: readonly unknown[]): boolean =>
    value.every((item) => typeof item === 'object' && item !== null && (item as { _type?: unknown })._type === 'block');

const richTextOf = (blocks: readonly unknown[]): string =>
    blocks
        .flatMap((block) => (block as { children?: Array<{ text?: unknown }> }).children ?? [])
        .map((span) => (typeof span.text === 'string' ? span.text : ''))
        .join(' ');

/**
 * A field's value in a few words: text as it reads, a choice by its label,
 * and anything larger by what it holds.
 */
export const shownValue = (value: unknown, options?: Readonly<Record<string, string>>): string => {
    if (value === undefined || value === null || value === '') return 'Empty';
    if (typeof value === 'string') return clip(options?.[value] ?? value);
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) {
        if (value.length === 0) return 'Empty';
        if (isRichText(value)) {
            const text = clip(richTextOf(value));
            return text === '' ? 'Empty' : text;
        }
        if (value.every((item) => typeof item === 'string')) return clip(value.map((item) => options?.[item] ?? item).join(', '));
        return value.length === 1 ? '1 item' : `${value.length} items`;
    }
    return 'Set';
};

/**
 * The fields a version holds differently from the draft, in the order the
 * form shows them. A field with fields inside it compares each of those.
 */
export const fieldChanges = (
    fields: readonly DescribedField[],
    then: Record<string, unknown> | null,
    now: Record<string, unknown> | null
): FieldChange[] =>
    fields
        .filter((field) => !fields.some((candidate) => candidate.parent === field.path))
        .filter((field) => !sameContent(valueAt(then, field.path), valueAt(now, field.path)))
        .map((field) => {
            const parent = field.parent === undefined ? undefined : fields.find((candidate) => candidate.path === field.parent);
            return {
                path: field.path,
                label: parent === undefined ? labelOf(field) : `${labelOf(parent)}, ${labelOf(field)}`,
                then: shownValue(valueAt(then, field.path), field.options),
                now: shownValue(valueAt(now, field.path), field.options),
            };
        });

const SAVED_AT = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
});

const SAVED_AT_IN_YEAR = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

/**
 * When a version was saved, as a day and a time, with the year once it is
 * not this one.
 */
export const savedAtOf = (iso: string, today: Date = new Date()): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return (date.getFullYear() === today.getFullYear() ? SAVED_AT : SAVED_AT_IN_YEAR).format(date);
};
