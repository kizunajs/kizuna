import { z } from 'zod';
import type { RouteDefinition, Routes, StreamDefinition, StreamResponseDefinition } from './types.js';
import { isStreamResponse, isZodSchema } from './generator-utils.js';
import { flattenRoutes } from './handler-pipeline.js';
import { parsePath } from './path-params.js';
import { readObjectShape } from './zod-internals.js';

/**
 * Every route in a tree as its dotted key, e.g. `'weather.getForecast'`. A tool
 * is addressed by that key everywhere, the way a job is.
 */
export type ToolKeys<R extends Routes, Prefix extends string = ''> = {
    [Name in keyof R & string]: R[Name] extends RouteDefinition
        ? `${Prefix}${Name}`
        : R[Name] extends Routes
          ? ToolKeys<R[Name], `${Prefix}${Name}.`>
          : never;
}[keyof R & string];

/**
 * The route one dotted key names.
 */
export type ToolAt<R extends Routes, Key extends string> = Key extends `${infer Head}.${infer Rest}`
    ? R[Head] extends Routes
        ? ToolAt<R[Head], Rest>
        : never
    : R[Key] extends RouteDefinition
      ? R[Key]
      : never;

type SchemaSide<Schema extends z.ZodType, Io extends 'input' | 'output'> = Io extends 'input' ? z.input<Schema> : z.output<Schema>;

/**
 * Collapse an intersection into one object, so a call reads as the record it
 * is rather than as the pieces it was built from.
 */
type Flatten<Shape> = {
    [Key in keyof Shape]: Shape[Key];
} & {};

/**
 * What a model sends to call a route: the same `{ params, query, body }` the
 * MCP endpoint takes, with each part present only when the route declares it.
 */
type ToolInput<Route, Io extends 'input' | 'output'> = Flatten<
    (Route extends { pathParams: infer Params extends z.ZodType } ? { params: SchemaSide<Params, Io> } : {}) &
        (Route extends { query: infer Query extends z.ZodType } ? { query: SchemaSide<Query, Io> } : {}) &
        (Route extends { body: infer Body extends z.ZodType } ? { body: SchemaSide<Body, Io> } : {})
>;

/**
 * What the route answers with, read from its `200`.
 */
type ToolOutput<Route, Io extends 'input' | 'output'> = Route extends { responses: { 200: infer Response } }
    ? Response extends z.ZodType
        ? SchemaSide<Response, Io>
        : Response extends { body: infer Body extends z.ZodType }
          ? SchemaSide<Body, Io>
          : never
    : never;

/**
 * The `input` field of a call, absent for a route that takes nothing.
 */
type InputField<Route, Io extends 'input' | 'output'> = [keyof ToolInput<Route, Io>] extends [never] ? {} : { input: ToolInput<Route, Io> };

/**
 * The `output` field of a result, absent for a route that reports nothing.
 */
type OutputField<Route, Io extends 'input' | 'output'> = [ToolOutput<Route, Io>] extends [never] ? {} : { output: ToolOutput<Route, Io> };

/**
 * One tool call, discriminated on `name` so `input` narrows to the route's own
 * argument type.
 */
export type ToolCall<R extends Routes, Io extends 'input' | 'output' = 'output'> = {
    [Key in ToolKeys<R>]: Flatten<
        {
            id: string;
            name: Key;
        } & InputField<ToolAt<R, Key>, Io>
    >;
}[ToolKeys<R>];

/**
 * One tool result, discriminated on `name` so `output` narrows to the route's
 * own result type.
 */
export type ToolResult<R extends Routes, Io extends 'input' | 'output' = 'output'> = {
    [Key in ToolKeys<R>]: Flatten<
        {
            id: string;
            name: Key;
        } & OutputField<ToolAt<R, Key>, Io>
    >;
}[ToolKeys<R>];

/**
 * A tool that failed. The payload is the same whichever route it was, so this
 * carries the name as a plain enum rather than a discriminated union.
 */
export interface ToolError<R extends Routes> {
    id: string;
    name: ToolKeys<R>;
    message: string;
}

/**
 * The events {@link toolEvents} adds to a stream.
 */
export interface ToolEvents<R extends Routes> {
    tool_call: z.ZodType<ToolCall<R, 'output'>, ToolCall<R, 'input'>>;
    tool_result: z.ZodType<ToolResult<R, 'output'>, ToolResult<R, 'input'>>;
    tool_error: z.ZodType<ToolError<R>>;
}

/**
 * The `{ params, query, body }` a route takes as a tool, as schemas, so the
 * stream events and the MCP endpoint agree on one shape.
 */
export const toolInputShape = (route: RouteDefinition): Record<string, z.ZodType> => {
    const shape: Record<string, z.ZodType> = {};

    const paramNames = parsePath(route.path).paramNames;
    if (paramNames.length > 0) {
        const declared = (route.pathParams ? readObjectShape(route.pathParams) : undefined) as Record<string, z.ZodType> | undefined;
        shape['params'] = z.object(Object.fromEntries(paramNames.map((name) => [name, declared?.[name] ?? z.string()])));
    }
    if (route.query) shape['query'] = route.query;
    if (route.body) shape['body'] = route.body;

    return shape;
};

/**
 * What a route answers a tool call with, read from its `200`.
 */
const toolOutputSchema = (route: RouteDefinition): z.ZodType | undefined => {
    const response = route.responses[200];
    if (response === undefined) return undefined;
    if (isZodSchema(response)) return response;
    return 'body' in response && isZodSchema(response.body) ? response.body : undefined;
};

/**
 * Server-sent events for the routes a model may call, to spread into a route's
 * `stream`. Each one is discriminated on the route's dotted key, so a client's
 * `for await` narrows the payload to the route that produced it.
 *
 * @example
 * ```ts
 * stream: {
 *     delta: z.object({
 *         text: z.string(),
 *     }),
 * },
 * tools: assistantTools,
 * ```
 */
export const toolEvents = <const R extends Routes>(tools: R): ToolEvents<R> => {
    const entries = flattenRoutes(tools as Routes);
    if (entries.length === 0) {
        throw new Error('`toolEvents` was given no routes. Name at least one route a model may call, or drop the spread.');
    }

    const names = entries.map(({ routeKey }) => routeKey);
    const identifier = {
        id: z.string(),
    };

    const callArms = entries.map(({ routeKey, route }) => {
        const input = toolInputShape(route);
        return z.object({
            ...identifier,
            name: z.literal(routeKey),
            ...(Object.keys(input).length > 0 ? { input: z.object(input) } : {}),
        });
    });

    const resultArms = entries.map(({ routeKey, route }) => {
        const output = toolOutputSchema(route);
        return z.object({
            ...identifier,
            name: z.literal(routeKey),
            ...(output ? { output } : {}),
        });
    });

    const oneOf = (arms: z.ZodObject[]): z.ZodType =>
        arms.length === 1 ? arms[0]! : z.discriminatedUnion('name', arms as [z.ZodObject, z.ZodObject, ...z.ZodObject[]]);

    return {
        tool_call: oneOf(callArms),
        tool_result: oneOf(resultArms),
        tool_error: z.object({
            ...identifier,
            name: z.enum(names as [string, ...string[]]),
            message: z.string(),
        }),
    } as unknown as ToolEvents<R>;
};

/**
 * The events a stream carries once its `tools` have been folded in. A response
 * declaring none is its `stream` untouched.
 */
export type StreamWithTools<Def extends StreamResponseDefinition> = Def extends {
    tools: infer R extends Routes;
}
    ? Def['stream'] & ToolEvents<R>
    : Def['stream'];

/**
 * Fold a response's `tools` into its `stream`, so everything downstream reads
 * one record of named events and never learns a tool was involved. Called by
 * `k.routes` before a route is validated.
 */
export const expandStreamTools = (route: RouteDefinition, routeKey: string): void => {
    for (const [status, response] of Object.entries(route.responses)) {
        if (!isStreamResponse(response)) continue;
        const { tools } = response;
        if (tools === undefined) continue;

        const where = `Route "${routeKey}" declares tools on status ${status}`;
        if (isZodSchema(response.stream)) {
            throw new Error(`${where} beside a single stream schema. Tool events are named, so name the other events too.`);
        }

        const events = toolEvents(tools);
        const named = response.stream as Record<string, z.ZodType>;
        for (const name of Object.keys(events)) {
            if (name in named) {
                throw new Error(`${where}, but its stream already names an event "${name}". Rename that event.`);
            }
        }

        const mutable = response as {
            stream: StreamDefinition;
            tools?: Routes;
        };
        mutable.stream = {
            ...named,
            ...(events as unknown as Record<string, z.ZodType>),
        };
        delete mutable.tools;
    }
};
