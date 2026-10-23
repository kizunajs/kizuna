import { createMcpHandler } from '@modelcontextprotocol/server';
import {
    buildProtectedResourceMetadata,
    declaredScopes,
    type ProtectedResourceMetadata,
    type RequiredPermissions,
    type SecurityScheme,
} from 'kizunajs';
import {
    adapterContextOf,
    rawResponse,
    resolveSecurityRequirements,
    validateToolInput,
    GUARDS_META,
    SCHEMES_META,
    type ApiWithRouter,
    type GuardMap,
    type GuardRun,
} from 'kizunajs/adapter';
import { buildMcpTools, createMcpServer, type McpTool } from './mcp-server.js';
import type { McpPluginProps } from './plugin.js';
import { assertCanonicalResource, protectedResourceMetadataUrl, type McpOAuthProps } from './oauth.js';
import { denialResponse, enforceOAuth } from './oauth-enforcement.js';
import { allowsOrigin } from './origin.js';

type HandlerArgs = {
    body: unknown;
    headers: Record<string, string | string[] | undefined>;
    requestContext?: Record<string, unknown>;
    [key: string]: unknown;
};

const toHeaders = (headers: HandlerArgs['headers']): Headers => {
    const built = new Headers();
    for (const [name, value] of Object.entries(headers)) {
        if (value === undefined) continue;
        for (const entry of Array.isArray(value) ? value : [value]) built.append(name, entry);
    }
    return built;
};

interface OAuthEnforcement {
    oauth: McpOAuthProps;
    guard: GuardRun;
    schemeDefinition: SecurityScheme;
    schemes: Record<string, SecurityScheme> | undefined;
    metadata: ProtectedResourceMetadata;
    metadataUrl: string;
    scopesSupported: readonly string[] | undefined;
    tools: Map<string, McpTool>;
}

const prepareOAuth = (oauth: McpOAuthProps, endpointPath: `/${string}`, api: ApiWithRouter): OAuthEnforcement => {
    assertCanonicalResource(oauth, endpointPath);
    const guards = (api as unknown as Record<typeof GUARDS_META, GuardMap | undefined>)[GUARDS_META];
    const schemes = (api as unknown as Record<typeof SCHEMES_META, Record<string, SecurityScheme> | undefined>)[SCHEMES_META];
    const guard = guards?.[oauth.scheme];
    if (guard === undefined) {
        throw new Error(`No guard registered for security scheme "${oauth.scheme}" required by the MCP plugin's oauth configuration.`);
    }
    const schemeDefinition = schemes?.[oauth.scheme];
    if (schemeDefinition === undefined) {
        throw new Error(`No identity named "${oauth.scheme}" is registered for the MCP plugin's oauth configuration.`);
    }
    return {
        oauth,
        guard,
        schemeDefinition,
        schemes,
        metadata: buildProtectedResourceMetadata({
            resource: oauth.resource,
            scheme: schemeDefinition,
        }),
        metadataUrl: protectedResourceMetadataUrl(oauth, endpointPath),
        scopesSupported: declaredScopes(schemeDefinition),
        tools: new Map(buildMcpTools(api.routes).map((definition) => [definition.name, definition])),
    };
};

interface ToolCallTarget {
    scopes: readonly string[];
    roles: readonly string[] | undefined;
    requires: RequiredPermissions | undefined;
    params: Record<string, string>;
}

const NO_TOOL_CALL: ToolCallTarget = {
    scopes: [],
    roles: undefined,
    requires: undefined,
    params: {},
};

interface ToolCallMessage {
    method: 'tools/call';
    params?: {
        name?: unknown;
        arguments?: unknown;
    };
}

const isToolCallMessage = (message: unknown): message is ToolCallMessage =>
    message !== null && typeof message === 'object' && (message as { method?: unknown }).method === 'tools/call';

/**
 * The oauth scheme's requirement for the tool a `tools/call` message names, so
 * the challenge speaks about the operation the client is attempting. The
 * route's `roles` and `requires` ride along when the oauth identity is the only one on
 * the route whose roles can satisfy it; otherwise the tool call checks it,
 * with every guard's role in hand. The guard reads the call's params only once
 * they validate, as HTTP runs no guard on a request that fails validation, and
 * the call then answers its `400`.
 */
const toolCallTarget = (message: ToolCallMessage, enforcement: OAuthEnforcement, headers: HandlerArgs['headers']): ToolCallTarget => {
    const name = message.params?.name;
    const definition = typeof name === 'string' ? enforcement.tools.get(name) : undefined;
    if (definition === undefined) return NO_TOOL_CALL;
    const requirements = resolveSecurityRequirements(definition.route);
    const requirement = requirements.find((candidate) => candidate.scheme === enforcement.oauth.scheme);
    const roleBearing = requirements.filter((candidate) => enforcement.schemes?.[candidate.scheme]?.roles !== undefined);
    const oauthDecidesRequires = roleBearing.every((candidate) => candidate.scheme === enforcement.oauth.scheme);
    const validation = validateToolInput(definition.route, message.params?.arguments, headers);
    return {
        scopes: requirement?.scopes ?? [],
        roles: requirement !== undefined && oauthDecidesRequires ? definition.route.roles : undefined,
        requires: requirement !== undefined && oauthDecidesRequires ? definition.route.requires : undefined,
        params: validation.ok ? validation.params : {},
    };
};

const toolCallsIn = (body: unknown): ToolCallMessage[] => (Array.isArray(body) ? body : [body]).filter(isToolCallMessage);

/**
 * The guard's context reaches every call the request carries, so it can speak
 * for one call only. MCP 2025-06-18 removed JSON-RPC batching.
 */
const MORE_THAN_ONE_TOOL_CALL = {
    status: 400,
    body: {
        detail: 'Send one tools/call per request.',
    },
};

const FOREIGN_ORIGIN = {
    status: 403,
    body: {
        detail: 'Requests from this origin may not call the MCP endpoint.',
    },
};

/**
 * What answers one MCP endpoint: the tool list built from the routes that
 * declared `tool`, and the calls a model makes against them. The OAuth setup
 * reads the app's identities, so it's prepared once the api has assembled:
 * `validate` prepares it at startup, and the handlers reuse it.
 */
export const mcpEndpoint = (props: McpPluginProps, api: unknown) => {
    const serverApi = api as ApiWithRouter;
    let prepared: OAuthEnforcement | undefined;
    const enforcementOf = (): OAuthEnforcement | undefined => {
        if (props.oauth === undefined) return undefined;
        prepared ??= prepareOAuth(props.oauth, props.path ?? '/mcp', serverApi);
        return prepared;
    };

    // Built on first use, once `enforcementOf` has checked the oauth resource.
    let allowedOrigins: ReadonlySet<string> | undefined;
    const allowedOriginsOf = (): ReadonlySet<string> => {
        allowedOrigins ??= new Set([
            ...(props.allowedOrigins ?? []),
            ...(props.oauth === undefined ? [] : [new URL(props.oauth.resource).origin]),
        ]);
        return allowedOrigins;
    };

    return {
        validate: (): void => {
            enforcementOf();
        },
        handle: async (args: HandlerArgs) => {
            const enforcement = enforcementOf();
            if (!allowsOrigin(args.headers['origin'], allowedOriginsOf())) return denialResponse(FOREIGN_ORIGIN);

            let transportAuth: { scheme: string; context?: Record<string, unknown> } | undefined;
            if (enforcement !== undefined) {
                const [call, ...others] = toolCallsIn(args.body);
                if (others.length > 0) return denialResponse(MORE_THAN_ONE_TOOL_CALL);
                // A body with no tool call still needs a token.
                const target = call === undefined ? NO_TOOL_CALL : toolCallTarget(call, enforcement, args.headers);
                const outcome = await enforceOAuth({
                    scheme: enforcement.oauth.scheme,
                    guard: enforcement.guard,
                    schemeDefinition: enforcement.schemeDefinition,
                    metadataUrl: enforcement.metadataUrl,
                    scopesSupported: enforcement.scopesSupported,
                    scopes: target.scopes,
                    roles: target.roles,
                    requires: target.requires,
                    params: target.params,
                    headers: args.headers,
                    handlerContext: adapterContextOf(args),
                    requestContext: args.requestContext,
                });
                if (!outcome.ok) return denialResponse(outcome.denial);
                transportAuth = {
                    scheme: enforcement.oauth.scheme,
                    ...(outcome.context === undefined
                        ? {}
                        : {
                              context: outcome.context,
                          }),
                };
            }

            const handler = createMcpHandler(() =>
                createMcpServer(serverApi, {
                    ...props,
                    handlerContext: adapterContextOf(args),
                    credentialHeaders: args.headers,
                    ...(transportAuth === undefined
                        ? {}
                        : {
                              transportAuth,
                          }),
                })
            );

            // Rebuilt from the inputs the pipeline already parsed, so
            // the handler gets a web request on every adapter.
            return rawResponse(
                await handler.fetch(
                    new Request('http://mcp.local/', {
                        method: 'POST',
                        headers: toHeaders(args.headers),
                        body: JSON.stringify(args.body),
                    })
                )
            );
        },
        protectedResourceMetadata: () =>
            rawResponse(
                new Response(JSON.stringify(enforcementOf()?.metadata), {
                    status: 200,
                    headers: {
                        'content-type': 'application/json',
                    },
                })
            ),
    };
};
