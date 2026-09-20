import { z } from 'zod';
import { createPlugin, type RoutePath, type WithSlug } from 'kizunajs/plugin';
import { ProtectedResourceMetadataSchema } from 'kizunajs/schemas';
import { protectedResourceMetadataPath, type McpOAuthProps } from './oauth.js';
import { mcpServe } from './server.js';

/**
 * What the MCP endpoint is, and where. Which routes it publishes is each
 * route's own business: declare `tool` on the ones a model may call.
 */
export interface McpPluginProps<Slug extends string = 'mcp'> {
    /**
     * What handlers reach this plugin under. Give a second MCP endpoint its own.
     *
     * @default 'mcp'
     */
    slug?: Slug;

    /**
     * Path the endpoint is served from.
     *
     * @default '/mcp'
     */
    path?: RoutePath;

    /**
     * Human-readable name shown to AI assistants.
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
     * Guidance for the model, appended to the overview built from the
     * contract's tags.
     */
    instructions?: string;

    /**
     * Serve the endpoint as an OAuth 2.1 resource server, per the MCP
     * authorization specification: RFC 9728 metadata on a well-known route,
     * and HTTP `401`/`403` challenges built from the named identity.
     */
    oauth?: McpOAuthProps;
}

const declare = (slug: string, props: McpPluginProps<string>) => {
    const endpointPath = props.path ?? '/mcp';
    return createPlugin({
        slug,
        routes: {
            endpoint: {
                method: 'POST',
                path: endpointPath,
                summary: 'MCP (Model Context Protocol) endpoint',
                body: z.unknown(),
                responses: {
                    200: z.unknown(),
                },
            },
            ...(props.oauth === undefined
                ? {}
                : {
                      protectedResourceMetadata: {
                          method: 'GET',
                          path: protectedResourceMetadataPath(endpointPath),
                          summary: 'OAuth protected resource metadata',
                          responses: {
                              200: ProtectedResourceMetadataSchema,
                          },
                      },
                  }),
        },
        props,
        serve: (pluginProps, api) => mcpServe(pluginProps, api),
    });
};

/**
 * Let AI assistants use the API. Serves an MCP (Model Context Protocol)
 * endpoint where every route declaring `tool` is one an assistant can discover
 * and call, behind the same guards as the HTTP endpoints.
 *
 * The endpoint is an ordinary kizuna route, so `api.mount` serves it on any
 * adapter, and it stays out of `api.routes` so the client and the generators do
 * not see it.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *     routes,
 *     plugins: [mcpPlugin({ name: 'My API' })],
 * });
 * ```
 */
export function mcpPlugin<const Slug extends string = 'mcp'>(props?: McpPluginProps<Slug>): WithSlug<ReturnType<typeof declare>, Slug> {
    const settings = props ?? ({} as McpPluginProps<Slug>);
    return declare(settings.slug ?? 'mcp', settings as McpPluginProps<string>) as never;
}
