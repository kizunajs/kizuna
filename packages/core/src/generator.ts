import { flattenRoutes } from './handler-pipeline.js';
import { flattenJobs, isCompiledJob, jobAt, type CompiledJob, type FlattenedJob, type Jobs } from './jobs.js';
import { parsePath } from './path-params.js';
import type { Routes, RouteDefinition } from './types.js';
import type { ApiDefinition } from './api-definition.js';
import { isRouteDefinition } from './handler-pipeline.js';
import { describeIssue, pluginRoutesOf } from './plugin-server.js';
import { globalRegistrySchemas, readMetaDescription, readModelSchema } from './zod-internals.js';
import type { GeneratedFile } from './config.js';
import type { z } from 'zod';

export type { Routes, RouteDefinition, GeneratedFile };
export { flattenJobs, isCompiledJob, jobAt };
export type { CompiledJob, FlattenedJob, Jobs };
export { parsePath };

export {
    FILE_PROBE,
    isFileSchema,
    isBinarySchema,
    isVoidSchema,
    isObjectSchema,
    isIntegerSchema,
    isDiscriminatedUnionSchema,
    readDef,
    readDefType,
    readObjectShape,
    readDiscriminatedUnion,
    readMeta,
    readMetaId,
    readModelSchema,
    readMetaDescription,
    readMetaBrand,
    readMetaExamples,
    readDeprecation,
    readDiscriminatorLiteral,
    readDiscriminatorStringLiteral,
    globalRegistrySchemas,
    unwrapOptionalWrappers,
    type ZodDef,
    type DiscriminatedUnion,
} from './zod-internals.js';

export { deprecationHeaders } from './deprecation.js';
export { encodeForWire } from './json-encoding.js';
export { toToolName, deriveToolNames, type ToolOrigin, type ToolNameEntry } from './tool-name.js';
export {
    streamMode,
    streamContentType,
    isNamedStream,
    streamSchemas,
    streamStatuses,
    routeStreams,
    soleStreamResponse,
    EVENT_STREAM_MEDIA_TYPE,
    type StreamMode,
} from './stream.js';
export { cacheHeaders } from './cache.js';

export {
    resolveResponseBody,
    resolveResponseStream,
    resolveResponseHeaders,
    resolveResponseContentType,
    isStreamResponse,
    isZodSchema,
    resolveResponseCache,
    resolveResponseEtag,
    isJsonMediaType,
    toPascalCase,
    toCamelCase,
    shortTypeName,
    isHintPrefix,
    localTypeName,
    sanitizeFieldName,
    sanitizeIdentifier,
    statusToCamelCase,
    isSuccessStatus,
    mergeHeaderFields,
    typeNameFromHint,
    assertFreeNamespaces,
    groupByNamespace,
    namespaceScope,
    qualifyReference,
    type NamespaceEntry,
} from './generator-utils.js';

export interface GeneratorRouteContext {
    routeKey: string;
    route: RouteDefinition;
    /**
     * The route's groups, as dotted paths, its own first.
     */
    routeGroups: string[];
    /**
     * Whether the route is deprecated.
     */
    deprecated: boolean;
    /**
     * The route's `deprecated` string, or the object form's `message`, or
     * `undefined` when the route declares neither.
     */
    deprecationMessage: string | undefined;
    /**
     * Whether the route is `hidden`. Clients and the OpenAPI document leave a
     * hidden route out; a generator listing every served route marks it.
     */
    hidden: boolean;
    /**
     * The plugin the route comes from, or `undefined` for the app's own. A
     * plugin's routes sit under its slug.
     */
    plugin: GeneratorPluginInfo | undefined;
}

/**
 * Where a plugin's route came from.
 */
export interface GeneratorPluginInfo {
    /**
     * The slug the app installed the plugin under.
     */
    slug: string;
}

/**
 * Every route the api serves, the app's and the plugins' under their slugs,
 * each with the plugin it came from.
 */
const servedRoutes = (
    contract: ApiDefinition
): Array<ReturnType<typeof flattenRoutes>[number] & { plugin: GeneratorPluginInfo | undefined }> => [
    ...flattenRoutes(contract.routes).map((entry) => ({
        ...entry,
        plugin: undefined,
    })),
    ...Object.entries(pluginRoutesOf(contract)).flatMap(([slug, routes]) =>
        flattenRoutes(routes as Routes, slug).map((entry) => ({
            ...entry,
            plugin: {
                slug,
            },
        }))
    ),
];

/**
 * Whether a route's dotted key sits in one of the groups, each a dotted key
 * prefix such as `content` or `content.sites.uk`. A prefix matches whole
 * segments, so `content` holds `content.pages.frontPage` and not
 * `contentTypes.list`. Without groups, every route is in.
 *
 * @example
 * isInGroups('content.sites.uk.pages.frontPage', ['content.sites.uk']); // true
 */
export const isInGroups = (routeKey: string, groups: readonly string[] | undefined): boolean =>
    groups === undefined || groups.some((group) => routeKey === group || routeKey.startsWith(`${group}.`));

/**
 * Throw on groups that are not a list of dotted keys, naming who was given
 * them.
 */
const assertGroupsOption = (groups: unknown, name: string): void => {
    if (groups === undefined) return;
    const valid =
        Array.isArray(groups) &&
        groups.length > 0 &&
        groups.every((group) => typeof group === 'string' && group.split('.').every((segment) => segment.length > 0));
    if (!valid) {
        throw new Error(`[kizuna] ${name} has invalid options: groups is a non-empty list of dotted route keys, like ['content']`);
    }
};

/**
 * Throw on a group no served route sits in, so a misspelt prefix fails the
 * generate instead of writing an empty client.
 */
const assertGroupsMatch = (routeKeys: readonly string[], groups: readonly string[] | undefined): void => {
    for (const group of groups ?? []) {
        if (routeKeys.some((routeKey) => isInGroups(routeKey, [group]))) continue;
        throw new Error(
            `[kizuna] No route's key starts with '${group}'. Each entry in \`groups\` is a dotted route key prefix, like 'content'.`
        );
    }
};

const listRoutes = (routes: Routes, prefix: string, groups: readonly string[] | undefined): Routes => {
    const listed: Record<string | symbol, unknown> = {};
    // `Object.entries` skips the group symbol.
    for (const symbol of Object.getOwnPropertySymbols(routes)) {
        listed[symbol] = (routes as Record<symbol, unknown>)[symbol];
    }
    for (const [key, value] of Object.entries(routes)) {
        const routeKey = prefix === '' ? key : `${prefix}.${key}`;
        if (isRouteDefinition(value)) {
            if ((value as RouteDefinition).hidden !== true && isInGroups(routeKey, groups)) listed[key] = value;
            continue;
        }
        if (value && typeof value === 'object') {
            const group = listRoutes(value as Routes, routeKey, groups);
            if (Object.keys(group).length > 0) listed[key] = group;
        }
    }
    return listed as Routes;
};

export interface ListedRoutesOptions {
    /**
     * Keep only the routes in these groups. See {@link isInGroups}.
     */
    groups?: readonly string[];
}

/**
 * The route tree the generated clients hold: the app's routes, less every
 * `hidden` one, and less every route outside `groups` when it is given.
 */
export const listedRoutes = (contract: ApiDefinition, options: ListedRoutesOptions = {}): Routes => {
    assertGroupsMatch(
        servedRoutes(contract).map(({ routeKey }) => routeKey),
        options.groups
    );
    return listRoutes(contract.routes, '', options.groups);
};

/**
 * A named model the api uses.
 */
export interface GeneratorModelContext {
    /**
     * The model's title, e.g. `User`.
     */
    name: string;
    /**
     * The schema to generate a type from.
     */
    schema: z.ZodType;
    /**
     * The model's description, for a doc comment.
     */
    description: string | undefined;
    /**
     * The plugin that brought it, when only a plugin's routes use it.
     */
    plugin: GeneratorPluginInfo | undefined;
}

/**
 * What a client's or a generator's `generate` returns: a callback for each
 * model and route, then `finalize`, which returns the result.
 */
export interface GeneratorWalk<Output = string> {
    /**
     * Called once for every named model the walked routes use, sorted by name.
     */
    processModel?: (model: GeneratorModelContext) => void;
    /**
     * Called once for every route, in the order the api declares them.
     */
    processRoute?: (context: GeneratorRouteContext) => void;
    /**
     * Called once, after the walk.
     */
    finalize: () => Output;
}

export interface WalkApiOptions {
    /**
     * Leave `hidden` routes out of the walk, and the models only they use.
     *
     * @default false
     */
    skipHidden?: boolean;
    /**
     * Walk only the routes in these groups, and the models they use. Each is
     * a dotted key prefix, such as `content` or `content.sites.uk`. A
     * plugin's routes sit under its slug, so `mcp` names the MCP plugin's.
     * A group no route sits in throws.
     */
    groups?: readonly string[];
}

const isSchema = (value: unknown): value is z.core.$ZodType =>
    typeof value === 'object' && value !== null && '_zod' in value && typeof (value as z.core.$ZodType)._zod?.def?.type === 'string';

/**
 * Every `Kizuna.model` schema reachable from a value, found by walking its
 * schemas and whatever plain objects and lists hold them.
 */
const reachModels = (value: unknown, models: Map<z.core.$ZodType, string>, found: Set<z.core.$ZodType>, seen: Set<unknown>): void => {
    if (typeof value !== 'object' || value === null || seen.has(value)) return;
    seen.add(value);
    if (isSchema(value)) {
        const model = readModelSchema(value);
        if (model !== undefined && models.has(model)) found.add(model);
        const def = value._zod.def as unknown as Record<string, unknown>;
        for (const [key, child] of Object.entries(def)) {
            if (key === 'checks') continue;
            if (key === 'getter' && typeof child === 'function') {
                reachModels((child as () => unknown)(), models, found, seen);
                continue;
            }
            reachModels(child, models, found, seen);
        }
        return;
    }
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
        reachModels(child, models, found, seen);
    }
};

/**
 * The named models the given routes use, sorted by name, each with the plugin
 * that brought it when none of the app's own routes use it.
 */
const modelsOf = (entries: ReadonlyArray<{ route: RouteDefinition; plugin: GeneratorPluginInfo | undefined }>): GeneratorModelContext[] => {
    const models = new Map<z.core.$ZodType, string>();
    for (const [id, schema] of globalRegistrySchemas()) models.set(schema, id);

    const owners = new Map<z.core.$ZodType, GeneratorPluginInfo | undefined>();
    const appFirst = [...entries].sort((left, right) => Number(left.plugin !== undefined) - Number(right.plugin !== undefined));
    for (const { route, plugin } of appFirst) {
        const found = new Set<z.core.$ZodType>();
        reachModels(route, models, found, new Set());
        for (const schema of found) {
            if (!owners.has(schema)) owners.set(schema, plugin);
        }
    }

    return [...owners]
        .map(([schema, plugin]) => ({
            name: models.get(schema)!,
            schema: schema as z.ZodType,
            description: readMetaDescription(schema),
            plugin,
        }))
        .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
};

const deprecationMessageOf = (route: RouteDefinition): string | undefined =>
    typeof route.deprecated === 'string' ? route.deprecated : typeof route.deprecated === 'object' ? route.deprecated.message : undefined;

/**
 * Run a walk over an api: its models, then every route it serves, the app's
 * and each plugin's under its slug. Returns what `finalize` returns.
 *
 * @example
 * const routeList = walkApi(api, {
 *     processRoute: ({ route }) => lines.push(`${route.method} ${route.path}`),
 *     finalize: () => lines.join('\n'),
 * });
 */
export const walkApi = <Output>(api: ApiDefinition, walk: GeneratorWalk<Output>, options: WalkApiOptions = {}): Output => {
    const served = servedRoutes(api);
    assertGroupsMatch(
        served.map(({ routeKey }) => routeKey),
        options.groups
    );
    const entries = served.filter(
        ({ routeKey, route }) => (options.skipHidden !== true || route.hidden !== true) && isInGroups(routeKey, options.groups)
    );
    if (walk.processModel !== undefined) {
        for (const model of modelsOf(entries)) walk.processModel(model);
    }
    for (const { routeKey, route, routeGroups, plugin } of entries) {
        walk.processRoute?.({
            routeKey,
            route,
            routeGroups,
            hidden: route.hidden === true,
            plugin,
            deprecated: route.deprecated !== undefined && route.deprecated !== false,
            deprecationMessage: deprecationMessageOf(route),
        });
    }
    return walk.finalize();
};

type OptionsOutput<Schema> = Schema extends z.ZodType ? z.output<Schema> : Record<string, never>;
type OptionsInput<Schema> = Schema extends z.ZodType ? z.input<Schema> : {};

/**
 * What `generate` receives.
 */
export interface GenerateContext<Options> {
    /**
     * The options the app passed, less `output`, validated against the
     * `options` schema.
     */
    options: Options;
    /**
     * The api being generated from.
     */
    api: ApiDefinition;
    /**
     * The groups the app passed, or `undefined` for every route. The walk
     * already keeps to them. A client reading `api.routes` itself passes them
     * to {@link listedRoutes}.
     */
    groups: readonly string[] | undefined;
}

/**
 * What every client and generator takes beside its own options.
 */
export interface GeneratedFileOptions {
    /**
     * Path the file is written to, resolved against the config's directory.
     */
    output: string;
    /**
     * Generate only the routes in these groups, each a dotted key prefix.
     * `'content'` keeps every route under `content`, and
     * `'content.sites.uk'` keeps one site's. A group no route sits in throws.
     *
     * @example
     * groups: ['content.sites.uk', 'content.globals'],
     */
    groups?: readonly string[];
}

const parseOptions = <Schema extends z.ZodType | undefined>(
    schema: Schema | undefined,
    input: Record<string, unknown>,
    name: string
): OptionsOutput<Schema> => {
    if (schema === undefined) return input as OptionsOutput<Schema>;
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
        throw new Error(`[kizuna] ${name} has invalid options: ${parsed.error.issues.map(describeIssue).join('; ')}`);
    }
    return parsed.data as OptionsOutput<Schema>;
};

/**
 * What {@link defineClient} takes.
 */
export interface ClientDefinition<Schema extends z.ZodType | undefined> {
    /**
     * The language this client generates, like `dart`.
     */
    target: string;
    /**
     * A Zod schema for what the app passes in, beside `output`.
     */
    options?: Schema;
    /**
     * Returns the walk. Kizuna calls it on every `kizuna generate`, and skips
     * hidden routes, so one never reaches `processRoute`.
     */
    generate: (context: GenerateContext<OptionsOutput<Schema>>) => GeneratorWalk;
}

/**
 * Declare a client for a language: the options an app passes it, and the walk
 * that returns its file. Returns the function an app names under `clients`.
 *
 * @example
 * export const dartClient = defineClient({
 *     target: 'dart',
 *     options: z.object({
 *         library: z.string().default('api'),
 *     }),
 *     generate: ({ options }) => {
 *         const writer = new DartWriter(options.library);
 *
 *         return {
 *             processModel: (model) => writer.model(model),
 *             processRoute: (context) => writer.method(context),
 *             finalize: () => writer.render(),
 *         };
 *     },
 * });
 */
export const defineClient =
    <Schema extends z.ZodType | undefined = undefined>(
        definition: ClientDefinition<Schema>
    ): ((options: OptionsInput<Schema> & GeneratedFileOptions) => GeneratedFile) =>
    (input) => {
        const { output, groups, ...rest } = input as GeneratedFileOptions & Record<string, unknown>;
        const name = `Client '${definition.target}'`;
        assertGroupsOption(groups, name);
        const options = parseOptions<Schema>(definition.options, rest, name);
        return {
            target: definition.target,
            output,
            render: (api) =>
                walkApi(
                    api,
                    definition.generate({
                        options,
                        api,
                        groups,
                    }),
                    {
                        skipHidden: true,
                        groups,
                    }
                ),
        };
    };

/**
 * What {@link defineGenerator} takes.
 */
export interface GeneratorDefinition<Schema extends z.ZodType | undefined> {
    /**
     * A Zod schema for what the plugin passes in, beside `output`.
     */
    options?: Schema;
    /**
     * Returns the walk. It sees every served route, hidden ones included, and
     * decides what to leave out.
     */
    generate: (context: GenerateContext<OptionsOutput<Schema>>) => GeneratorWalk;
}

/**
 * Declare a generator for a file that isn't a client, like a document or a
 * manifest. A plugin installs it by returning it from `setup`.
 *
 * @example
 * export const gatewayManifest = defineGenerator({
 *     generate: () => {
 *         const entries: string[] = [];
 *
 *         return {
 *             processRoute: ({ route }) => entries.push(`${route.method} ${route.path}`),
 *             finalize: () => entries.join('\n'),
 *         };
 *     },
 * });
 */
export const defineGenerator =
    <Schema extends z.ZodType | undefined = undefined>(
        definition: GeneratorDefinition<Schema>
    ): ((options: OptionsInput<Schema> & GeneratedFileOptions) => GeneratedFile) =>
    (input) => {
        const { output, groups, ...rest } = input as GeneratedFileOptions & Record<string, unknown>;
        const name = `The generator for '${output}'`;
        assertGroupsOption(groups, name);
        const options = parseOptions<Schema>(definition.options, rest, name);
        return {
            output,
            render: (api) =>
                walkApi(
                    api,
                    definition.generate({
                        options,
                        api,
                        groups,
                    }),
                    {
                        groups,
                    }
                ),
        };
    };
