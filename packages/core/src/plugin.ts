import type { HandlerArgs, HandlerReturn } from './handler-pipeline.js';
import type { RawResponse } from './raw-response.js';
import type { RouteDefinition, Routes } from './types.js';

export type { RoutePath } from './types.js';

// Registry-global: adapters read these off the api, and a dual ESM/CJS install
// would otherwise hold two different symbols.
export const PLUGIN_ROUTES_META_KEY: unique symbol = Symbol.for('ts-kizuna.plugin-routes') as symbol as typeof PLUGIN_ROUTES_META_KEY;
export const PLUGIN_SERVERS_META_KEY: unique symbol = Symbol.for('ts-kizuna.plugin-servers') as symbol as typeof PLUGIN_SERVERS_META_KEY;

/**
 * The routes a plugin serves. `api.mount` serves them through the same pipeline
 * as the api's own, but they never join `api.routes`, so the client
 * and the generators do not see them.
 */
export type PluginRoutes = Record<string, RouteDefinition>;

/**
 * What a plugin is: the routes it declares, the props it was configured with,
 * and the `serve` that answers them.
 */
export interface PluginDeclaration<
    R extends PluginRoutes = PluginRoutes,
    Props = unknown,
    Exports = unknown,
    Slug extends string = string,
    HandlerContext = unknown,
> {
    /**
     * What handlers reach this plugin under, and the key it is installed at.
     */
    /**
     * What handlers reach this plugin under, and the key it is installed at.
     * Each plugin defaults it; an app installing two of the same plugin gives
     * the second one its own.
     */
    slug: Slug;
    routes: R;
    /**
     * Passed to `serve`, so the app never restates it.
     */
    props: Props;
    /**
     * What answers this plugin's routes, and what it hands handlers under
     * `plugins.<slug>`.
     */
    serve: (props: Props, api: unknown) => PluginServe<R, Exports, HandlerContext>;
}

/**
 * What a plugin's `serve` returns: one handler per declared route, and whatever
 * it hands handlers under `plugins.<slug>`.
 */
export interface PluginServe<R extends PluginRoutes, Exports, HandlerContext> {
    router: PluginRouter<R, HandlerContext>;
    exports?: Exports;
}

/**
 * What {@link createPlugin} takes.
 */
export interface PluginDefinition<R extends PluginRoutes, Props, Exports, Slug extends string, HandlerContext> {
    slug: Slug;
    routes: R;
    /**
     * Passed to `serve`, so the app never restates it.
     */
    props?: Props;
    serve: (props: NoInfer<Props>, api: unknown) => PluginServe<NoInfer<R>, Exports, HandlerContext>;
}

/**
 * Declare a plugin: the routes it serves, the props an app configures it with,
 * and the `serve` that answers those routes. Whatever `serve` returns under
 * `exports` reaches every handler as `plugins.<slug>`.
 *
 * Give the factory a `Slug` parameter and {@link WithSlug} so an app can rename
 * what it installs, or install two of them.
 *
 * @example
 * ```ts
 * const declare = (slug: string, props: AuditProps) =>
 *     createPlugin({
 *         slug,
 *         routes: {
 *             recent: {
 *                 method: 'GET',
 *                 path: props.path ?? '/audit/recent',
 *                 responses: {
 *                     200: z.array(EntrySchema),
 *                 },
 *             },
 *         },
 *         props,
 *         serve: ({ store }) => ({
 *             router: {
 *                 recent: async () => ({ status: 200, body: await store.recent() }),
 *             },
 *             exports: {
 *                 record: (routeKey: string) => store.write(routeKey),
 *             },
 *         }),
 *     });
 *
 * export function auditPlugin<const Slug extends string = 'audit'>(
 *     props: AuditProps<Slug>
 * ): WithSlug<ReturnType<typeof declare>, Slug> {
 *     return declare(props.slug ?? 'audit', props) as never;
 * }
 * ```
 */
export const createPlugin = <Props, const R extends PluginRoutes, const Slug extends string, Exports = undefined, HandlerContext = unknown>(
    definition: PluginDefinition<R, Props, Exports, Slug, HandlerContext>
): PluginDeclaration<R, Props, Exports, Slug, HandlerContext> => ({
    slug: definition.slug,
    routes: definition.routes,
    props: definition.props as Props,
    serve: definition.serve,
});

/**
 * Plugins keyed by their slug, which is what `plugins.*` in handler args
 * resolves against.
 */
export type ContractPlugins = Record<string, AnyPlugin>;

/**
 * Any plugin, whatever it declares. `serve` reads its own props, so a concrete
 * plugin is not assignable to a widened one; this stands in wherever a plugin
 * is a constraint rather than a value.
 */
export type AnyPlugin = PluginDeclaration<any, any, any, string, any>;

/**
 * The plugins a config installs, as an array. Each carries its own slug, which
 * is what handlers reach it under.
 */
export type PluginList = readonly AnyPlugin[];

/**
 * One plugin declaration under a different slug, for a factory that lets an app
 * rename what it installs.
 *
 * @example
 * export function auditPlugin<const Slug extends string = 'audit'>(
 *     props?: AuditProps<Slug>
 * ): WithSlug<ReturnType<typeof declare>, Slug> {
 *     return declare(props?.slug ?? 'audit', props ?? {}) as never;
 * }
 */
export type WithSlug<Declaration, Slug extends string> =
    Declaration extends PluginDeclaration<infer R, infer Props, infer Exports, string, infer HandlerContext>
        ? PluginDeclaration<R, Props, Exports, Slug, HandlerContext>
        : never;

/**
 * A plugin list as a record keyed by each plugin's own slug.
 */
export type PluginsBySlug<Plugins extends PluginList> = {
    [Plugin in Plugins[number] as Plugin['slug']]: Plugin;
};

export type PluginRoutesOf<Declaration> = Declaration extends PluginDeclaration<infer R, infer _P, infer _E, string, infer _H> ? R : never;

export type PluginPropsOf<Declaration> =
    Declaration extends PluginDeclaration<infer _R, infer Props, infer _E, string, infer _H> ? Props : never;

export type PluginExportsOf<Declaration> =
    Declaration extends PluginDeclaration<infer _R, infer _P, infer Exports, string, infer _H> ? Exports : never;

export type PluginExportValues<Plugins extends ContractPlugins> = {
    [Key in keyof Plugins]: PluginExportsOf<Plugins[Key]>;
};

/**
 * The `plugins` handler argument, or nothing when no plugins are installed, so
 * handler args are unchanged without them.
 */
export type PluginArgs<Plugins extends ContractPlugins> = string extends keyof Plugins
    ? unknown
    : [keyof Plugins] extends [never]
      ? unknown
      : {
            plugins: PluginExportValues<Plugins>;
        };

/**
 * Every plugin's routes as one tree, keyed by install name, for the adapter to
 * walk as it walks the api's own.
 */
export const pluginRouteTree = (plugins: ContractPlugins | undefined): Routes => {
    const tree: Record<string, unknown> = {};
    for (const [pluginKey, plugin] of Object.entries(plugins ?? {})) {
        tree[pluginKey] = plugin.routes;
    }
    return tree as Routes;
};

/**
 * A plugin's handlers, typed against its routes. A plugin may also answer with
 * {@link rawResponse} when its wire format is not JSON.
 */
export type PluginRouter<R extends PluginRoutes, HandlerContext> = {
    [Key in keyof R]: (
        args: HandlerArgs<R[Key]> & HandlerContext
    ) => Promise<HandlerReturn<R[Key]> | RawResponse> | HandlerReturn<R[Key]> | RawResponse;
};

/**
 * Every plugin in a list, keyed by its own slug.
 */
export const pluginsBySlug = (plugins: PluginList | undefined): ContractPlugins => {
    const bySlug: Record<string, unknown> = {};
    for (const plugin of plugins ?? []) bySlug[plugin.slug] = plugin;
    return bySlug as ContractPlugins;
};
