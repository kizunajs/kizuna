import { z } from 'zod';
import { problemDetails } from '@ts-kizuna/core';
import { McpServer } from '@modelcontextprotocol/server';
import { flattenRoutes, validateRequest } from '@ts-kizuna/core/adapter';
import {
    ResponseError,
    type AdapterRequest,
    type ApiWithRouter,
    type GuardMap,
    type RequestContextMap,
    ROUTER_META,
    GUARDS_META,
    SCHEMES_META,
    GUARD_SCHEMA_META,
    REQUEST_CONTEXT_META,
    extractCredential,
    withPermissions,
    type GuardDenialBody,
    resolveSecurityRequirements,
    guardDenyFor,
    isGuardDenial,
} from '@ts-kizuna/core/adapter';
import { contractOf } from '@ts-kizuna/core/adapter';
import type { Contract, Routes, RouteDefinition, SecurityScheme } from '@ts-kizuna/core';
import { isIdempotentMethod, isSafeMethod } from './method.js';
import { deriveToolNames } from '@ts-kizuna/core/generator';
import { flattenTools, toolRunnerFrom, TOOLS_META, type ToolsMeta, type ToolRunner } from '@ts-kizuna/core/adapter';
import { publishedTools, ToolExecutionError, ToolInputError, ToolOutputError, type PublishedTool, type Tools } from '@ts-kizuna/core';
import { buildToolInputSchema, buildToolOutputSchema, type ToolInputSchema } from './schema.js';
import { selectToolRoutes, selectTools, type ToolSelection } from './tool-selection.js';

export interface McpServerOptions {
    /**
     * What the server offers: the contract's routes and tools, which routes to
     * publish, and which tools to hide.
     */
    options?: ToolSelection;

    /**
     * Human-readable name for the MCP server.
     *
     * @default 'MCP Server'
     */
    name?: string;

    /**
     * Semantic version string (e.g. "1.0.0").
     *
     * @default '1.0.0'
     */
    version?: string;

    /**
     * Keep only the methods RFC 9110 calls safe, so no tool an assistant calls
     * can change data.
     *
     * @default false
     */
    onlyReadOnly?: boolean;

    /**
     * Guidance for the model, appended to the overview built from the
     * contract's tags. Use it for what belongs to no single route: the order
     * operations happen in, the conventions every route shares.
     */
    instructions?: string;

    /**
     * Extra context spread into every handler call.
     *
     * Adapter-specific endpoints populate this automatically with the
     * framework's request object (e.g. `{ req, res }` for Express,
     * `{ request }` for Next.js).
     */
    handlerContext?: Record<string, unknown>;

    /**
     * Headers of the MCP transport request, used to extract credentials for
     * secured routes so their guards can run per tool call. Adapter-specific
     * endpoints populate this automatically; configure the MCP client to send
     * the credential (e.g. an `Authorization` header) on its connection.
     */
    credentialHeaders?: Record<string, string | string[] | undefined>;

    /**
     * A scheme the transport has already verified for this request. Its guard
     * is skipped per tool call, and `context` reaches handlers under
     * `auth.<scheme>`.
     */
    transportAuth?: {
        scheme: string;
        context?: Record<string, unknown>;
    };
}

interface Annotations {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
}

/**
 * Hints from the method's HTTP semantics, per RFC 9110. MCP already defaults
 * `destructiveHint` and `openWorldHint` to true, so only the hints that make a
 * tool safer than that are worth setting.
 */
const buildToolAnnotations = (route: RouteDefinition): Annotations => ({
    ...(isSafeMethod(route.method) ? { readOnlyHint: true } : {}),
    ...(isIdempotentMethod(route.method) ? { idempotentHint: true } : {}),
    ...(route.method === 'DELETE' ? { destructiveHint: true } : {}),
});

const describeRequirement = (scheme: string, scopes: readonly string[]): string =>
    scopes.length > 0 ? `${scheme} (scopes: ${scopes.join(', ')})` : scheme;

const buildToolDescription = (route: RouteDefinition): string => {
    const parts: string[] = [];
    if (route.summary) parts.push(route.summary);
    if (route.description) parts.push(route.description);
    if (parts.length === 0) parts.push(`${route.method} ${route.path}`);
    parts.push(`\nHTTP: ${route.method} ${route.path}`);

    const requirements = resolveSecurityRequirements(route);
    if (requirements.length > 0) {
        parts.push(`Requires: ${requirements.map(({ scheme, scopes }) => describeRequirement(scheme, scopes)).join(', ')}`);
    }

    return parts.join('\n');
};

export interface ToolDefinition {
    name: string;
    title: string | undefined;
    description: string;
    inputSchema: ToolInputSchema;
    outputSchema: z.ZodType;
    route: RouteDefinition;
    routeKey: string;
    tags: string[];
}

export const buildToolDefinitions = (routes: Routes, options?: McpServerOptions): ToolDefinition[] => {
    const selected = selectToolRoutes(flattenRoutes(routes), options?.options);
    const names = deriveToolNames(
        selected.map(({ routeKey }) => ({
            key: routeKey,
            origin: 'route',
        }))
    );
    const definitions: ToolDefinition[] = [];

    for (const { routeKey, route, routeTags } of selected) {
        const name = names.get(routeKey)!;
        definitions.push({
            name,
            title: route.summary,
            description: buildToolDescription(route),
            inputSchema: buildToolInputSchema(route),
            outputSchema: buildToolOutputSchema(route),
            route,
            routeKey,
            tags: routeTags,
        });
    }

    return definitions;
};

/**
 * The declared tools a selection publishes. Everything handed over, unless
 * `expose` says otherwise. `publishedTools` does the naming, so a tool is named
 * in one place whichever surface publishes it.
 */
export const buildDeclaredToolDefinitions = (tools: Tools | undefined, options?: McpServerOptions): PublishedTool[] => {
    if (!tools) return [];
    const selected = publishedTools(selectTools(flattenTools(tools), options?.options));
    // Names are derived once more here so a bad key fails at startup, not at call time.
    deriveToolNames(
        selected.map(({ toolKey }) => ({
            key: toolKey,
            origin: 'tool',
        }))
    );
    return selected;
};

/**
 * A declared tool's description, with the identity it needs appended the way a
 * route's requirements are.
 */
const declaredDescription = (published: PublishedTool): string =>
    published.identity === undefined ? published.description : `${published.description}\nRequires: ${published.identity}`;

/**
 * What a client puts in front of the model before it picks a tool.
 */
export const buildInstructions = (
    contract: Contract | undefined,
    definitions: readonly ToolDefinition[],
    declared: readonly PublishedTool[],
    authored: string | undefined
): string => {
    const sections: string[] = [];
    if (definitions.length > 0) {
        sections.push('Every tool named after an HTTP route returns `{ status, body }`. A status of 400 or more means the call failed.');
    }
    if (declared.length > 0) {
        sections.push('The remaining tools return their own result directly.');
    }

    const tags = contract?.tags?.tags;
    if (tags !== undefined) {
        // A group whose every route was excluded is not a group the model has.
        const exposed = new Set(definitions.flatMap((definition) => definition.tags));
        const groups = Object.entries(tags)
            .filter(([key]) => exposed.has(key))
            .map(([, tag]) => (tag.description ? `- ${tag.title}: ${tag.description}` : `- ${tag.title}`));
        if (groups.length > 0) sections.push(`Groups:\n${groups.join('\n')}`);
    }

    if (authored) sections.push(authored);

    return sections.join('\n\n');
};

const resolveHandler = (router: Record<string, unknown>, routeKey: string): unknown => {
    const segments = routeKey.split('.');
    let current: unknown = router;
    for (const segment of segments) {
        if (!current || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[segment];
    }
    return current;
};

type ToolCallResult = { content: Array<{ type: 'text'; text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean };

/**
 * The `{ status, body }` envelope every tool returns. A success also rides
 * along as `structuredContent`, matching the advertised output schema.
 */
const toolEnvelope = (status: number, body: unknown): ToolCallResult => {
    const envelope = {
        status,
        body,
    };
    const isError = status >= 400;

    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(envelope, null, 2),
            },
        ],
        ...(isError
            ? {}
            : {
                  structuredContent: envelope,
              }),
        isError,
    };
};

// A tool result is `{ status, body }`, not an HTTP response, so no envelope.
const toolError = (status: number, body: GuardDenialBody): ToolCallResult => ({
    content: [
        {
            type: 'text' as const,
            text: JSON.stringify(
                {
                    status,
                    body,
                },
                null,
                2
            ),
        },
    ],
    isError: true,
});

/**
 * Resolve every request context declared on the contract, the way the HTTP
 * pipeline does, reading the headers of the transport request. Guards and
 * handlers both read the result.
 */
const resolveRequestContext = async (
    contextResolvers: RequestContextMap | undefined,
    params: Record<string, string>,
    credentialHeaders: Record<string, string | string[] | undefined> | undefined,
    handlerContext: Record<string, unknown> | undefined
): Promise<Record<string, unknown>> => {
    const resolved: Record<string, unknown> = {};
    if (!contextResolvers) return resolved;
    for (const [name, resolver] of Object.entries(contextResolvers)) {
        resolved[name] = await resolver({
            ...(handlerContext ?? {}),
            params,
            headers: credentialHeaders ?? {},
        } as Parameters<typeof resolver>[0]);
    }
    return resolved;
};

/**
 * Run the guards a secured route requires, extracting each identity's
 * credential from the MCP transport request headers, the same pipeline the
 * HTTP adapters run. Returns the scheme-keyed security context for the handler
 * args, or a {@link ToolCallResult} error when a guard denies.
 */
const runGuards = async (
    requirements: ReturnType<typeof resolveSecurityRequirements>,
    label: string,
    params: Record<string, string>,
    guards: GuardMap | undefined,
    schemes: Record<string, SecurityScheme> | undefined,
    handlerContext: Record<string, unknown> | undefined,
    credentialHeaders: Record<string, string | string[] | undefined> | undefined,
    requestContext: Record<string, unknown>,
    transportAuth: McpServerOptions['transportAuth'],
    guardSchema: z.ZodType | undefined
): Promise<{ ok: true; securityContext: Record<string, unknown> } | { ok: false; result: ToolCallResult }> => {
    const securityContext: Record<string, unknown> = {};
    const credentialRequest = {
        headers: credentialHeaders ?? {},
        query: {},
    } as unknown as AdapterRequest<unknown>;

    for (const { scheme, scopes } of requirements) {
        if (scheme === transportAuth?.scheme) {
            if (transportAuth.context !== undefined) {
                securityContext[scheme] = withPermissions(scheme, schemes?.[scheme], transportAuth.context);
            }
            continue;
        }
        const guard = guards?.[scheme];
        if (!guard) {
            return {
                ok: false,
                result: toolError(500, {
                    detail: `No guard registered for security scheme "${scheme}" required by ${label}.`,
                }),
            };
        }
        const schemeDefinition = schemes?.[scheme];
        const credential = schemeDefinition ? extractCredential(schemeDefinition, credentialRequest) : {};
        const guardResult = await guard({
            ...(handlerContext ?? {}),
            ...credential,
            params,
            deny: guardDenyFor(schemeDefinition),
            scopes,
            ...(Object.keys(requestContext).length > 0 ? { requestContext } : {}),
        } as Parameters<typeof guard>[0]);
        if (isGuardDenial(guardResult)) {
            return {
                ok: false,
                result: toolError(guardResult.status, guardResult.body),
            };
        }
        if (guardResult && typeof guardResult === 'object') {
            securityContext[scheme] = withPermissions(scheme, schemeDefinition, guardResult);
        }
    }
    return {
        ok: true,
        securityContext,
    };
};

const executeToolCall = async (
    route: RouteDefinition,
    routeKey: string,
    args: Record<string, unknown>,
    router: Record<string, unknown>,
    handlerContext?: Record<string, unknown>,
    guards?: GuardMap,
    schemes?: Record<string, SecurityScheme>,
    credentialHeaders?: Record<string, string | string[] | undefined>,
    contextResolvers?: RequestContextMap,
    transportAuth?: McpServerOptions['transportAuth'],
    guardSchema?: z.ZodType
): Promise<ToolCallResult> => {
    const params = (args.params ?? {}) as Record<string, string>;
    const query = (args.query ?? {}) as Record<string, unknown>;
    const body = args.body;

    const validation = validateRequest(route, {
        params,
        query,
        body,
        headers: {},
    });

    if (!validation.ok) {
        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(
                        {
                            status: 400,
                            body: {
                                detail: `Validation failed: ${validation.error.stage}`,
                                errors: validation.error.issues,
                            },
                        },
                        null,
                        2
                    ),
                },
            ],
            isError: true,
        };
    }

    const handler = resolveHandler(router, routeKey);
    if (typeof handler !== 'function') {
        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(
                        {
                            status: 500,
                            body: {
                                detail: `Handler not implemented: ${routeKey}`,
                            },
                        },
                        null,
                        2
                    ),
                },
            ],
            isError: true,
        };
    }

    const requestContext = await resolveRequestContext(contextResolvers, params, credentialHeaders, handlerContext);

    const guardOutcome = await runGuards(
        resolveSecurityRequirements(route),
        `route "${routeKey}"`,
        params,
        guards,
        schemes,
        handlerContext,
        credentialHeaders,
        requestContext,
        transportAuth,
        guardSchema
    );
    if (!guardOutcome.ok) {
        return guardOutcome.result;
    }

    try {
        const throwError = (response: { status: number; body: unknown; headers?: Record<string, string> }): never => {
            throw new ResponseError(response);
        };

        const result = await (handler as (args: unknown) => Promise<{ status: number; body: unknown }>)({
            params: validation.parsed.params,
            query: validation.parsed.query,
            body: validation.parsed.body,
            headers: validation.parsed.headers,
            throwError,
            ...handlerContext,
            ...(Object.keys(requestContext).length > 0 ? { requestContext } : {}),
            ...(Object.keys(guardOutcome.securityContext).length > 0 ? { auth: guardOutcome.securityContext } : {}),
        });

        return toolEnvelope(result.status, result.body);
    } catch (error) {
        if (error instanceof ResponseError) {
            return toolEnvelope(error.status, error.body);
        }

        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(
                        {
                            status: 500,
                            body: {
                                detail: error instanceof Error ? error.message : 'Internal Server Error',
                            },
                        },
                        null,
                        2
                    ),
                },
            ],
            isError: true,
        };
    }
};

/**
 * Run one declared tool. There is no HTTP envelope here, so the result carries
 * the tool's own output and nothing more.
 */
const executeDeclaredToolCall = async (
    definition: PublishedTool,
    args: Record<string, unknown>,
    runner: ToolRunner<Tools> | undefined,
    handlerContext?: Record<string, unknown>,
    guards?: GuardMap,
    schemes?: Record<string, SecurityScheme>,
    credentialHeaders?: Record<string, string | string[] | undefined>,
    contextResolvers?: RequestContextMap,
    transportAuth?: McpServerOptions['transportAuth'],
    guardSchema?: z.ZodType
): Promise<ToolCallResult> => {
    if (!runner) {
        return toolError(500, {
            detail: `No handler was bound for tool "${definition.toolKey}".`,
        });
    }

    const { identity } = definition;
    if (identity !== undefined) {
        // A tool declares no path, so its guard runs over empty params.
        const guardOutcome = await runGuards(
            [
                {
                    scheme: identity,
                    scopes: [],
                },
            ],
            `tool "${definition.toolKey}"`,
            {},
            guards,
            schemes,
            handlerContext,
            credentialHeaders,
            await resolveRequestContext(contextResolvers, {}, credentialHeaders, handlerContext),
            transportAuth,
            guardSchema
        );
        if (!guardOutcome.ok) return guardOutcome.result;
    }

    try {
        const output = await runner.call({
            id: definition.name,
            name: definition.toolKey,
            input: args,
        } as never);
        const value = (output as { output?: unknown }).output;

        return {
            content: [
                {
                    type: 'text' as const,
                    text: definition.output ? JSON.stringify(value, null, 2) : `${definition.toolKey} ran.`,
                },
            ],
            ...(definition.output
                ? {
                      structuredContent: value as Record<string, unknown>,
                  }
                : {}),
            isError: false,
        };
    } catch (error) {
        if (error instanceof ToolExecutionError) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: error.message,
                    },
                ],
                isError: true,
            };
        }
        if (error instanceof ToolInputError || error instanceof ToolOutputError) {
            return toolError(400, {
                detail: error.message,
            });
        }
        return toolError(500, {
            detail: error instanceof Error ? error.message : 'Internal Server Error',
        });
    }
};

/**
 * Create an MCP server from a kizuna API.
 *
 * Each route in the routes becomes an MCP tool. When an AI assistant calls
 * a tool, the corresponding handler is invoked directly.
 *
 * ```ts
 * import { createMcpServer } from '@ts-kizuna/mcp';
 * import { api } from './api';
 *
 * const server = createMcpServer(api);
 * ```
 */
export const createMcpServer = (api: ApiWithRouter, options?: McpServerOptions): McpServer => {
    const router = api[ROUTER_META];
    const guards = (api as unknown as Record<typeof GUARDS_META, GuardMap | undefined>)[GUARDS_META];
    const schemes = (api as unknown as Record<typeof SCHEMES_META, Record<string, SecurityScheme> | undefined>)[SCHEMES_META];
    const guardSchema = (api as unknown as Record<typeof GUARD_SCHEMA_META, z.ZodType | undefined>)[GUARD_SCHEMA_META];
    const contextResolvers = (api as unknown as Record<typeof REQUEST_CONTEXT_META, RequestContextMap | undefined>)[REQUEST_CONTEXT_META];

    const contract = contractOf<Contract | undefined>(api);
    const toolsMeta = (api as unknown as Record<typeof TOOLS_META, ToolsMeta | undefined>)[TOOLS_META];
    const toolRunner = toolRunnerFrom(toolsMeta);

    const definitions = buildToolDefinitions(api.routes, options);
    const declared = buildDeclaredToolDefinitions(contract?.tools, options);

    // Routes and declared tools share one name space, so a clash has to surface at startup.
    const claimed = new Map(definitions.map((definition) => [definition.name, definition.routeKey]));
    for (const definition of declared) {
        const claimant = claimed.get(definition.name);
        if (claimant !== undefined) {
            throw new Error(
                `Route "${claimant}" and tool "${definition.toolKey}" both publish as "${definition.name}". Rename one of them.`
            );
        }
    }

    const server = new McpServer(
        {
            name: options?.name ?? 'MCP Server',
            version: options?.version ?? '1.0.0',
        },
        {
            instructions: buildInstructions(contract, definitions, declared, options?.instructions),
        }
    );

    for (const definition of definitions) {
        server.registerTool(
            definition.name,
            {
                ...(definition.title === undefined
                    ? {}
                    : {
                          title: definition.title,
                      }),
                description: definition.description,
                inputSchema: definition.inputSchema.shape === undefined ? undefined : z.object(definition.inputSchema.shape),
                outputSchema: definition.outputSchema,
                annotations: buildToolAnnotations(definition.route),
            },
            async (args: Record<string, unknown>) =>
                executeToolCall(
                    definition.route,
                    definition.routeKey,
                    args ?? {},
                    router,
                    options?.handlerContext,
                    guards,
                    schemes,
                    options?.credentialHeaders,
                    contextResolvers,
                    options?.transportAuth,
                    guardSchema
                )
        );
    }

    for (const definition of declared) {
        server.registerTool(
            definition.name,
            {
                ...(definition.title === undefined
                    ? {}
                    : {
                          title: definition.title,
                      }),
                description: declaredDescription(definition),
                inputSchema: definition.input,
                outputSchema: definition.output,
                annotations: definition.annotations ?? {},
            },
            async (args: unknown) =>
                executeDeclaredToolCall(
                    definition,
                    (args ?? {}) as Record<string, unknown>,
                    toolRunner,
                    options?.handlerContext,
                    guards,
                    schemes,
                    options?.credentialHeaders,
                    contextResolvers,
                    options?.transportAuth,
                    guardSchema
                )
        );
    }

    return server;
};
