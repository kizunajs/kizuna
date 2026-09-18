import type { RouteHandler } from './handler-pipeline.js';
import { DECLARATION, HANDLER } from './types.js';
import type { AuthoredRouteDefinition, RouteHandlerFunction } from './types.js';

/**
 * A route and the handler that answers it. The handler is stored without its
 * argument types, so a config that lists routes never depends on what a handler
 * reads back off that config.
 */
export type RouteWithHandler<Definition extends AuthoredRouteDefinition, HandlerContext = unknown> = Definition & {
    readonly [HANDLER]: RouteHandlerFunction;
};

/**
 * What `k.route` returns: the route itself, and the `handler` that answers it.
 * A route nothing serves, one a generator or a client reads, needs no handler.
 */
export type RouteBuilder<Definition extends AuthoredRouteDefinition, HandlerContext = unknown> = Definition &
    RouteHandlerStep<Definition, HandlerContext>;

interface RouteHandlerStep<Definition extends AuthoredRouteDefinition, HandlerContext> {
    /**
     * The handler that answers this route. `body`, `params`, `query` and
     * `headers` are typed from the route, and the return is checked against its
     * `responses`.
     */
    handler(fn: RouteHandler<Definition, HandlerContext>): RouteWithHandler<Definition, HandlerContext>;
}

export const createRoute = <Definition extends AuthoredRouteDefinition>(definition: Definition): RouteBuilder<Definition> =>
    ({
        ...definition,
        handler: (fn: unknown) => ({
            ...definition,
            [HANDLER]: fn,
            [DECLARATION]: 'route' as const,
        }),
    }) as unknown as RouteBuilder<Definition>;
