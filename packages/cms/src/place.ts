import { isKey } from './keys.js';

/**
 * Where an orderable collection keeps an item's place: a key in its stored
 * content beside its fields, in the draft and the published copy alike. The
 * schema strips it from every read, so no reader ever sees it.
 */
export const PLACE = '_place';

/**
 * The place stored content holds, or `undefined` before it has one.
 */
export const placeIn = (content: Record<string, unknown> | null | undefined): string | undefined => {
    const place = content?.[PLACE];
    return typeof place === 'string' && isKey(place) ? place : undefined;
};

/**
 * Compares two items the way the store sorts them: by place, an item without
 * one after those with one, then by the document's id.
 */
export const byPlace = (
    left: {
        place: string | undefined;
        id: string;
    },
    right: {
        place: string | undefined;
        id: string;
    }
): number => {
    if (left.place !== right.place) {
        if (left.place === undefined) return 1;
        if (right.place === undefined) return -1;
        return left.place < right.place ? -1 : 1;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
};
