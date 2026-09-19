import { PLUGIN_ROUTES_META_KEY, PLUGIN_SERVERS_META_KEY, type ContractPlugins } from './plugin.js';
import type { Routes } from './types.js';

/**
 * The plugin routes `assembleApi` stashed on the api. Empty without plugins, so
 * an adapter can mount it unconditionally.
 */
export const pluginRoutesOf = (api: unknown): Routes =>
    ((api as Record<symbol, unknown>)[PLUGIN_ROUTES_META_KEY] as Routes | undefined) ?? {};

/**
 * Their handlers, keyed to match {@link pluginRoutesOf}.
 */
export const pluginRouterOf = (api: unknown): Record<string, unknown> => {
    const servers = (api as Record<symbol, unknown>)[PLUGIN_SERVERS_META_KEY] as Record<string, { router: unknown }> | undefined;
    const router: Record<string, unknown> = {};
    for (const [pluginKey, served] of Object.entries(servers ?? {})) {
        router[pluginKey] = served.router;
    }
    return router;
};

/**
 * What each plugin exports, for the adapter to pass into the pipeline as the
 * handler args' `plugins`.
 */
export const pluginExportsOf = (api: unknown): Record<string, unknown> => {
    const servers = (api as Record<symbol, unknown>)[PLUGIN_SERVERS_META_KEY] as Record<string, { exports?: unknown }> | undefined;
    const exported: Record<string, unknown> = {};
    for (const [pluginKey, served] of Object.entries(servers ?? {})) {
        if (served.exports !== undefined) exported[pluginKey] = served.exports;
    }
    return exported;
};

/**
 * Run every plugin's `serve`. Deferred until the api object exists, because
 * `serve` receives it.
 */
export const resolvePluginServers = (
    plugins: ContractPlugins | undefined,
    api: unknown
): Record<string, { router: Record<string, unknown>; exports?: unknown }> => {
    const resolved: Record<string, { router: Record<string, unknown>; exports?: unknown }> = {};
    for (const [pluginKey, declaration] of Object.entries(plugins ?? {})) {
        const served = declaration.serve(declaration.props as never, api) as {
            router: Record<string, unknown>;
            exports?: unknown;
        };
        for (const routeKey of Object.keys(declaration.routes)) {
            if (routeKey in served.router) continue;
            throw new Error(`Plugin '${pluginKey}' declares the route '${routeKey}' but its \`serve\` does not handle it.`);
        }
        resolved[pluginKey] = served;
    }
    return resolved;
};
