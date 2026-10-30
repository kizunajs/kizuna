import { formatRef, parseRef } from '../refs.js';

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

const isSet = (value: unknown): boolean =>
    value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0);

/**
 * Whether a site sets a field itself, rather than showing the shared value.
 */
export const setsOwnValue = (values: Record<string, unknown> | null, path: string): boolean => isSet(values?.[path]);

/**
 * How many values a site sets itself on a shared document, which its tab
 * counts.
 */
export const ownValueCount = (values: Record<string, unknown> | null): number => Object.values(values ?? {}).filter(isSet).length;
