import type { FlattenedRoute } from 'kizunajs/adapter';
import { routeStreams, type RouteDefinition, type RouteToolOptions } from 'kizunajs';

/**
 * Tool input is JSON, so a route that reads a form body has nothing to receive
 * it.
 */
const takesJsonInput = (route: RouteDefinition): boolean => route.contentType === undefined || route.contentType === 'application/json';

/**
 * What a route says about publishing itself, or `undefined` when it says
 * nothing.
 */
export const toolOptionsOf = (route: RouteDefinition): RouteToolOptions | undefined => {
    if (route.tool === undefined || route.tool === false) return undefined;
    return route.tool === true ? {} : route.tool;
};

/**
 * The routes a model may call: the ones that declared `tool`, less the ones
 * whose shape a tool call cannot carry.
 */
export const selectToolRoutes = (routes: FlattenedRoute[]): FlattenedRoute[] =>
    routes.filter(({ route }) => {
        if (toolOptionsOf(route) === undefined) return false;
        // A tool result is one value, so a route that streams has nothing to return.
        return takesJsonInput(route) && !routeStreams(route);
    });
