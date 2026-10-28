/**
 * One editing route as the admin calls it: its method, and its path under
 * the API with `:param` placeholders.
 */
export interface AdminRoute {
    method: string;
    path: string;
}

/**
 * What the server writes into the admin page when it serves it.
 */
export interface AdminConfig {
    /**
     * The site's origin, which images resolve against.
     */
    siteUrl: string | null;
    /**
     * Where the API is mounted, which every route's path starts under.
     */
    apiPath: string;
    /**
     * The editing routes, by the tool name the editor calls them by.
     */
    routes: Record<string, AdminRoute>;
    /**
     * The `group` each collection and view declares, by its name.
     */
    groups: Record<string, string>;
    /**
     * How each collection lists: its tree and the fields it filters by, by
     * the collection's name.
     */
    lists: Record<string, ListOptions>;
}

/**
 * A field of `indexes` the list filters by.
 */
export interface ListFilter {
    field: string;
    /**
     * The field's `label`, or `null` to show its name.
     */
    label: string | null;
    /**
     * An enum's values, with the label editors see for each.
     */
    choices?: Array<{
        value: string;
        label: string;
    }>;
    /**
     * The brand of the ids the field holds, which the editor picks among.
     */
    brand?: string;
    /**
     * The ids are of a collection with a `tree`, so the filter can keep the
     * items under the one picked too.
     */
    nested?: boolean;
}

export interface ListOptions {
    /**
     * The field naming each item's parent, for a collection with a `tree`.
     */
    tree?: string;
    filters: ListFilter[];
}
