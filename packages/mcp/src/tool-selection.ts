import type { FlattenedRoute, FlattenedTool } from '@ts-kizuna/core/adapter';
import { routeStreams, type RouteDefinition, type Routes, type ToolKeys, type Tools } from '@ts-kizuna/core';
import { isSafeMethod } from './method.js';

/**
 * Whether a route, or every route under a group, becomes a tool. A group takes
 * `'*'` for its default, then names the routes that differ.
 */
export type ToolEntry<GroupOrRoute> = GroupOrRoute extends RouteDefinition
    ? boolean
    :
          | boolean
          | ({
                '*'?: boolean;
            } & {
                [Key in keyof GroupOrRoute & string]?: ToolEntry<GroupOrRoute[Key]>;
            });

/**
 * Which routes become tools, keyed by the route tree. `'*'` at the root sets
 * the default for every route, then name the ones that differ.
 */
export type ToolMap<R extends Routes = Routes> = {
    '*'?: boolean;
} & {
    [Key in keyof R & string]?: ToolEntry<R[Key]>;
};

/**
 * The deepest explicit answer wins, then the nearest `'*'`.
 */
const resolveEntry = (map: ToolMap | undefined, routeKey: string, fallback: boolean): boolean => {
    if (map === undefined) return fallback;

    let node: unknown = map;

    for (const segment of routeKey.split('.')) {
        if (typeof node === 'boolean') return node;
        if (node === null || typeof node !== 'object') return fallback;

        const level = node as Record<string, unknown>;
        if (typeof level['*'] === 'boolean') fallback = level['*'];
        if (!(segment in level)) return fallback;
        node = level[segment];
    }

    return typeof node === 'boolean' ? node : fallback;
};

/**
 * Tool input is JSON, so a route that reads a form body has nothing to receive
 * it. This holds whatever the map says.
 */
const takesJsonInput = (route: RouteDefinition): boolean => route.contentType === undefined || route.contentType === 'application/json';

/**
 * The dotted keys of a tool tree, falling back to any string for the wide
 * default, which names no tools of its own.
 */
type HiddenToolKey<T extends Tools> = [ToolKeys<T>] extends [never] ? string : ToolKeys<T>;

/**
 * The choices about what an MCP server offers, passed under `options`. The
 * routes and tools themselves sit beside it.
 */
export interface ToolSelection<R extends Routes = Routes, T extends Tools = Tools> {
    /**
     * Which routes to publish as tools. A route is an HTTP endpoint rather than
     * a tool, so none are published until named here. `'*'` sets the default
     * for a group, or for the whole tree at the root.
     *
     * @example
     * publishRoutes: {
     *     users: {
     *         '*': true,
     *         deleteUser: false,
     *     },
     * }
     */
    publishRoutes?: ToolMap<R>;

    /**
     * Tools to leave out, by dotted key. Everything `k.tools` declares is
     * already a tool, so all of them are published unless listed here.
     *
     * @example
     * hideTools: ['countWords']
     */
    hideTools?: readonly HiddenToolKey<T>[];

    /**
     * Keep only what cannot change data: the routes RFC 9110 calls safe, and
     * the tools declaring `readOnlyHint`.
     *
     * @default false
     */
    onlyReadOnly?: boolean;
}

/**
 * The routes a selection publishes as tools. None, unless `publishRoutes` names
 * them.
 */
export const selectToolRoutes = (routes: FlattenedRoute[], selection: ToolSelection | undefined): FlattenedRoute[] =>
    routes.filter(({ route, routeKey }) => {
        // A tool result is one value, so a route that streams has nothing to return.
        if (!takesJsonInput(route) || routeStreams(route)) return false;
        if (selection?.onlyReadOnly && !isSafeMethod(route.method)) return false;
        return resolveEntry(selection?.publishRoutes, routeKey, false);
    });

/**
 * The declared tools a selection publishes: all of them, less whatever
 * `hideTools` names.
 */
export const selectTools = (tools: FlattenedTool[], selection: ToolSelection | undefined): FlattenedTool[] => {
    const hidden = new Set<string>(selection?.hideTools ?? []);
    return tools.filter(({ toolKey, tool }) => {
        // A declared tool has no method, so `readOnlyHint` is what it says about itself.
        if (selection?.onlyReadOnly && tool.definition.annotations?.readOnlyHint !== true) return false;
        return !hidden.has(toolKey);
    });
};
