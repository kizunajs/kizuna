import type { PluginApi, PluginRoutes } from 'kizunajs/plugin';
import { contractOf } from 'kizunajs/adapter';
import type { ChatConnection } from './config.js';

/**
 * A plugin as the assembled api holds it: the slug it declared, the options
 * it was given, and its routes.
 */
interface InstalledPlugin {
    definedSlug: string;
    options: unknown;
    routes: PluginRoutes;
}

/**
 * A name as `claude mcp add` takes it: lower case, words joined by hyphens.
 */
export const serverNameOf = (name: string | undefined): string => {
    const written = (name ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return written === '' ? 'kizuna' : written;
};

/**
 * The API's MCP route, from the site's root, with the name and sign-in the
 * MCP plugin was given, or `undefined` when the API serves none.
 */
export const mcpRouteOf = (api: PluginApi, apiPath: string): Omit<ChatConnection, 'token'> | undefined => {
    const plugins = contractOf<{ plugins?: Record<string, InstalledPlugin> } | undefined>(api)?.plugins ?? {};
    const mcp = Object.values(plugins).find((plugin) => plugin.definedSlug === 'mcp');
    const endpoint = mcp?.routes['endpoint'];
    if (mcp === undefined || endpoint === undefined) return undefined;
    const options = (mcp.options ?? {}) as {
        name?: string;
        oauth?: unknown;
    };
    return {
        path: `${apiPath.replace(/\/+$/, '')}${endpoint.path}`,
        name: serverNameOf(options.name),
        oauth: options.oauth !== undefined,
    };
};
