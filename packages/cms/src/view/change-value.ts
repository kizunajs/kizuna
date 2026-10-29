import { humanize, isImage, isRichText, resolveRef, type JsonSchema } from './schema.js';

/**
 * What the field holding a value says about how it reads: its schema, the
 * labels of its choices and the brand of the ids it holds.
 */
export interface ValueShape {
    schema: JsonSchema;
    root: JsonSchema;
    options?: Record<string, string> | undefined;
    brand?: string | undefined;
}

/**
 * The label of an item a reference names, or undefined when it is not known.
 */
export type ReferenceLabel = (brand: string, id: string) => string | undefined;

/**
 * A value the way an editor reads it.
 */
export type Shown =
    | {
          kind: 'empty';
      }
    | {
          kind: 'text';
          text: string;
          /**
           * Whether it is free text, so a change to it is shown word by word.
           */
          prose: boolean;
      }
    | {
          kind: 'image';
          id: string;
          alt: string | undefined;
      }
    | {
          kind: 'list';
          items: Shown[];
      }
    | {
          kind: 'fields';
          entries: Array<{
              label: string;
              value: Shown;
          }>;
      };

export type Piece = {
    kind: 'same' | 'added' | 'removed';
    text: string;
};

interface ImageValue {
    id: string;
    alt?: string;
    crop?: unknown;
    focalPoint?: unknown;
}

/**
 * One change, as before and after.
 */
export type ChangeView =
    | {
          kind: 'words';
          pieces: Piece[];
      }
    | {
          kind: 'replace';
          before: Shown;
          after: Shown;
      }
    | {
          kind: 'image';
          image: {
              id: string;
              alt: string | undefined;
          };
          facts: string[];
      }
    | {
          kind: 'list';
          items: Array<{
              value: Shown;
              added: boolean;
          }>;
          removed: Shown[];
          /**
           * The list as it was, in its old order, with the items it lost
           * marked, for showing it beside the list it becomes.
           */
          before: Array<{
              value: Shown;
              removed: boolean;
          }>;
          summary: string | undefined;
      }
    | {
          kind: 'fields';
          entries: Array<{
              label: string;
              change: ChangeView;
          }>;
      };

const EMPTY: Shown = {
    kind: 'empty',
};

/**
 * The schema itself, past a `$ref` and a nullable `anyOf`.
 */
const concrete = (schema: JsonSchema, root: JsonSchema): JsonSchema => {
    const resolved = resolveRef(schema, root);
    if (resolved.anyOf === undefined || resolved.type !== undefined) return resolved;
    const option = resolved.anyOf.find((candidate) => candidate.type !== 'null');
    return option === undefined ? resolved : resolveRef(option, root);
};

const itemShapeOf = (shape: ValueShape): ValueShape => {
    const resolved = concrete(shape.schema, shape.root);
    return {
        schema: resolved.items ?? {},
        root: shape.root,
        options: shape.options,
        brand: shape.brand ?? resolved.brand,
    };
};

const propertyShapeOf = (shape: ValueShape, key: string): ValueShape => ({
    schema: concrete(shape.schema, shape.root).properties?.[key] ?? {},
    root: shape.root,
});

const propertyLabelOf = (shape: ValueShape, key: string): string => {
    const title = concrete(shape.schema, shape.root).properties?.[key]?.['title'];
    return typeof title === 'string' && title !== '' ? title : humanize(key);
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const looksLikeImage = (value: unknown): value is ImageValue => isRecord(value) && typeof value['id'] === 'string' && 'alt' in value;

const holdsImage = (value: unknown, shape: ValueShape): value is ImageValue =>
    isRecord(value) && typeof value['id'] === 'string' && (isImage(shape.schema, shape.root) || looksLikeImage(value));

/**
 * Portable Text as the words it holds, or undefined when the value is not
 * Portable Text.
 */
export const richTextOf = (value: unknown): string | undefined => {
    if (!Array.isArray(value) || value.length === 0 || !value.every((block) => isRecord(block) && '_type' in block)) return undefined;
    return value
        .map((block: { _type?: string; children?: Array<{ text?: string }> }) =>
            block._type === 'block' ? (block.children ?? []).map((span) => span.text ?? '').join('') : '[image]'
        )
        .join('\n');
};

/**
 * A value as it reads: a choice by its label, an id by the item it names, a
 * switch as On or Off, rich text as its words and a list item by item.
 */
export const showValue = (value: unknown, shape: ValueShape, labelOf: ReferenceLabel): Shown => {
    if (value === undefined || value === null) return EMPTY;
    const resolved = concrete(shape.schema, shape.root);
    if (isRichText(shape.schema) || isRichText(resolved) || richTextOf(value) !== undefined) {
        const text = richTextOf(value) ?? '';
        return text === ''
            ? EMPTY
            : {
                  kind: 'text',
                  text,
                  prose: true,
              };
    }
    if (holdsImage(value, shape)) {
        return {
            kind: 'image',
            id: value.id,
            alt: typeof value.alt === 'string' && value.alt !== '' ? value.alt : undefined,
        };
    }
    if (typeof value === 'string') {
        const brand = shape.brand ?? resolved.brand;
        if (brand !== undefined) {
            return {
                kind: 'text',
                text: labelOf(brand, value) ?? value,
                prose: false,
            };
        }
        if (shape.options !== undefined || resolved.enum !== undefined) {
            return {
                kind: 'text',
                text: shape.options?.[value] ?? humanize(value),
                prose: false,
            };
        }
        return value === ''
            ? EMPTY
            : {
                  kind: 'text',
                  text: value,
                  prose: true,
              };
    }
    if (typeof value === 'number') {
        return {
            kind: 'text',
            text: String(value),
            prose: false,
        };
    }
    if (typeof value === 'boolean') {
        return {
            kind: 'text',
            text: value ? 'On' : 'Off',
            prose: false,
        };
    }
    if (Array.isArray(value)) {
        const itemShape = itemShapeOf(shape);
        return {
            kind: 'list',
            items: value.map((item) => showValue(item, itemShape, labelOf)),
        };
    }
    if (isRecord(value)) {
        const known = Object.keys(resolved.properties ?? {});
        const keys = [...known, ...Object.keys(value).filter((key) => !known.includes(key))];
        return {
            kind: 'fields',
            entries: keys
                .map((key) => ({
                    label: propertyLabelOf(shape, key),
                    value: showValue(value[key], propertyShapeOf(shape, key), labelOf),
                }))
                .filter((entry) => entry.value.kind !== 'empty'),
        };
    }
    return {
        kind: 'text',
        text: String(value),
        prose: false,
    };
};

/**
 * A shown value in one line of text, for where there is no room for more.
 */
export const textOf = (shown: Shown): string => {
    switch (shown.kind) {
        case 'empty':
            return '';
        case 'text':
            return shown.text;
        case 'image':
            return shown.alt ?? 'Image';
        case 'list':
            return shown.items
                .map(textOf)
                .filter((text) => text !== '')
                .join(', ');
        case 'fields':
            return shown.entries.map((entry) => `${entry.label}: ${textOf(entry.value)}`).join(', ');
    }
};

/**
 * The ids a value holds, with the brand each one belongs to, so their labels
 * can be looked up before the change shows.
 */
export const referencesOf = (value: unknown, shape: ValueShape): Array<{ brand: string; id: string }> => {
    if (value === undefined || value === null) return [];
    const resolved = concrete(shape.schema, shape.root);
    if (typeof value === 'string') {
        const brand = shape.brand ?? resolved.brand;
        return brand === undefined
            ? []
            : [
                  {
                      brand,
                      id: value,
                  },
              ];
    }
    if (Array.isArray(value)) {
        if (richTextOf(value) !== undefined) return [];
        const itemShape = itemShapeOf(shape);
        return value.flatMap((item) => referencesOf(item, itemShape));
    }
    if (isRecord(value) && !holdsImage(value, shape)) {
        return Object.keys(value).flatMap((key) => referencesOf(value[key], propertyShapeOf(shape, key)));
    }
    return [];
};

/**
 * A word-level diff: the longest run the two texts share, with what was
 * removed and added around it.
 */
export const wordDiff = (before: string, after: string): Piece[] | undefined => {
    // Each word keeps the space after it, so a run of changed words stays one run.
    const left = before.match(/\S+\s*|\s+/g) ?? [];
    const right = after.match(/\S+\s*|\s+/g) ?? [];
    if (left.length * right.length > 250_000) return undefined;
    const table = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));
    for (let row = left.length - 1; row >= 0; row--) {
        for (let column = right.length - 1; column >= 0; column--) {
            table[row]![column] =
                left[row] === right[column]
                    ? table[row + 1]![column + 1]! + 1
                    : Math.max(table[row + 1]![column]!, table[row]![column + 1]!);
        }
    }
    const pieces: Piece[] = [];
    const push = (kind: Piece['kind'], text: string): void => {
        const last = pieces.at(-1);
        if (last?.kind === kind) last.text += text;
        else
            pieces.push({
                kind,
                text,
            });
    };
    let row = 0;
    let column = 0;
    while (row < left.length && column < right.length) {
        if (left[row] === right[column]) {
            push('same', left[row]!);
            row++;
            column++;
        } else if (table[row + 1]![column]! >= table[row]![column + 1]!) {
            push('removed', left[row]!);
            row++;
        } else {
            push('added', right[column]!);
            column++;
        }
    }
    while (row < left.length) push('removed', left[row++]!);
    while (column < right.length) push('added', right[column++]!);
    return pieces;
};

/**
 * What changed about the same image, in words, since two thumbnails of it
 * look alike.
 */
export const imageFacts = (before: ImageValue, after: ImageValue): string[] => {
    const facts: string[] = [];
    if ((before.alt ?? '') !== (after.alt ?? '')) {
        facts.push(after.alt === undefined || after.alt === '' ? 'Alt text removed' : `Alt text: ${after.alt}`);
    }
    if (JSON.stringify(before.focalPoint ?? null) !== JSON.stringify(after.focalPoint ?? null)) {
        facts.push(after.focalPoint === undefined ? 'Focus point removed' : 'Focus point moved');
    }
    if (JSON.stringify(before.crop ?? null) !== JSON.stringify(after.crop ?? null)) {
        facts.push(after.crop === undefined ? 'Crop removed' : 'Crop changed');
    }
    return facts.length === 0 ? ['Same image, settings changed'] : facts;
};

/**
 * How a list changed: which items are new, which went, and whether the ones
 * it kept moved.
 */
export const listDiff = (
    before: readonly unknown[],
    after: readonly unknown[]
): { added: boolean[]; removed: number[]; reordered: boolean } => {
    const keyOf = (item: unknown): string => JSON.stringify(item) ?? '';
    const left = before.map(keyOf);
    const right = after.map(keyOf);
    const unmatched = new Map<string, number>();
    for (const key of left) unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
    const added = right.map((key) => {
        const count = unmatched.get(key) ?? 0;
        if (count === 0) return true;
        unmatched.set(key, count - 1);
        return false;
    });
    const removed: number[] = [];
    const kept = new Map<string, number>();
    for (const key of right) kept.set(key, (kept.get(key) ?? 0) + 1);
    const keptBefore: string[] = [];
    left.forEach((key, index) => {
        const count = kept.get(key) ?? 0;
        if (count === 0) {
            removed.push(index);
            return;
        }
        kept.set(key, count - 1);
        keptBefore.push(key);
    });
    const keptAfter = right.filter((_, index) => !added[index]);
    return {
        added,
        removed,
        reordered: keptBefore.some((key, index) => keptAfter[index] !== key),
    };
};

const sameValue = (left: unknown, right: unknown): boolean => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

/**
 * A change as the publish review shows it: words added and removed in free
 * text, a list's new order with what it gained and lost, the properties that
 * changed in an object, and otherwise what it was beside what it becomes.
 */
export const changeView = (before: unknown, after: unknown, shape: ValueShape, labelOf: ReferenceLabel): ChangeView => {
    const shownBefore = showValue(before, shape, labelOf);
    const shownAfter = showValue(after, shape, labelOf);
    if (holdsImage(before, shape) && holdsImage(after, shape) && before.id === after.id && shownAfter.kind === 'image') {
        return {
            kind: 'image',
            image: {
                id: shownAfter.id,
                alt: shownAfter.alt,
            },
            facts: imageFacts(before, after),
        };
    }
    if (shownAfter.kind === 'list' && Array.isArray(after) && (shownBefore.kind === 'list' || shownBefore.kind === 'empty')) {
        if (shownBefore.kind === 'empty' || !Array.isArray(before)) {
            return {
                kind: 'list',
                items: shownAfter.items.map((value) => ({
                    value,
                    added: false,
                })),
                removed: [],
                before: [],
                summary: undefined,
            };
        }
        const diff = listDiff(before, after);
        const summary = [
            diff.reordered ? 'order changed' : undefined,
            diff.added.some(Boolean) ? `${diff.added.filter(Boolean).length} added` : undefined,
            diff.removed.length > 0 ? `${diff.removed.length} removed` : undefined,
        ]
            .filter((part) => part !== undefined)
            .join(', ');
        return {
            kind: 'list',
            items: shownAfter.items.map((value, index) => ({
                value,
                added: diff.added[index] ?? false,
            })),
            removed: diff.removed.map((index) => shownBefore.items[index] ?? EMPTY),
            before: shownBefore.items.map((value, index) => ({
                value,
                removed: diff.removed.includes(index),
            })),
            summary: summary === '' ? undefined : summary.replace(/^./, (first) => first.toUpperCase()),
        };
    }
    if (shownBefore.kind === 'fields' && shownAfter.kind === 'fields' && isRecord(before) && isRecord(after)) {
        const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => !sameValue(before[key], after[key]));
        if (keys.length > 0) {
            return {
                kind: 'fields',
                entries: keys.map((key) => ({
                    label: propertyLabelOf(shape, key),
                    change: changeView(before[key], after[key], propertyShapeOf(shape, key), labelOf),
                })),
            };
        }
    }
    if (shownBefore.kind === 'text' && shownAfter.kind === 'text' && shownBefore.prose && shownAfter.prose) {
        const pieces = wordDiff(shownBefore.text, shownAfter.text);
        // Words diff only when the texts share some, or nothing would read as kept.
        if (pieces !== undefined && pieces.some((piece) => piece.kind === 'same' && piece.text.trim() !== '')) {
            return {
                kind: 'words',
                pieces,
            };
        }
    }
    return {
        kind: 'replace',
        before: shownBefore,
        after: shownAfter,
    };
};
