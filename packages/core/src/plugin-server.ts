import type { z } from 'zod';
import { PLUGIN_ROUTES_META_KEY, PLUGIN_SERVERS_META_KEY, type PluginApi, type PluginDeclaration, type ResolvedPlugin } from './plugin.js';
import type { RoutePath, Routes } from './types.js';

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
 * One issue as the app should read it: the field, and what's wrong with it.
 */
export const describeIssue = (issue: z.core.$ZodIssue): string => {
    const field = issue.path.map(String).join('.');
    if (issue.code === 'invalid_type' && issue.message.endsWith('received undefined')) {
        return `${field} is required`;
    }
    return field === '' ? issue.message : `${field}: ${issue.message}`;
};

/**
 * A route's path under its plugin's base path. A route at `/` serves the base
 * path itself, since `/webhooks` and `/webhooks/` are different paths.
 */
const underBasePath = (basePath: string, path: string): RoutePath => (path === '/' ? basePath : `${basePath}${path}`) as RoutePath;

/**
 * The base path a plugin's routes are served under: the app's, else the
 * plugin's own. An app can only move a plugin that declares one.
 */
const basePathOf = (declaration: PluginDeclaration): string | undefined => {
    const { definition, slug } = declaration;
    if (declaration.basePath !== undefined && definition.basePath === undefined) {
        throw new Error(`[kizuna] Plugin '${slug}' declares no \`basePath\`, so its routes can't be moved. Remove \`basePath\`.`);
    }
    const basePath = declaration.basePath ?? definition.basePath;
    if (basePath !== undefined && (!basePath.startsWith('/') || basePath.endsWith('/'))) {
        throw new Error(
            `[kizuna] Plugin '${slug}' has the base path '${basePath}'. A base path starts with \`/\` and doesn't end with one.`
        );
    }
    return basePath;
};

/**
 * Validate one installed plugin's options and run its `setup`.
 */
const resolvePlugin = (declaration: PluginDeclaration, api: PluginApi): ResolvedPlugin => {
    const { definition, slug } = declaration;
    let options: unknown = undefined;
    if (definition.options !== undefined) {
        const parsed = definition.options.safeParse(declaration.input);
        if (!parsed.success) {
            throw new Error(`[kizuna] Plugin '${slug}' has invalid options: ${parsed.error.issues.map(describeIssue).join('; ')}`);
        }
        options = parsed.data;
    }
    const setup = definition.setup({
        options: options as never,
        api,
    });
    const basePath = basePathOf(declaration);
    const routes = setup.routes ?? {};
    return {
        slug,
        definedSlug: definition.slug,
        options,
        routes:
            basePath === undefined
                ? routes
                : Object.fromEntries(
                      Object.entries(routes).map(([routeKey, route]) => [
                          routeKey,
                          {
                              ...route,
                              path: underBasePath(basePath, route.path),
                          },
                      ])
                  ),
        exports: setup.exports,
        generators: setup.generators ?? [],
        validate: setup.validate,
    };
};

/**
 * Resolve every installed plugin, keyed by slug. Two plugins on one slug throw,
 * naming both, since handlers could only reach one of them.
 */
export const resolvePlugins = (declarations: readonly PluginDeclaration[] | undefined, api: PluginApi): Record<string, ResolvedPlugin> => {
    const resolved: Record<string, ResolvedPlugin> = {};
    for (const declaration of declarations ?? []) {
        const existing = resolved[declaration.slug];
        if (existing !== undefined) {
            throw new Error(
                `[kizuna] Two plugins are installed under the slug '${declaration.slug}': '${existing.definedSlug}' and '${declaration.definition.slug}'. Pass one of them a \`slug\` of its own.`
            );
        }
        resolved[declaration.slug] = resolvePlugin(declaration, api);
    }
    return resolved;
};

/**
 * A stand-in for the api that plugins receive in `setup`, before it exists.
 * Reading it inside a handler works once `bind` has run; reading it during
 * `setup` throws, since the api is still being assembled.
 */
export const createApiReference = (): { api: PluginApi; bind: (target: object) => void } => {
    let current: object | undefined;
    const assembled = (): object => {
        if (current === undefined) {
            throw new Error('[kizuna] A plugin read the api during `setup`. Read it inside a handler, once the config has assembled.');
        }
        return current;
    };
    const api = new Proxy(
        {},
        {
            get: (_target, key) => Reflect.get(assembled(), key),
            has: (_target, key) => Reflect.has(assembled(), key),
            ownKeys: () => Reflect.ownKeys(assembled()),
            getOwnPropertyDescriptor: (_target, key) => {
                const descriptor = Reflect.getOwnPropertyDescriptor(assembled(), key);
                return descriptor === undefined
                    ? undefined
                    : {
                          ...descriptor,
                          configurable: true,
                      };
            },
        }
    ) as PluginApi;
    return {
        api,
        bind: (target) => {
            current = target;
        },
    };
};
