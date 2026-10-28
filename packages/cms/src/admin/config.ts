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
     * The `group` each collection declares, by its name.
     */
    groups: Record<string, string>;
}
