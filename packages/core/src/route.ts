import type { RouteHandler } from './handler-pipeline.js';
import type { AuthoredRouteDefinition } from './types.js';

/**
 * A route and the handler that answers it.
 */
export type RouteWithHandler<Definition extends AuthoredRouteDefinition, HandlerContext = unknown> = Definition & {
    handler: RouteHandler<Definition, HandlerContext>;
};

/**
 * What `k.route` returns: the route, waiting for its handler.
 */
export interface RouteBuilder<Definition extends AuthoredRouteDefinition, HandlerContext = unknown> {
    /**
     * The handler that answers this route. `body`, `params`, `query` and
     * `headers` are typed from the route, and the return is checked against its
     * `responses`.
     */
    handler(fn: RouteHandler<Definition, HandlerContext>): RouteWithHandler<Definition, HandlerContext>;
}

export const createRoute = <Definition extends AuthoredRouteDefinition>(definition: Definition): RouteBuilder<Definition> => ({
    handler: (fn) => ({
        ...definition,
        handler: fn,
    }),
});
