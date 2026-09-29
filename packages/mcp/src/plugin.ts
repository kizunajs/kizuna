import { z } from 'zod';
import { definePlugin, route, RoutePathSchema, type PluginRoutes } from 'kizunajs/plugin';
import { ProtectedResourceMetadataSchema } from 'kizunajs/schemas';
import { McpOAuthSchema, protectedResourceMetadataPath } from './oauth.js';
import { mcpEndpoint } from './server.js';

/**
 * What the MCP endpoint is, and where. Which routes it publishes is each
 * route's own business: declare `tool` on the ones a model may call.
 */
const McpPluginOptionsSchema = z.object({
    /**
     * Path the endpoint is served from.
     *
     * @default '/mcp'
     */
    path: RoutePathSchema.optional(),

    /**
     * Human-readable name shown to AI assistants.
     *
     * @default 'MCP Server'
     */
    name: z.string().optional(),

    /**
     * Semantic version string (e.g. "1.0.0").
     *
     * @default '1.0.0'
     */
    version: z.string().optional(),

    /**
     * Guidance for the model, appended to the overview built from the
     * contract's tags.
     */
    instructions: z.string().optional(),

    /**
     * Serve the endpoint as an OAuth 2.1 resource server, per the MCP
     * authorization specification: RFC 9728 metadata on a well-known route,
     * and HTTP `401`/`403` challenges built from the named identity.
     */
    oauth: McpOAuthSchema.optional(),
});

/**
 * What the MCP endpoint is, and where.
 */
export type McpPluginProps = z.output<typeof McpPluginOptionsSchema>;

/**
 * Let AI assistants use the API. Serves an MCP (Model Context Protocol)
 * endpoint where every route declaring `tool` is one an assistant can discover
 * and call, behind the same guards as the HTTP endpoints.
 *
 * The endpoint is an ordinary kizuna route, so `api.mount` serves it on any
 * adapter.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *     routes,
 *     plugins: [
 *         mcpPlugin({
 *             name: 'My API',
 *         }),
 *     ],
 * });
 * ```
 */
export const mcpPlugin = definePlugin({
    slug: 'mcp',
    options: McpPluginOptionsSchema,
    setup: ({ options, api }) => {
        const endpointPath = options.path ?? '/mcp';
        const endpoint = mcpEndpoint(options, api);
        const routes: PluginRoutes = {
            endpoint: route({
                method: 'POST',
                path: endpointPath,
                summary: 'MCP (Model Context Protocol) endpoint',
                body: z.unknown(),
                responses: {
                    200: z.unknown(),
                },
            }).handler(endpoint.handle),
        };
        if (options.oauth !== undefined) {
            routes.protectedResourceMetadata = route({
                method: 'GET',
                path: protectedResourceMetadataPath(endpointPath),
                summary: 'OAuth protected resource metadata',
                responses: {
                    200: ProtectedResourceMetadataSchema,
                },
            }).handler(endpoint.protectedResourceMetadata);
        }

        return {
            routes,
            validate: endpoint.validate,
        };
    },
});
