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
 * as the contract's own, but they never join `contract.routes`, so the client
 * and the generators do not see them.
 */
export type PluginRoutes = Record<string, RouteDefinition>;

/**
 * A plugin's contract-time half: what it declares, as data. `server.api({ plugins })`
 * joins it to the server half named in `serverModule`.
 */
export interface PluginDeclaration<
    R extends PluginRoutes = PluginRoutes,
    Props = unknown,
    Exports = unknown,
    Name extends string = string,
    HandlerContext = unknown,
> {
    /**
     * What handlers reach this plugin under, and the key it is installed at.
     */
    name: Name;
    routes: R;
    /**
     * Passed to `serve`, so the app never restates it.
     */
    props: Props;
    /**
     * What answers this plugin's routes, and what it hands handlers under
     * `plugins.<name>`.
     */
    serve: (props: Props, api: unknown) => PluginServe<R, Exports, HandlerContext>;
}

/**
 * What a plugin's `serve` returns: one handler per declared route, and whatever
 * it hands handlers under `plugins.<name>`.
 */
export interface PluginServe<R extends PluginRoutes, Exports, HandlerContext> {
    router: PluginRouter<R, HandlerContext>;
    exports?: Exports;
}

/**
 * What {@link createPlugin} takes.
 */
export interface PluginDefinition<R extends PluginRoutes, Props, Exports, Name extends string, HandlerContext> {
    name: Name;
    routes: R;
    props?: Props;
    serve: (props: NoInfer<Props>, api: unknown) => PluginServe<NoInfer<R>, Exports, HandlerContext>;
}

/**
 * Declare a plugin's contract-time half: its routes and its props, as data.
 * Everything live goes in the server half, built with `implementPlugin`.
 *
 * @example
 * ```ts
 * import type { AuditExports } from './server.js';
 *
 * export const auditPlugin = (props: AuditPluginProps = {}) =>
 *     createPlugin<AuditExports>()({
 *         name: 'audit',
 *         serverModule: '@ts-kizuna/audit/server',
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
 *     });
 * ```
 */
export const createPlugin = <
    const R extends PluginRoutes,
    const Name extends string,
    Props = undefined,
    Exports = undefined,
    HandlerContext = unknown,
>(
    definition: PluginDefinition<R, Props, Exports, Name, HandlerContext>
): PluginDeclaration<R, Props, Exports, Name, HandlerContext> => ({
    name: definition.name,
    routes: definition.routes,
    props: definition.props as Props,
    serve: definition.serve,
});

/**
 * Plugins keyed by the name they were installed under on `k.contract`. That key
 * is what `plugins.*` in handler args resolves against.
 */
export type ContractPlugins = Record<string, AnyPlugin>;

/**
 * Any plugin, whatever it declares. `serve` reads its own props, so a concrete
 * plugin is not assignable to a widened one; this stands in wherever a plugin
 * is a constraint rather than a value.
 */
export type AnyPlugin = PluginDeclaration<any, any, any, string, any>;

/**
 * The plugins a config installs, as an array. Each carries its own name, which
 * is what handlers reach it under.
 */
export type PluginList = readonly AnyPlugin[];

/**
 * A plugin list as a record keyed by each plugin's own name.
 */
export type PluginsByName<Plugins extends PluginList> = {
    [Plugin in Plugins[number] as Plugin['name']]: Plugin;
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
 * walk as it walks the contract's own.
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
 * Every plugin in a list, keyed by its own name.
 */
export const pluginsByName = (plugins: PluginList | undefined): ContractPlugins => {
    const byName: Record<string, unknown> = {};
    for (const plugin of plugins ?? []) byName[plugin.name] = plugin;
    return byName as ContractPlugins;
};
