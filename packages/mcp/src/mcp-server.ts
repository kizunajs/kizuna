import { z } from 'zod';
import { problemDetails } from '@ts-kizuna/core';
import { McpServer, acceptedContent, inputRequired, type CallToolResult, type InputRequiredResult } from '@modelcontextprotocol/server';
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
    requiresDenial,
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
import { buildToolInputSchema, buildToolOutputSchema, type ToolInputSchema } from './schema.js';
import { selectToolRoutes, toolOptionsOf } from './tool-selection.js';

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
/**
 * What the elicitation answer comes back under, and the key the retry echoes.
 */
const CONFIRM_KEY = 'confirm';

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
 * Ask before running, when the route said to. Returns what the caller should
 * answer with instead of running: the elicitation on the first call, a refusal
 * when the person declined, and nothing once they have agreed.
 */
const confirmed = (route: RouteDefinition, context: McpToolContext): CallToolResult | InputRequiredResult | undefined => {
    const message = toolOptionsOf(route)?.confirm;
    if (message === undefined) return undefined;

    const answer = acceptedContent<{ confirm?: boolean }>(context.mcpReq?.inputResponses as never, CONFIRM_KEY);
    if (answer === undefined) {
        return inputRequired({
            inputRequests: {
                [CONFIRM_KEY]: inputRequired.elicit({
                    message,
                    requestedSchema: {
                        type: 'object',
                        properties: {
                            confirm: {
                                type: 'boolean',
                                title: 'Go ahead',
                            },
                        },
                        required: [CONFIRM_KEY],
                    },
                }),
            },
        });
    }

    if (answer.confirm === true) return undefined;
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

const describeRoles = (route: RouteDefinition): string | undefined =>
    route.roles !== undefined && route.roles.length > 0 ? `Roles: ${route.roles.join(', ')}` : undefined;

const describeRequires = (route: RouteDefinition): string | undefined => {
    const requires = route.requires;
    if (requires === undefined) return undefined;
    const names = Object.entries(requires).flatMap(([resource, verbs]) => verbs.map((verb) => `${resource}:${verb}`));
    return names.length > 0 ? `Permissions: ${names.join(', ')}` : undefined;
};

const buildToolDescription = (route: RouteDefinition): string => {
    const parts: string[] = [];
    const declared = toolOptionsOf(route)?.description;
    if (declared) parts.push(declared);
    else if (route.summary) parts.push(route.summary);
    if (route.description) parts.push(route.description);
    if (parts.length === 0) parts.push(`${route.method} ${route.path}`);
    parts.push(`\nHTTP: ${route.method} ${route.path}`);

    const requirements = resolveSecurityRequirements(route);
    if (requirements.length > 0) {
        parts.push(`Requires: ${requirements.map(({ scheme }) => scheme).join(', ')}`);
    }
    const roles = describeRoles(route);
    if (roles !== undefined) parts.push(roles);
    const permissions = describeRequires(route);
    if (permissions !== undefined) parts.push(permissions);

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

export const buildToolDefinitions = (routes: Routes): ToolDefinition[] => {
    const selected = selectToolRoutes(flattenRoutes(routes));
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
 * What a client puts in front of the model before it picks a tool.
 */
export const buildInstructions = (
    contract: Contract | undefined,
    definitions: readonly ToolDefinition[],
    authored: string | undefined
): string => {
    const sections: string[] = [];
    if (definitions.length > 0) {
        sections.push('Every tool named after an HTTP route returns `{ status, body }`. A status of 400 or more means the call failed.');
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
    guardSchema: z.ZodType | undefined
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
        const guardResult = await guard({
            ...(handlerContext ?? {}),
            ...credential,
            params,
            deny: guardDenyFor(schemeDefinition),
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

    const definitions = buildToolDefinitions(api.routes);

    const server = new McpServer(
        {
            name: options?.name ?? 'MCP Server',
            version: options?.version ?? '1.0.0',
        },
        {
            instructions: buildInstructions(contract, definitions, options?.instructions),
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
            async (args: Record<string, unknown>, context: McpToolContext) => {
                const refusal = confirmed(definition.route, context);
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
