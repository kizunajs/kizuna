import type { z } from 'zod';
import type { RequestContextHeaderValues, RequestContextSchema } from './request-context.js';
import { DECLARATION } from './types.js';

/**
 * A request context's resolver, typed against the declaration it answers.
 */
export type RequestContextHandlerFor<Declaration extends RequestContextSchema, HandlerContext> = (
    args: HandlerContext & {
        params: Record<string, string>;
        headers: RequestContextHeaderValues<Declaration>;
    }
) => z.output<Declaration['context']> | Promise<z.output<Declaration['context']>>;

// Registry-global: a dual ESM/CJS install would otherwise hold two different symbols.
export const RESOLVER: unique symbol = Symbol.for('ts-kizuna.resolver') as symbol as typeof RESOLVER;

/**
 * A request context and the resolver that fills it. The resolver is stored
 * without its argument types, so a config that lists request contexts never
 * depends on what a resolver reads back off that config.
 */
export type RequestContextWithHandler<Declaration extends RequestContextSchema> = Declaration & {
    readonly [RESOLVER]: (args: never) => unknown;
};

/**
 * What `k.requestContext` returns: the declaration itself, and the `handler`
 * that fills it. A request context nothing serves, one a client reads, needs no
 * resolver.
 */
export type RequestContextBuilder<Declaration extends RequestContextSchema, HandlerContext> = Declaration &
    RequestContextHandlerStep<Declaration, HandlerContext>;

interface RequestContextHandlerStep<Declaration extends RequestContextSchema, HandlerContext> {
    /**
     * The resolver that fills this request context. It runs on every route,
     * public ones included, before the guards, and never denies.
     */
    handler(fn: RequestContextHandlerFor<Declaration, HandlerContext>): RequestContextWithHandler<Declaration>;
}

export const createRequestContextBuilder = <Declaration extends RequestContextSchema>(
    declaration: Declaration
): RequestContextBuilder<Declaration, unknown> =>
    ({
        ...declaration,
        handler: (fn: unknown) => ({
            ...declaration,
            [RESOLVER]: fn,
            [DECLARATION]: 'requestContext' as const,
        }),
    }) as unknown as RequestContextBuilder<Declaration, unknown>;
