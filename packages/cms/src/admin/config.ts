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
     * The role the editor signed in with, shown under their name.
     */
    role: string | null;
    /**
     * Where Sign out goes: `signOutPath` on `cms()`, or the CMS's own
     * sign-out route when `auth.signOut` is set.
     */
    signOutPath: string | null;
    /**
     * How Sign out reaches `signOutPath`: `GET`, a link to your app's route,
     * or `POST`, a form sent to the CMS's sign-out route, which answers with
     * a redirect to the sign-in screen.
     */
    signOutMethod?: 'GET' | 'POST';
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

/**
 * A field the list can show as a column: one of `indexes`, which sorts, or
 * one `columns` names, which shows until the editor hides it.
 */
export interface ListColumnOption {
    field: string;
    /**
     * The field's `label`, or `null` to show its name.
     */
    label: string | null;
    sortable: boolean;
    shown: boolean;
}

export interface ListOptions {
    /**
     * The field naming each item's parent, for a collection with a `tree`.
     */
    tree?: string;
    filters: ListFilter[];
    columns: ListColumnOption[];
}
