import { flattenRoutes } from './handler-pipeline.js';
import { toolOptionsOf } from './tool-definitions.js';
import type { Routes } from './types.js';

/**
 * The origins a view may reach, as MCP Apps names them. A host blocks
 * everything a view does not list.
 */
export interface ToolViewCsp {
    /**
     * Origins the view may `fetch` or open a WebSocket to.
     */
    connectDomains?: readonly string[];
    /**
     * Origins the view may load scripts, styles, images and fonts from.
     */
    resourceDomains?: readonly string[];
    /**
     * Origins the view may show in a nested `iframe`.
     */
    frameDomains?: readonly string[];
    /**
     * Origins the view's document may set as its base URI.
     */
    baseUriDomains?: readonly string[];
}

/**
 * An HTML page a host renders a tool's result in, served over MCP as a `ui://`
 * resource (MCP Apps). The page talks to the host, and through it calls this
 * API's tools as the person in the chat.
 */
export interface ToolView {
    /**
     * Where the host reads the page from, e.g. `ui://cms/document`.
     */
    uri: `ui://${string}`;
    /**
     * The resource's name, for a client listing resources.
     */
    name: string;
    description?: string;
    /**
     * The page, as one self-contained HTML document. Read when a host asks
     * for it, so it can load a built file.
     */
    html: () => string | Promise<string>;
    csp?: ToolViewCsp;
    /**
     * Ask the host to draw its own border and background around the view.
     */
    prefersBorder?: boolean;
}

/**
 * Declare a view a route's `tool` can name under `ui`.
 *
 * @example
 * ```ts
 * export const userView = defineView({
 *     uri: 'ui://users/user',
 *     name: 'User',
 *     html: () => readFile(userViewPath, 'utf8'),
 * });
 * ```
 */
export const defineView = (view: ToolView): ToolView => view;

/**
 * Who may call a tool, in MCP Apps' terms: `model` lets the model call it,
 * `app` lets a view on the same server call it.
 */
export type ToolVisibility = 'model' | 'app';

/**
 * Check every route's `ui` and `visibility` against the rest, so a view MCP
 * would serve under two pages, or a tool nothing can call, fails at startup.
 */
export const assertValidViews = (routes: Routes): void => {
    const views = new Map<string, ToolView>();
    const appOnly: string[] = [];

    for (const { route, routeKey } of flattenRoutes(routes)) {
        const declared = toolOptionsOf(route);
        if (declared === undefined) continue;

        const visibility = declared.visibility;
        if (visibility !== undefined && visibility.length === 0) {
            throw new Error(`Route '${routeKey}' declares an empty \`visibility\`, so nothing could call it. Name 'model', 'app' or both.`);
        }
        if (visibility !== undefined && !visibility.includes('model')) appOnly.push(routeKey);

        const view = declared.ui;
        if (view === undefined) continue;
        if (!view.uri.startsWith('ui://')) {
            throw new Error(`Route '${routeKey}' names a view at '${view.uri}'. A view's \`uri\` starts with \`ui://\`.`);
        }
        const existing = views.get(view.uri);
        if (existing !== undefined && existing !== view) {
            throw new Error(`Two different views share the uri '${view.uri}'. Give each its own, or name the same view from both routes.`);
        }
        views.set(view.uri, view);
    }

    if (appOnly.length > 0 && views.size === 0) {
        throw new Error(
            `Route '${appOnly[0]}' is a tool only a view may call, and no route names a view under \`ui\`. Add 'model' to its \`visibility\`, or give a route a view.`
        );
    }
};
