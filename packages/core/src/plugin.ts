import { z } from 'zod';
import { createRoute, type RouteWithHandler } from './route.js';
import type { HandlerArgs, HandlerReturn } from './handler-pipeline.js';
import type { RawResponse } from './raw-response.js';
import type { GeneratedFile } from './config.js';
import type { AuthoredRouteDefinition, RouteHiddenToolCheck, Routes, RouteDefinition } from './types.js';

import type { RoutePath } from './types.js';

export type { RoutePath };
export type { ApiContext } from './configured.js';
export {
    defineContentProvider,
    isContentProvider,
    type ContentProvider,
    type ContentDocument,
    type ContentRuntime,
    type ContentCookies,
} from './content.js';

// Registry-global: adapters read these off the api, and a dual ESM/CJS install
// would otherwise hold two different symbols.
export const PLUGIN_ROUTES_META_KEY: unique symbol = Symbol.for('kizuna.plugin-routes') as symbol as typeof PLUGIN_ROUTES_META_KEY;
export const PLUGIN_SERVERS_META_KEY: unique symbol = Symbol.for('kizuna.plugin-servers') as symbol as typeof PLUGIN_SERVERS_META_KEY;

/**
 * The routes a plugin serves, keyed by name. Each carries its handler, declared
 * with {@link route}.
 */
export type PluginRoutes = Record<string, RouteDefinition>;

/**
 * What a plugin's `setup` returns. Every key is optional, and everything in it
 * shares whatever `setup` created.
 */
export interface PluginSetup {
    /**
     * Functions every route and job handler reaches at `plugins.<slug>`.
     */
    exports?: unknown;
    /**
     * Routes an outside system calls, like a webhook or a status check.
     */
    routes?: PluginRoutes;
    /**
     * Files `kizuna generate` writes, built with `defineGenerator`.
     */
    generators?: readonly GeneratedFile[];
    /**
     * Runs once the config has assembled, with the api available. Throw to stop
     * the app starting, for a check that needs the app's routes or identities.
     */
    validate?: () => void;
}

/**
 * The assembled api, as a plugin's handlers read it. It exists once the config
 * has assembled, so read it inside a handler, never in `setup` itself.
 */
export type PluginApi = Record<string | symbol, unknown> & {
    readonly routes: Routes;
};

/**
 * What `setup` receives.
 */
export interface PluginSetupContext<Options> {
    /**
     * The options the app passed, validated against the plugin's `options`
     * schema.
     */
    options: Options;
    /**
     * The assembled api, for handlers that read the app's routes or identities.
     */
    api: PluginApi;
}

type OptionsOutput<Schema> = Schema extends z.ZodType ? z.output<Schema> : undefined;
type OptionsInput<Schema> = Schema extends z.ZodType ? z.input<Schema> : {};

/**
 * What {@link definePlugin} takes.
 */
export interface PluginDefinition<
    Slug extends string,
    Schema extends z.ZodType | undefined,
    Setup extends PluginSetup,
    BasePath extends RoutePath | undefined = undefined,
> {
    /**
     * Handlers reach the plugin at `plugins.<slug>`.
     */
    slug: Slug;
    /**
     * Where the plugin's routes are served. Each route's `path` is relative to
     * it, and a route at `/` serves the base path itself. The app can pass
     * another one when it clashes with its own routes.
     *
     * @example
     * basePath: '/webhooks',
     */
    basePath?: BasePath;
    /**
     * A Zod schema for what the app passes in. It's validated once, when the
     * config assembles, and a failure names the plugin and the field.
     */
    options?: Schema;
    /**
     * Builds the plugin from its validated options, once, when the config
     * assembles. It runs during `kizuna generate` too, so it creates clients and
     * leaves connections to the handlers.
     */
    setup: (context: PluginSetupContext<OptionsOutput<Schema>>) => Setup;
}

/**
 * One installed plugin: the slug it's installed under, the plugin it is, and the
 * options the app passed, still unvalidated.
 */
export interface PluginDeclaration<Slug extends string = string, Setup extends PluginSetup = PluginSetup> {
    readonly slug: Slug;
    /**
     * The base path the app passed, when it moved the plugin's routes.
     */
    readonly basePath?: string;
    readonly definition: PluginDefinition<string, z.ZodType | undefined, PluginSetup, RoutePath | undefined>;
    readonly input: unknown;
    /**
     * Carries what `setup` returns, for the types. Never set at runtime.
     */
    readonly setupType?: Setup;
}

/**
 * What {@link definePlugin} returns: the function an app calls in `plugins`.
 *
 * Two overloads. Passing `slug` installs the plugin under it; leaving it out
 * installs it under the plugin's own. The one without `slug` comes last, so
 * `ReturnType<typeof emailPlugin>`, which `kizuna generate` writes, keeps the
 * plugin's own slug rather than widening it to `string`.
 */
export type PluginFactory<
    DefaultSlug extends string,
    Schema extends z.ZodType | undefined,
    Setup extends PluginSetup,
    BasePath extends RoutePath | undefined = undefined,
> =
    {} extends OptionsInput<Schema>
        ? {
              <const Slug extends string>(
                  options: OptionsInput<Schema> & InstallOptions<BasePath> & SlugOption<Slug>
              ): PluginDeclaration<Slug, Setup>;
              (options?: OptionsInput<Schema> & InstallOptions<BasePath>): PluginDeclaration<DefaultSlug, Setup>;
          }
        : {
              <const Slug extends string>(
                  options: OptionsInput<Schema> & InstallOptions<BasePath> & SlugOption<Slug>
              ): PluginDeclaration<Slug, Setup>;
              (options: OptionsInput<Schema> & InstallOptions<BasePath>): PluginDeclaration<DefaultSlug, Setup>;
          };

export interface SlugOption<Slug extends string> {
    /**
     * Install the plugin under another slug, when two plugins want the same one.
     */
    slug: Slug;
}

/**
 * `basePath` at install, offered only by a plugin that declares one.
 */
export type InstallOptions<BasePath> = BasePath extends RoutePath
    ? {
          /**
           * Serve the plugin's routes somewhere else, when they clash with the
           * app's own.
           */
          basePath?: RoutePath;
      }
    : {
          basePath?: never;
      };

/**
 * Declare a plugin: its slug, the options an app passes it, and the `setup` that
 * builds what it brings. Returns the function an app installs it with.
 *
 * @example
 * export const emailPlugin = definePlugin({
 *     slug: 'email',
 *     options: z.object({
 *         apiKey: z.string(),
 *         from: z.string(),
 *     }),
 *     setup: ({ options }) => {
 *         const resend = new Resend(options.apiKey);
 *
 *         return {
 *             exports: {
 *                 send: (email: Email) =>
 *                     resend.emails.send({
 *                         from: options.from,
 *                         ...email,
 *                     }),
 *             },
 *         };
 *     },
 * });
 */
export const definePlugin = <
    Slug extends string,
    Setup extends PluginSetup,
    Schema extends z.ZodType | undefined = undefined,
    BasePath extends RoutePath | undefined = undefined,
>(
    definition: PluginDefinition<Slug, Schema, Setup, BasePath>
): PluginFactory<Slug, Schema, Setup, BasePath> =>
    ((input?: Record<string, unknown>) => {
        const { slug, basePath, ...options } = input ?? {};
        return {
            slug: typeof slug === 'string' ? slug : definition.slug,
            ...(typeof basePath === 'string'
                ? {
                      basePath,
                  }
                : {}),
            definition: definition as unknown as PluginDefinition<string, z.ZodType | undefined, PluginSetup, RoutePath | undefined>,
            input: options,
        };
    }) as never;

/**
 * Declare one of a plugin's routes and the handler that answers it, the way
 * `k.route` does for an app's own.
 *
 * @example
 * check: route({
 *     method: 'GET',
 *     path: '/status',
 *     auth: false,
 *     responses: {
 *         200: StatusSchema,
 *     },
 * }).handler(() => ({
 *     status: 200,
 *     body: {
 *         status: 'ok',
 *     },
 * })),
 */
export const route = createRoute as unknown as <const Definition extends AuthoredRouteDefinition>(
    definition: Definition & RouteHiddenToolCheck<Definition>
) => PluginRouteBuilder<Definition>;

/**
 * What {@link route} returns: the route, and the `handler` that answers it. A
 * plugin's handler may also answer with `rawResponse` when its wire format is
 * not JSON.
 */
export type PluginRouteBuilder<Definition extends AuthoredRouteDefinition> = Definition & {
    handler(
        fn: (args: HandlerArgs<Definition>) => Promise<HandlerReturn<Definition> | RawResponse> | HandlerReturn<Definition> | RawResponse
    ): RouteWithHandler<Definition>;
};

/**
 * Accepts a route path, for a plugin that takes one of its routes' paths as an
 * option.
 */
export const RoutePathSchema = z.custom<RoutePath>((value) => typeof value === 'string' && value.startsWith('/'), {
    error: 'must start with /',
});

/**
 * Accepts exactly what a route's `auth` does, for a plugin that takes one of its
 * routes' `auth` as an option. `defineConfig` checks the value against the app's
 * identities.
 */
export const RouteAuthSchema = z.union([
    z.literal(false),
    z.string(),
    z.array(z.string()),
    z.object({
        identity: z.union([z.string(), z.array(z.string())]),
        roles: z.union([z.string(), z.array(z.string())]).optional(),
        requires: z.record(z.string(), z.array(z.string())).optional(),
    }),
]);

/**
 * A plugin once the config has assembled: its options validated and `setup`
 * run.
 */
export interface ResolvedPlugin {
    /**
     * The slug it's installed under.
     */
    slug: string;
    /**
     * The slug the plugin declared, whatever the app installed it under.
     */
    definedSlug: string;
    options: unknown;
    routes: PluginRoutes;
    exports: unknown;
    generators: readonly GeneratedFile[];
    validate: (() => void) | undefined;
}

/**
 * Plugins keyed by their slug, which is what `plugins.*` in handler args
 * resolves against.
 */
export type ApiPlugins = Record<string, AnyPlugin>;

/**
 * Any plugin, whatever it declares.
 */
export type AnyPlugin = PluginDeclaration<string, any>;

/**
 * The plugins a config installs, as a list. Each carries its own slug, which is
 * what handlers reach it under.
 */
export type PluginList = readonly AnyPlugin[];

/**
 * A plugin list as a record keyed by each plugin's own slug.
 */
export type PluginsBySlug<Plugins extends PluginList> = {
    [Plugin in Plugins[number] as Plugin['slug']]: Plugin;
};

type SetupOf<Declaration> = Declaration extends PluginDeclaration<string, infer Setup> ? Setup : never;

export type PluginRoutesOf<Declaration> = SetupOf<Declaration> extends { routes: infer R extends PluginRoutes } ? R : Record<string, never>;

export type PluginExportsOf<Declaration> = SetupOf<Declaration> extends { exports: infer Exports } ? Exports : undefined;

export type PluginExportValues<Plugins extends ApiPlugins> = {
    [Key in keyof Plugins]: PluginExportsOf<Plugins[Key]>;
};

/**
 * The `plugins` handler argument, or nothing when no plugins are installed, so
 * handler args are unchanged without them.
 */
export type PluginArgs<Plugins extends ApiPlugins> = string extends keyof Plugins
    ? unknown
    : [keyof Plugins] extends [never]
      ? unknown
      : {
            plugins: PluginExportValues<Plugins>;
        };

/**
 * Every plugin's routes as one tree, keyed by slug, for the adapter to walk as
 * it walks the api's own.
 */
export const pluginRouteTree = (plugins: Record<string, { routes: PluginRoutes }> | undefined): Routes => {
    const tree: Record<string, unknown> = {};
    for (const [slug, plugin] of Object.entries(plugins ?? {})) {
        tree[slug] = plugin.routes;
    }
    return tree as Routes;
};
