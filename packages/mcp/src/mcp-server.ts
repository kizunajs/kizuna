import { z } from 'zod';
import { problemDetails } from 'kizunajs';
import {
    McpServer,
    acceptedContent,
    inputRequired,
    type CallToolResult,
    type InputRequiredResult,
    type StandardSchemaWithJSON,
} from '@modelcontextprotocol/server';
import { flattenRoutes, formatValidationError, validateRequest, type ValidationFailure } from 'kizunajs/adapter';
import {
    ResponseError,
    type AdapterRequest,
    type ApiWithRouter,
    type GuardMap,
    type RequestContextMap,
    ROUTER_META,
    GUARDS_META,
    declaredResponseBody,
    SCHEMES_META,
    GUARD_SCHEMA_META,
    REQUEST_CONTEXT_META,
    extractCredential,
    requiresDenial,
    withPermissions,
    type GuardDenialBody,
    resolveSecurityRequirements,
    callGuard,
} from 'kizunajs/adapter';
import { contractOf } from 'kizunajs/adapter';
import type { ApiDefinition, Routes, RouteDefinition, SecurityScheme } from 'kizunajs';
import { isIdempotentMethod, isSafeMethod } from './method.js';
import { deriveToolNames } from 'kizunajs/generator';
import { buildToolOutputSchema } from './schema.js';
import {
    buildToolInputSchema,
    describeTool,
    selectToolRoutes,
    toolInputJsonSchema,
    toolJsonSchema,
    toolOptionsOf,
    type ToolInputSchema,
} from 'kizunajs/adapter';

export interface McpServerOptions {
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
     * API's groups. Use it for what belongs to no single route: the order
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
/**
 * What the elicitation answer comes back under, and the key the retry echoes.
 */
const APPROVAL_KEY = 'approved';

/**
 * How long a client may keep the tool list. It changes only when the app
 * deploys. `private`, because the endpoint may sit behind a credential a shared
 * cache should not answer for.
 */
const TOOL_LIST_CACHE = {
    ttlMs: 5 * 60 * 1000,
    cacheScope: 'private' as const,
};

/**
 * What a tool handler is handed beyond its arguments. Only the answers to an
 * earlier elicitation are read here.
 */
interface McpToolContext {
    mcpReq?: {
        inputResponses?: unknown;
    };
}

/**
 * Ask the person before running, when the call needs approval. Returns the
 * elicitation on the first call, a refusal when they declined, and nothing once
 * they approved.
 */
const approval = (route: RouteDefinition, context: McpToolContext): CallToolResult | InputRequiredResult | undefined => {
    if (toolOptionsOf(route)?.needsApproval !== true) return undefined;

    const answer = acceptedContent<{ approved?: boolean }>(context.mcpReq?.inputResponses as never, APPROVAL_KEY);
    if (answer === undefined) {
        return inputRequired({
            inputRequests: {
                [APPROVAL_KEY]: inputRequired.elicit({
                    message: `Allow "${toolOptionsOf(route)?.title ?? route.summary ?? `${route.method} ${route.path}`}"?`,
                    requestedSchema: {
                        type: 'object',
                        properties: {
                            approved: {
                                type: 'boolean',
                                title: 'Allow',
                            },
                        },
                        required: [APPROVAL_KEY],
                    },
                }),
            },
        });
    }

    if (answer.approved === true) return undefined;
    return {
        content: [
            {
                type: 'text' as const,
                text: 'Declined, so nothing ran.',
            },
        ],
        isError: true,
    };
};

/**
 * What the SDK publishes for a tool. Input passes through unchecked, so the
 * call is validated once, by `validateRequest`, as an HTTP request is. Output
 * keeps the route's own check.
 */
const publishedSchema = (jsonSchema: Record<string, unknown>, check?: z.ZodType): StandardSchemaWithJSON<Record<string, unknown>> => ({
    '~standard': {
        version: 1,
        vendor: 'kizuna',
        validate: check === undefined ? (value) => ({ value: value as Record<string, unknown> }) : (check['~standard'].validate as never),
        jsonSchema: {
            input: () => jsonSchema,
            output: () => jsonSchema,
        },
    },
});

/**
 * What the route says about itself, over what its method already implies.
 */
const buildToolAnnotations = (route: RouteDefinition): Annotations => {
    const declared = toolOptionsOf(route) ?? {};
    return {
        ...(isSafeMethod(route.method) ? { readOnlyHint: true } : {}),
        ...(isIdempotentMethod(route.method) ? { idempotentHint: true } : {}),
        ...(route.method === 'DELETE' ? { destructiveHint: true } : {}),
        ...(declared.title === undefined ? {} : { title: declared.title }),
        ...(declared.readOnlyHint === undefined ? {} : { readOnlyHint: declared.readOnlyHint }),
        ...(declared.idempotentHint === undefined ? {} : { idempotentHint: declared.idempotentHint }),
        ...(declared.destructiveHint === undefined ? {} : { destructiveHint: declared.destructiveHint }),
        ...(declared.openWorldHint === undefined ? {} : { openWorldHint: declared.openWorldHint }),
    };
};

export interface McpTool {
    name: string;
    title: string | undefined;
    description: string;
    inputSchema: ToolInputSchema;
    outputSchema: z.ZodType;
    route: RouteDefinition;
    routeKey: string;
    /**
     * The route's groups, as dotted paths.
     */
    groups: string[];
}

export const buildMcpTools = (routes: Routes): McpTool[] => {
    const selected = selectToolRoutes(flattenRoutes(routes));
    const names = deriveToolNames(
        selected.map(({ routeKey }) => ({
            key: routeKey,
            origin: 'route',
        }))
    );
    const definitions: McpTool[] = [];

    for (const { routeKey, route, routeGroups } of selected) {
        const name = names.get(routeKey)!;
        definitions.push({
            name,
            title: route.summary,
            description: describeTool(route),
            inputSchema: buildToolInputSchema(route),
            outputSchema: buildToolOutputSchema(route),
            route,
            routeKey,
            groups: routeGroups,
        });
    }

    return definitions;
};

interface PublishedTool {
    definition: McpTool;
    inputSchema: StandardSchemaWithJSON<Record<string, unknown>>;
    outputSchema: StandardSchemaWithJSON<Record<string, unknown>>;
    annotations: Annotations;
}

const publishedTools = new WeakMap<Routes, PublishedTool[]>();

/**
 * Every tool with its schemas converted, built once per API rather than on
 * every MCP request.
 */
const publishedToolsFor = (routes: Routes): PublishedTool[] => {
    const cached = publishedTools.get(routes);
    if (cached) return cached;
    const built = buildMcpTools(routes).map((definition) => ({
        definition,
        inputSchema: publishedSchema(toolInputJsonSchema(definition.route)),
        outputSchema: publishedSchema(toolJsonSchema(definition.outputSchema, 'output'), definition.outputSchema),
        annotations: buildToolAnnotations(definition.route),
    }));
    publishedTools.set(routes, built);
    return built;
};

/**
 * What a client puts in front of the model before it picks a tool.
 */
export const buildInstructions = (
    contract: ApiDefinition | undefined,
    definitions: readonly McpTool[],
    authored: string | undefined
): string => {
    const sections: string[] = [];
    if (definitions.length > 0) {
        sections.push('Every tool named after an HTTP route returns `{ status, body }`. A status of 400 or more means the call failed.');
    }
    const declared = contract?.groups?.groups;
    if (declared !== undefined) {
        // A group whose every route was excluded is not a group the model has.
        const exposed = new Set(definitions.flatMap((definition) => definition.groups));
        const groups = [...declared.values()]
            .filter((group) => exposed.has(group.path))
            .map((group) => {
                const name = group.lineage.map((path) => declared.get(path)!.title).join(' / ');
                return group.description ? `- ${name}: ${group.description}` : `- ${name}`;
            });
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
                text: JSON.stringify(envelope),
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

/**
 * The 400 body HTTP sends for input that fails validation.
 */
export const validationProblem = (failure: ValidationFailure): GuardDenialBody => {
    const formatted = formatValidationError(failure);
    return {
        ...problemDetails(400, formatted.detail),
        errors: formatted.issues.map((issue) => ({
            code: issue.code ?? 'custom',
            path: issue.path,
            message: issue.message,
        })),
    };
};

// A tool result is `{ status, body }`, not an HTTP response, so no envelope.
const toolError = (status: number, body: GuardDenialBody): ToolCallResult => ({
    content: [
        {
            type: 'text' as const,
            text: JSON.stringify({
                status,
                body,
            }),
        },
    ],
    isError: true,
});

/**
 * Resolve every request context declared on the api, the way the HTTP
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

const gateBody = (guardSchema: z.ZodType | undefined, detail: string): GuardDenialBody => {
    const filled = guardSchema?.safeParse(problemDetails(403, detail));
    return filled?.success ? (filled.data as GuardDenialBody) : { detail };
};

/**
 * Run the guards a secured route requires, extracting each identity's
 * credential from the MCP transport request headers, the same pipeline the
 * HTTP adapters run. Returns the scheme-keyed security context for the handler
 * args, or a {@link ToolCallResult} error when a guard denies or the caller's
 * role is not one the route accepts or does not hold what it requires.
 */
const runGuards = async (
    requirements: ReturnType<typeof resolveSecurityRequirements>,
    roles: RouteDefinition['roles'],
    requires: RouteDefinition['requires'],
    label: string,
    params: Record<string, string>,
    guards: GuardMap | undefined,
    schemes: Record<string, SecurityScheme> | undefined,
    handlerContext: Record<string, unknown> | undefined,
    credentialHeaders: Record<string, string | string[] | undefined> | undefined,
    requestContext: Record<string, unknown>,
    transportAuth: McpServerOptions['transportAuth'],
    guardSchema: z.ZodType | undefined,
    declared: (status: number, body: GuardDenialBody) => GuardDenialBody
): Promise<{ ok: true; securityContext: Record<string, unknown> } | { ok: false; result: ToolCallResult }> => {
    const securityContext: Record<string, unknown> = {};
    const credentialRequest = {
        headers: credentialHeaders ?? {},
        query: {},
    } as unknown as AdapterRequest<unknown>;

    for (const { scheme } of requirements) {
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
        const outcome = await callGuard(guard, {
            scheme: schemeDefinition,
            params,
            args: {
                ...(handlerContext ?? {}),
                ...credential,
                ...(Object.keys(requestContext).length > 0
                    ? {
                          requestContext,
                      }
                    : {}),
            },
        });
        if (outcome.kind === 'invalid-params') {
            return {
                ok: false,
                result: toolEnvelope(400, validationProblem(outcome.failure)),
            };
        }
        if (outcome.kind === 'denied') {
            return {
                ok: false,
                result: toolError(outcome.denial.status, declared(outcome.denial.status, outcome.denial.body)),
            };
        }
        if (outcome.context !== undefined) {
            securityContext[scheme] = withPermissions(scheme, schemeDefinition, outcome.context);
        }
    }
    const forbidden = requiresDenial({
        roles,
        requires,
        requiredSchemes: requirements.map((requirement) => requirement.scheme),
        schemes,
        securityContext,
    });
    if (forbidden !== undefined) {
        return {
            ok: false,
            result: toolError(403, gateBody(guardSchema, forbidden)),
        };
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
        headers: credentialHeaders ?? {},
    });

    if (!validation.ok) {
        return toolEnvelope(400, validationProblem(validation.error));
    }

    const handler = resolveHandler(router, routeKey);
    if (typeof handler !== 'function') {
        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify({
                        status: 500,
                        body: {
                            detail: `Handler not implemented: ${routeKey}`,
                        },
                    }),
                },
            ],
            isError: true,
        };
    }

    const requestContext = await resolveRequestContext(contextResolvers, params, credentialHeaders, handlerContext);

    let guardOutcome: Awaited<ReturnType<typeof runGuards>>;
    try {
        guardOutcome = await runGuards(
            resolveSecurityRequirements(route),
            route.roles,
            route.requires,
            `route "${routeKey}"`,
            params,
            guards,
            schemes,
            handlerContext,
            credentialHeaders,
            requestContext,
            transportAuth,
            guardSchema,
            (status, denial) => declaredResponseBody(route, routeKey, status, denial, false) as GuardDenialBody
        );
    } catch (error) {
        console.error(`[kizuna] tool "${routeKey}" threw:`, error);
        return toolEnvelope(500, problemDetails(500, 'Internal Server Error'));
    }
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

        return toolEnvelope(result.status, declaredResponseBody(route, routeKey, result.status, result.body, false));
    } catch (error) {
        if (error instanceof ResponseError) {
            try {
                return toolEnvelope(error.status, declaredResponseBody(route, routeKey, error.status, error.body, false));
            } catch (stripError) {
                console.error(`[kizuna] tool "${routeKey}" answered a body that cannot be sent:`, stripError);
                return toolEnvelope(500, problemDetails(500, 'Internal Server Error'));
            }
        }

        console.error(`[kizuna] tool "${routeKey}" threw:`, error);
        return toolEnvelope(500, problemDetails(500, 'Internal Server Error'));
    }
};

/**
 * Create an MCP server from a kizuna API.
 *
 * Each route in the routes becomes an MCP tool. When an AI assistant calls
 * a tool, the corresponding handler is invoked directly.
 *
 * ```ts
 * import { createMcpServer } from '@kizunajs/mcp';
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

    const contract = contractOf<ApiDefinition | undefined>(api);

    const tools = publishedToolsFor(api.routes);

    const server = new McpServer(
        {
            name: options?.name ?? 'MCP Server',
            version: options?.version ?? '1.0.0',
        },
        {
            instructions: buildInstructions(
                contract,
                tools.map(({ definition }) => definition),
                options?.instructions
            ),
            cacheHints: {
                'tools/list': TOOL_LIST_CACHE,
            },
        }
    );

    for (const { definition, inputSchema, outputSchema, annotations } of tools) {
        server.registerTool(
            definition.name,
            {
                ...(definition.title === undefined
                    ? {}
                    : {
                          title: definition.title,
                      }),
                description: definition.description,
                inputSchema,
                outputSchema,
                annotations,
            },
            async (args: Record<string, unknown>, context: McpToolContext) => {
                const refusal = approval(definition.route, context);
                if (refusal !== undefined) return refusal;
                return executeToolCall(
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
                );
            }
        );
    }

    return server;
};
