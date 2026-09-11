import { z } from 'zod';
import {
    flattenTools,
    isCompiledTool,
    toolAt,
    type CompiledTool,
    type FlattenedTool,
    type ToolAnnotations,
    type ToolDefinition,
    type ToolHandlers,
    type Tools,
} from './tools.js';
import { toToolName } from './tool-name.js';
import type { ToolCall, ToolKeys, ToolResult } from './tool-events.js';

/**
 * The arguments a tool takes when run in code: its input when it declares one,
 * nothing otherwise.
 */
export type ToolRunArgs<Tool extends CompiledTool> = Tool['definition'] extends {
    input: z.ZodType;
}
    ? [input: z.input<Tool['definition']['input']>]
    : [];

/**
 * What a tool resolves to once its output has been validated.
 */
export type ToolRunReturn<Definition extends ToolDefinition> = Definition extends {
    output: z.ZodType;
}
    ? z.output<Definition['output']>
    : void;

export interface ToolFn<Tool extends CompiledTool> {
    /**
     * Validate the input, run the handler, validate what it returned.
     */
    run: (...args: ToolRunArgs<Tool>) => Promise<ToolRunReturn<Tool['definition']>>;
}

/**
 * A contract's tools, shaped exactly like the declaration.
 */
export type ToolTree<Tools_ extends Tools> = {
    [Name in keyof Tools_]: Tools_[Name] extends CompiledTool
        ? ToolFn<Tools_[Name]>
        : Tools_[Name] extends Tools
          ? ToolTree<Tools_[Name]>
          : never;
};

/**
 * One tool resolved for publication: its MCP name alongside everything a
 * publisher needs. The schemas stay as Zod, because MCP's own SDK converts
 * them and a model-facing list converts them differently.
 */
export interface PublishedTool {
    /**
     * The MCP name, e.g. `weather_get_forecast`.
     */
    name: string;
    /**
     * The dotted key the rest of kizuna addresses the tool by.
     */
    toolKey: string;
    title: string | undefined;
    description: string;
    input: z.ZodType | undefined;
    output: z.ZodType | undefined;
    annotations: ToolAnnotations | undefined;
    /**
     * The identity every tool in the group requires, or `undefined`.
     */
    identity: string | undefined;
}

/**
 * One tool in MCP's `Tool` shape, with its schemas as JSON Schema. What a model
 * is given.
 */
export interface ModelFacingTool {
    name: string;
    title?: string;
    description: string;
    inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    annotations?: ToolAnnotations;
}

/**
 * A contract's tools bound to their handlers.
 *
 * @example
 * await tools.weather.getForecast.run({ city: 'Oslo' });
 */
export type ToolRunner<Tools_ extends Tools> = ToolTree<Tools_> & {
    /**
     * Run the tool one `tool_call` payload names and resolve to the matching
     * `tool_result` payload, ready to yield straight back onto the stream.
     */
    call: <const Call extends ToolCall<Tools_, 'output'>>(
        call: Call
    ) => Promise<Extract<ToolResult<Tools_, 'output'>, { name: Call['name'] }>>;
    /**
     * Every tool in MCP's `Tool` shape, with `inputSchema` as JSON Schema. This
     * is what a model is given.
     */
    definitions: ModelFacingTool[];
    /**
     * The dotted key behind a published tool name, so a name the model chose
     * becomes the key the rest of kizuna addresses a tool by.
     */
    keyOf: (publishedName: string) => ToolKeys<Tools_>;
};

export class ToolInputError extends Error {
    readonly tool: string;
    readonly issues: z.core.$ZodIssue[];

    constructor(tool: string, issues: z.core.$ZodIssue[]) {
        super(`Input for tool "${tool}" failed validation.`);
        this.name = 'ToolInputError';
        this.tool = tool;
        this.issues = issues;
    }
}

export class ToolOutputError extends Error {
    readonly tool: string;
    readonly issues: z.core.$ZodIssue[];

    constructor(tool: string, issues: z.core.$ZodIssue[]) {
        super(`Output of tool "${tool}" failed validation.`);
        this.name = 'ToolOutputError';
        this.tool = tool;
        this.issues = issues;
    }
}

/**
 * What `throwError` raises: the sentence the model reads, and the tool that
 * produced it.
 */
export class ToolExecutionError extends Error {
    readonly tool: string;

    constructor(tool: string, message: string) {
        super(message);
        this.name = 'ToolExecutionError';
        this.tool = tool;
    }
}

/**
 * MCP asks for an object schema even when a tool takes nothing, and this is the
 * form it recommends.
 */
const NO_ARGUMENTS = {
    type: 'object',
    additionalProperties: false,
};

const toJsonSchema = (schema: z.ZodType, io: 'input' | 'output'): Record<string, unknown> =>
    z.toJSONSchema(schema, {
        unrepresentable: 'any',
        io,
    }) as Record<string, unknown>;

/**
 * Resolve tools for publication: the MCP name, and the declaration behind it.
 * Both `tools.definitions` and the MCP plugin build on this, so a tool is
 * named and described in exactly one place.
 */
export const publishedTools = (tools: FlattenedTool[]): PublishedTool[] =>
    tools.map(({ toolKey, tool }) => ({
        name: toToolName(toolKey),
        toolKey,
        title: tool.definition.title,
        description: tool.definition.description,
        input: tool.input,
        output: tool.output,
        annotations: tool.definition.annotations,
        identity: tool.identity,
    }));

/**
 * Every tool in MCP's `Tool` shape, schemas converted to JSON Schema. Backs
 * `tools.definitions`.
 */
export const publishTools = (tools: Tools): ModelFacingTool[] =>
    publishedTools(flattenTools(tools)).map((published) => ({
        name: published.name,
        ...(published.title === undefined ? {} : { title: published.title }),
        description: published.description,
        inputSchema: published.input ? toJsonSchema(published.input, 'input') : NO_ARGUMENTS,
        ...(published.output === undefined ? {} : { outputSchema: toJsonSchema(published.output, 'output') }),
        ...(published.annotations === undefined ? {} : { annotations: published.annotations }),
    }));

const handlerAt = (handlers: unknown, toolKey: string): unknown => {
    let current: unknown = handlers;
    for (const segment of toolKey.split('.')) {
        if (!current || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[segment];
    }
    return current;
};

/**
 * Pair a contract's tools with their handlers so they can be run from anywhere.
 *
 * Every handler already receives this as `tools`, so reach for it directly only
 * outside a request: in a script, a seed, or a test.
 */
export const createToolRunner = <Tools_ extends Tools>(
    source:
        | Tools_
        | {
              tools?: Tools_;
          },
    handlers: ToolHandlers<Tools_>
): ToolRunner<Tools_> => {
    const tools = (source && 'tools' in source ? ((source.tools ?? {}) as Tools_) : (source as Tools_)) ?? ({} as Tools_);

    const toolFor = (toolKey: string): CompiledTool => {
        const tool = toolAt(tools, toolKey);
        if (!tool) throw new Error(`No tool named "${toolKey}" on this contract.`);
        return tool;
    };

    const invoke = async (toolKey: string, input: unknown): Promise<unknown> => {
        const tool = toolFor(toolKey);
        const handler = handlerAt(handlers, toolKey);
        if (typeof handler !== 'function') throw new Error(`No handler was bound for tool "${toolKey}".`);

        let validatedInput: unknown = undefined;
        if (tool.input) {
            const parsed = tool.input.safeParse(input);
            if (!parsed.success) throw new ToolInputError(toolKey, parsed.error.issues);
            validatedInput = parsed.data;
        }

        const returned = await (handler as (args: unknown) => unknown)({
            input: validatedInput,
            throwError: (message: string): never => {
                throw new ToolExecutionError(toolKey, message);
            },
        });

        if (!tool.output) return undefined;
        const parsed = tool.output.safeParse(returned);
        if (!parsed.success) throw new ToolOutputError(toolKey, parsed.error.issues);
        return parsed.data;
    };

    const buildTree = (nodes: Tools, prefix: string): Record<string, unknown> => {
        const result: Record<string, unknown> = {};
        for (const [name, node] of Object.entries(nodes)) {
            const toolKey = prefix ? `${prefix}.${name}` : name;
            if (isCompiledTool(node)) {
                result[name] = {
                    run: (input?: unknown) => invoke(toolKey, input),
                };
            } else if (node && typeof node === 'object') {
                result[name] = buildTree(node as Tools, toolKey);
            }
        }
        return result;
    };

    const keys = new Map(flattenTools(tools).map(({ toolKey }) => [toToolName(toolKey), toolKey]));

    const tree = buildTree(tools, '') as Record<string, unknown>;

    tree['call'] = async (call: { id: string; name: string; input?: unknown }) => {
        const tool = toolFor(call.name);
        const output = await invoke(call.name, call.input);
        return {
            id: call.id,
            name: call.name,
            ...(tool.output ? { output } : {}),
        };
    };

    tree['definitions'] = publishTools(tools);

    tree['keyOf'] = (publishedName: string): string => {
        const toolKey = keys.get(publishedName);
        if (toolKey === undefined) {
            throw new Error(
                `No tool publishes as "${publishedName}". The names this contract publishes are: ${[...keys.keys()].join(', ')}.`
            );
        }
        return toolKey;
    };

    return tree as ToolRunner<Tools_>;
};

/**
 * The `tools` argument every handler receives: the contract's tools bound to
 * their handlers. Absent when the contract declares none.
 */
export type ToolsArg<Tools_ extends Tools> = string extends keyof Tools_
    ? {}
    : {
          tools: ToolRunner<Tools_>;
      };
