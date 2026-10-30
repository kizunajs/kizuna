import { formatRef, parseRef } from '../refs.js';
import type { Description } from '../view/schema.js';

/**
 * Whether a document is shared content: not a page, and not a site's own
 * global or item.
 */
export const isShared = (ref: string): boolean => {
    const parsed = parseRef(ref);
    return parsed !== undefined && parsed.type !== 'page' && parsed.site === undefined;
};

/**
 * The name of a shared global or collection a ref points into.
 */
export const sharedNameOf = (ref: string): string | undefined => {
    const parsed = parseRef(ref);
    if (parsed === undefined || parsed.type === 'page' || parsed.site !== undefined) return undefined;
    return parsed.type === 'item' ? parsed.collection : parsed.name;
};

/**
 * Where a site keeps its own values on a shared document, like
 * `item:uk:offices:k3j9x2` for the UK's values on a shared office.
 */
export const siteValuesRefOf = (ref: string, site: string): string => {
    const parsed = parseRef(ref);
    return parsed === undefined
        ? ref
        : formatRef({
              ...parsed,
              site,
          });
};

/**
 * A site's values on a shared document as its tab shows them: every field
 * of the shared document in its place, the site's own editable and every
 * other locked with the shared value.
 */
export const withSharedFields = (values: Description, shared: Description): Description => {
    const own = new Map(values.fields.map((field) => [field.path, field]));
    const fields = [
        ...shared.fields.map(
            (field) =>
                own.get(field.path) ?? {
                    ...field,
                    writable: false,
                }
        ),
        ...values.fields.filter((field) => !shared.fields.some((candidate) => candidate.path === field.path)),
    ];
    return {
        ...values,
        fields,
        layout: shared.layout,
        draft: withSharedValues(shared.draft, values.fields, values.draft),
    };
};

/**
 * The shared values with a site's own in place of the fields it sets. A
 * field the site leaves empty stays empty, so its input shows the shared
 * value faintly.
 */
export const withSharedValues = (
    shared: Record<string, unknown> | null,
    ownFields: Description['fields'],
    own: Record<string, unknown> | null
): Record<string, unknown> => {
    const merged: Record<string, unknown> = {
        ...shared,
    };
    for (const field of ownFields) {
        if (field.parent !== undefined) continue;
        delete merged[field.path];
        if (own?.[field.path] !== undefined) merged[field.path] = own[field.path];
    }
    return merged;
};
