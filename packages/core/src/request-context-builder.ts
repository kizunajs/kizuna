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

/**
 * A request context and the resolver that fills it.
 */
export type RequestContextWithHandler<Declaration extends RequestContextSchema> = Declaration & {
    /**
     * Stored without its argument types, so a config that lists request
     * contexts never depends on what a resolver reads back off that config.
     */
    handler: (args: never) => unknown;
};

/**
 * What `k.requestContext` returns: the declaration, waiting for its resolver.
 */
export interface RequestContextBuilder<Declaration extends RequestContextSchema, HandlerContext> {
    /**
     * The resolver that fills this request context. It runs on every route,
     * public ones included, before the guards, and never denies.
     */
    handler(fn: RequestContextHandlerFor<Declaration, HandlerContext>): RequestContextWithHandler<Declaration>;
}

export const createRequestContextBuilder = <Declaration extends RequestContextSchema>(
    declaration: Declaration
): RequestContextBuilder<Declaration, unknown> => ({
    handler: (fn) => ({
        ...declaration,
        handler: fn as (args: never) => unknown,
        [DECLARATION]: 'requestContext' as const,
    }),
});
