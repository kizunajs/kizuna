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
     * What editors call the site, from `name` on `cms()`, which each tab's
     * title ends with.
     */
    siteName?: string | undefined;
    /**
     * The site's origin, which images resolve against.
     */
    siteUrl: string | null;
    /**
     * Where the API is mounted, which every route's path starts under.
     */
    apiPath: string;
    /**
     * Where the admin is served, which every screen's address starts under.
     */
    adminPath: string;
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
    /**
     * How a chat connects to the CMS's MCP route, for Edit in your chat, or
     * `null` when the API serves no MCP route.
     */
    chat?: ChatConnection | null;
    /**
     * The sites the editor may open, from `sites` on `cms()`, which the
     * sidebar's switcher lists. Empty for a project with one site.
     */
    sites?: AdminSite[];
    /**
     * Whether the editor is an admin over every site, who opens Overview.
     */
    allSites?: boolean;
    /**
     * The sites that set their own values on each shared global and
     * collection, by its name, which a shared document's tabs list.
     */
    siteValues?: Record<string, string[]>;
}

/**
 * One of the sites `declareSites()` made, as the admin's switcher and
 * addresses know it.
 */
export interface AdminSite {
    key: string;
    label: string;
    /**
     * The site's icon as a full URL, which the switcher and the browser tab
     * show, or `null` without one.
     */
    icon: string | null;
    /**
     * The country the site serves, from the region of its first locale, like
     * `NO`, which the switcher groups many sites by.
     */
    country?: string | null;
    /**
     * Where the site is served, like `https://hagen.example.co.uk`.
     */
    url?: string;
    /**
     * The languages the site is written in, its source first.
     */
    locales?: string[];
    /**
     * The code the site's tile shows when it has no icon of its own, from a
     * `code` the site declares.
     */
    code?: string;
    /**
     * The names of the site's pages.
     */
    pages: string[];
    /**
     * The globals only this site has.
     */
    globals: AdminSiteEntry[];
    /**
     * The collections only this site has.
     */
    collections: AdminSiteEntry[];
}

export interface AdminSiteEntry {
    name: string;
    /**
     * The definition's `label`, or `null` to show its name.
     */
    label: string | null;
}

/**
 * The MCP route a chat connects to, and what the admin's Edit in your chat
 * puts in its command.
 */
export interface ChatConnection {
    /**
     * Where the MCP route is, from the site's root.
     */
    path: string;
    /**
     * The name `claude mcp add` gives the server, from the MCP plugin's
     * `name`.
     */
    name: string;
    /**
     * Whether the route signs a chat in with OAuth, which Claude's own
     * connectors need.
     */
    oauth: boolean;
    /**
     * The token the chat sends as the editor, from `auth.chatToken`, or
     * `null` without one.
     */
    token: string | null;
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
    /**
     * The label of each value the column shows, where the server gives none.
     */
    choices?: Array<{
        value: string;
        label: string;
    }>;
}

export interface ListOptions {
    /**
     * The field naming each item's parent, for a collection with a `tree`.
     */
    tree?: string;
    /**
     * Each item picks the sites that show it, under Shows on.
     */
    chooseSites?: boolean;
    filters: ListFilter[];
    columns: ListColumnOption[];
}
