import { flattenRoutes, validateRequest, type FlattenedRoute, type RawInputs, type ValidationFailure } from './handler-pipeline.js';
import { parsePath } from './path-params.js';
import { problemDetails } from './problem-details.js';
import { buildToolDefinitions, toolOptionsOf, type ToolDefinition } from './tool-definitions.js';
import type { ToolCall, ToolError, ToolResult } from './tool-events.js';
import type { RouteDefinition, Routes } from './types.js';
import { isVoidSchema } from './zod-internals.js';

/**
 * A call as the model sent it. `name` is the tool name or its dotted key.
 */
export interface ToolRunCall {
    id: string;
    name: string;
    input?: unknown;
}

export interface ToolRunOptions {
    /**
     * The person's answer to a call that needs approval. Unset, the call waits.
     * `false` declines it.
     */
    approved?: boolean;
}

/**
 * The call as the model knows it, to put back in the conversation.
 */
export interface ModelToolCall {
    id: string;
    name: string;
    input: unknown;
}

/**
 * How a call went. `content` is what the model reads.
 */
export type ToolRunResult = {
    call: ModelToolCall;
} & (
    | {
          state: 'done';
          status: number;
          body: unknown;
          content: string;
          isError: false;
      }
    | {
          state: 'failed';
          status: number;
          body: unknown;
          content: string;
          isError: true;
      }
    | {
          state: 'declined';
          content: string;
          isError: true;
      }
    | {
          /**
           * Nothing ran. The client asks the person and sends a {@link ToolAnswer} back.
           */
          state: 'needs-approval';
      }
);

/**
 * The person's answer to a call that needs approval.
 */
export interface ToolAnswer {
    call: ToolRunCall;
    approved: boolean;
}

/**
 * The tool events `run` yields.
 */
export type ToolEventYield<R extends Routes> =
    | {
          event: 'tool_call';
          data: ToolCall<R, 'input'>;
      }
    | {
          event: 'tool_result';
          data: ToolResult<R, 'input'>;
      }
    | {
          event: 'tool_error';
          data: ToolError<R>;
      };

/**
 * The routes a streamed response names under `tools`, bound to the caller.
 */
export interface StreamTools<R extends Routes = Routes> {
    /**
     * What to hand the model.
     */
    readonly definitions: ToolDefinition[];

    /**
     * Run one call as the caller, through the route's validation, guards and
     * handler. An answered call runs with `run(answer.call, answer)`.
     *
     * @example
     * ```ts
     * const result = yield* tools.run({
     *     id: block.id,
     *     name: block.name,
     *     input: block.input,
     * });
     * ```
     */
    run: (call: ToolRunCall, options?: ToolRunOptions) => AsyncGenerator<ToolEventYield<R>, ToolRunResult, undefined>;
}

/**
 * What the request pipeline lends a tool call.
 */
export interface ToolPipeline {
    headers: unknown;
    invoke: (entry: FlattenedRoute, parsed: RawInputs, params: Record<string, string>) => Promise<{ status: number; body: unknown }>;
    render: (failure: ValidationFailure) => { status: number; body: unknown };
}

const DECLINED = 'Declined, so nothing ran.';

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

const detailOf = (status: number, body: unknown): string =>
    isRecord(body) && typeof body['detail'] === 'string' ? body['detail'] : `The route answered ${status}.`;

const callInput = (route: RouteDefinition, parsed: RawInputs): Record<string, unknown> | undefined => {
    const input: Record<string, unknown> = {};
    if (parsePath(route.path).paramNames.length > 0) input['params'] = parsed.params;
    if (route.query) input['query'] = parsed.query;
    if (route.body && !isVoidSchema(route.body)) input['body'] = parsed.body;
    return Object.keys(input).length > 0 ? input : undefined;
};

const definitionsCache = new WeakMap<Routes, ToolDefinition[]>();

const definitionsFor = (tools: Routes): ToolDefinition[] => {
    const cached = definitionsCache.get(tools);
    if (cached) return cached;
    const built = buildToolDefinitions(tools);
    definitionsCache.set(tools, built);
    return built;
};

/**
 * Bind a response's tools to the request streaming it.
 */
export const createStreamTools = <R extends Routes>(tools: R, pipeline: ToolPipeline): StreamTools<R> => {
    const definitions = definitionsFor(tools);
    const entries = new Map(flattenRoutes(tools).map((entry) => [entry.routeKey, entry]));
    const keysByName = new Map(definitions.map((definition) => [definition.name, definition.key]));

    const namesByKey = new Map(definitions.map((definition) => [definition.key, definition.name]));

    const answered = (call: ModelToolCall, status: number, body: unknown): ToolRunResult => {
        const content = JSON.stringify({
            status,
            body,
        });
        return status < 400
            ? {
                  call,
                  state: 'done',
                  status,
                  body,
                  content,
                  isError: false,
              }
            : {
                  call,
                  state: 'failed',
                  status,
                  body,
                  content,
                  isError: true,
              };
    };

    async function* run(call: ToolRunCall, options: ToolRunOptions = {}): AsyncGenerator<ToolEventYield<R>, ToolRunResult, undefined> {
        const key = keysByName.get(call.name) ?? call.name;
        const entry = entries.get(key);
        const modelCall = {
            id: call.id,
            name: namesByKey.get(key) ?? call.name,
            input: call.input ?? {},
        };
        // An unknown name has no event to go in.
        if (entry === undefined) {
            return answered(
                modelCall,
                404,
                problemDetails(404, `No tool named "${call.name}". Call one of: ${[...keysByName.keys()].join(', ')}.`)
            );
        }

        const failed = (status: number, body: unknown) =>
            ({
                event: 'tool_error',
                data: {
                    id: call.id,
                    name: key,
                    message: detailOf(status, body),
                },
            }) as ToolEventYield<R>;

        const input = isRecord(call.input) ? call.input : {};
        // Guards read params as strings, as from a URL.
        const params = Object.fromEntries(
            Object.entries(isRecord(input['params']) ? input['params'] : {}).map(([name, value]) => [name, String(value)])
        );
        const validation = validateRequest(entry.route, {
            params,
            query: input['query'] ?? {},
            body: input['body'],
            headers: pipeline.headers,
        });
        if (!validation.ok) {
            const rendered = pipeline.render(validation.error);
            yield failed(rendered.status, rendered.body);
            return answered(modelCall, rendered.status, rendered.body);
        }

        const validated = callInput(entry.route, validation.parsed);
        const needsApproval = toolOptionsOf(entry.route)?.needsApproval === true;
        const waiting = needsApproval && options.approved === undefined;
        yield {
            event: 'tool_call',
            data: {
                id: call.id,
                name: key,
                ...(waiting
                    ? {
                          needsApproval: true,
                      }
                    : {}),
                ...(validated === undefined
                    ? {}
                    : {
                          input: validated,
                      }),
            },
        } as ToolEventYield<R>;

        if (waiting) {
            return {
                call: modelCall,
                state: 'needs-approval',
            };
        }
        if (needsApproval && options.approved === false) {
            yield {
                event: 'tool_error',
                data: {
                    id: call.id,
                    name: key,
                    message: DECLINED,
                },
            } as ToolEventYield<R>;
            return {
                call: modelCall,
                state: 'declined',
                content: DECLINED,
                isError: true,
            };
        }

        const { status, body } = await pipeline.invoke(entry, validation.parsed, params);
        if (status >= 400) {
            yield failed(status, body);
        } else {
            yield {
                event: 'tool_result',
                data: {
                    id: call.id,
                    name: key,
                    ...(body === undefined
                        ? {}
                        : {
                              output: body,
                          }),
                },
            } as ToolEventYield<R>;
        }
        return answered(modelCall, status, body);
    }

    return {
        definitions,
        run,
    };
};
