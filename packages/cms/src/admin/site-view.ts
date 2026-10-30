import { parseRef } from '../refs.js';
import { valueAt, type DescribedField } from '../view/schema.js';

// TODO(sites): the shape the CMS's describe is expected to answer once fields take `perSite`. Without it the admin edits as it does for one site.
/**
 * A field as `describe` answers it with sites. `perSite` marks a field of
 * shared content each site may give its own value, and in a site's view it
 * holds the shared value the field falls back to.
 */
export type SiteField = DescribedField & {
    perSite?: {
        shared?: unknown;
    };
};

/**
 * Whether a document is shared content: not a page, and not a site's own
 * global or item.
 */
export const isShared = (ref: string): boolean => {
    const parsed = parseRef(ref);
    return parsed !== undefined && parsed.type !== 'page' && parsed.site === undefined;
};

/**
 * Whether the document has fields a site may give its own value, so a site's
 * view of it differs from the shared one.
 */
export const hasPerSiteFields = (fields: readonly SiteField[]): boolean => fields.some((field) => field.perSite !== undefined);

const isEmpty = (value: unknown): boolean => value === undefined || value === null || value === '';

/**
 * The fields as a site's view of shared content shows them, for the site
 * labelled `siteLabel`: only the fields the site may give its own value,
 * each over the shared one, which an empty field shows faintly. For
 * `undefined`, the shared view, a field a site may override says so.
 */
export const fieldsInSite = (
    fields: readonly SiteField[],
    draft: Record<string, unknown> | null,
    siteLabel: string | undefined
): SiteField[] => {
    if (siteLabel === undefined) return fields.map((field) => (field.perSite === undefined ? field : sharedMarked(field)));
    const own = fields.filter((field) => field.perSite !== undefined).map((field) => field.path);
    const isOwn = (field: SiteField): boolean => own.some((path) => field.path === path || field.path.startsWith(`${path}.`));
    return fields.filter(isOwn).map((field) => {
        if (field.perSite === undefined) return field;
        const shared = field.perSite.shared;
        return {
            ...field,
            help: isEmpty(valueAt(draft, field.path)) ? siteLabel : `${siteLabel}. Clear it to show the shared value.`,
            schema: isEmpty(shared)
                ? field.schema
                : {
                      ...field.schema,
                      default: shared,
                  },
        };
    });
};

const sharedMarked = (field: SiteField): SiteField => ({
    ...field,
    help: 'Shared. Each site may set its own.',
});
