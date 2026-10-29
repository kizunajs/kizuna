import { parseRef } from '../refs.js';
import { singularOf } from '../view/array-rows.js';
import { humanize, type DescribedField } from '../view/schema.js';

/**
 * Whether a document the CMS answered for is one the editor can work on: an
 * item no one created is not found, and a document none of whose fields the
 * editor may change is one they cannot edit.
 */
export const documentStateOf = (document: {
    kind: string;
    version: number;
    draft: Record<string, unknown> | null;
    fields: readonly DescribedField[];
}): 'open' | 'not-found' | 'no-access' => {
    if (document.kind === 'item' && document.version === 0 && document.draft === null) return 'not-found';
    const changeable = document.fields.filter((field) => field.parent === undefined && !field.readOnly);
    if (changeable.length > 0 && changeable.every((field) => !field.writable)) return 'no-access';
    return 'open';
};

/**
 * What a document is called in a sentence, in lower case, "article" for an
 * item of Articles, and where its list is.
 */
export const documentNounOf = (
    ref: string,
    collectionLabel: (name: string) => string | undefined
): {
    noun: string;
    list:
        | {
              label: string;
              collection?: string;
          }
        | undefined;
} => {
    const parsed = parseRef(ref);
    if (parsed?.type === 'item') {
        const label = collectionLabel(parsed.collection) ?? humanize(parsed.collection);
        const one = singularOf(label);
        return {
            noun: one === label ? 'item' : one.toLowerCase(),
            list: {
                label,
                collection: parsed.collection,
            },
        };
    }
    if (parsed?.type === 'page') {
        return {
            noun: 'page',
            list: {
                label: 'Pages',
            },
        };
    }
    return {
        noun: 'document',
        list: undefined,
    };
};

/**
 * A document's title before the CMS has answered for it, from its ref: the
 * global or page's name written out, like "Footer".
 */
export const titleOfRef = (ref: string): string => {
    const parsed = parseRef(ref);
    if (parsed === undefined) return ref;
    return humanize(parsed.type === 'item' ? parsed.id : parsed.name);
};

/**
 * What a no-access screen says of the editor's role: "Your role, Editor," or
 * "Your account" without one.
 */
export const roleSubjectOf = (role: string | null): string => (role === null ? 'Your account' : `Your role, ${humanize(role)},`);
