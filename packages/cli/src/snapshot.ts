import { basename, dirname, join } from 'node:path';
import { stringify } from 'yaml';
import type { ApiDefinition, GeneratedFile, RouteDefinition } from 'kizunajs';
import {
    walkApi,
    flattenJobs,
    readDef,
    readObjectShape,
    resolveResponseBody,
    toToolName,
    unwrapOptionalWrappers,
} from 'kizunajs/generator';
import { contentOf, flattenRoutes } from 'kizunajs/adapter';
import type { z } from 'zod';

/**
 * A schema reduced to what a comparison needs: its kind, whether it accepts
 * `null`, its fields, and the values it accepts when it is closed.
 */
export type SchemaNode =
    | { kind: 'object'; nullable?: true; fields: Record<string, { optional: boolean; schema: SchemaNode }>; refinements?: number }
    | { kind: 'array'; nullable?: true; element: SchemaNode; refinements?: number }
    | { kind: 'enum'; nullable?: true; values: string[]; refinements?: number }
    | { kind: 'union'; nullable?: true; discriminator: string; options: Record<string, SchemaNode>; refinements?: number }
    | { kind: string; nullable?: true; refinements?: number };

export interface RouteSnapshot {
    method: string;
    path: string;
    statuses: number[];
    deprecated: boolean;
    /**
     * `true` when the route is `hidden`, so in no generated client.
     */
    hidden?: true;
    sunset?: string;
    body?: SchemaNode;
    query?: SchemaNode;
    headers?: SchemaNode;
    /**
     * Keyed by status, `null` when the status answers with no body.
     */
    responses: Record<string, SchemaNode | null>;
}

export interface ApiSnapshot {
    routes: Record<string, RouteSnapshot>;
    jobs: string[];
    /**
     * MCP tool name, keyed by the route key that publishes it.
     */
    tools: Record<string, string>;
    /**
     * Every page, global and collection `content` provides, keyed by its
     * ref, for a config that has one.
     */
    content?: Record<string, ContentSnapshot>;
}

/**
 * One kind of document editors change, as stored content is read against
 * it.
 */
export interface ContentSnapshot {
    kind: string;
    /**
     * The highest `migrate` step it declares.
     */
    migration: number;
    schema: SchemaNode;
}

export interface SnapshotOptions {
    /**
     * Track job keys. A job answers `POST /jobs/run` by its dotted key, so
     * renaming one only reaches anything outside your own code when something
     * else dispatches them.
     *
     * @default false
     */
    jobs?: boolean;
    /**
     * Track MCP tool names, so a model losing a tool it could call is reported.
     *
     * @default false
     */
    tools?: boolean;
}

/**
 * How many `.refine()` or `.superRefine()` calls a schema carries. The
 * predicate itself cannot be compared across two files, but its arrival or
 * departure can.
 */
const refinementCount = (schema: z.core.$ZodType): number | undefined => {
    const checks = (readDef(schema) as { checks?: readonly { _zod?: { def?: { check?: string } } }[] }).checks;
    if (!checks) return undefined;
    const custom = checks.filter((check) => check._zod?.def?.check === 'custom').length;
    return custom === 0 ? undefined : custom;
};

/**
 * A Zod schema reduced to the shape a comparison reads.
 */
export const toSchemaNode = (schema: z.core.$ZodType): SchemaNode => {
    const { inner, nullable } = unwrapOptionalWrappers(schema);
    const def = readDef(inner);

    // `z.union([UserSchema, z.null()])` says what `.nullable()` says.
    const options = def.type === 'union' ? (def.options ?? []) : [];
    const nonNull = options.filter((option) => readDef(option).type !== 'null');
    if (nonNull.length === 1 && options.length > 1) {
        return {
            ...toSchemaNode(nonNull[0]!),
            nullable: true,
        };
    }

    const nullability: { nullable?: true } = nullable ? { nullable: true } : {};
    const refinements = refinementCount(inner);
    const carry = refinements === undefined ? {} : { refinements };

    // A discriminated union records each option under its tag, so a removed or changed one shows.
    if (def.type === 'union' && def.discriminator !== undefined) {
        const discriminator = def.discriminator;
        const tagged: Record<string, SchemaNode> = {};
        for (const option of def.options ?? []) {
            const literal = readObjectShape(option)?.[discriminator];
            for (const value of literal === undefined ? [] : (readDef(literal).values ?? [])) tagged[String(value)] = toSchemaNode(option);
        }
        return {
            kind: 'union',
            ...nullability,
            discriminator,
            options: tagged,
            ...carry,
        };
    }

    const shape = readObjectShape(inner);
    if (shape) {
        const fields: Record<string, { optional: boolean; schema: SchemaNode }> = {};
        for (const [key, field] of Object.entries(shape)) {
            fields[key] = { optional: unwrapOptionalWrappers(field).optional, schema: toSchemaNode(field) };
        }
        return { kind: 'object', ...nullability, fields, ...carry };
    }

    if (def.type === 'array' && def.element) return { kind: 'array', ...nullability, element: toSchemaNode(def.element), ...carry };
    if (def.type === 'enum') {
        return {
            kind: 'enum',
            ...nullability,
            values: Object.values(def.entries ?? {})
                .map(String)
                .sort(),
            ...carry,
        };
    }
    if (def.type === 'literal') return { kind: 'enum', ...nullability, values: (def.values ?? []).map(String).sort(), ...carry };

    return { kind: def.type ?? 'unknown', ...nullability, ...carry };
};

const sunsetOf = (route: RouteDefinition): string | undefined => {
    const declared = route.sunset;
    if (declared === undefined) return undefined;
    return typeof declared === 'string' ? declared : declared.date;
};

const routeSnapshots = (api: ApiDefinition): Record<string, RouteSnapshot> => {
    const routes: Record<string, RouteSnapshot> = {};
    return walkApi(api, {
        processRoute({ routeKey, route, deprecated, hidden }) {
            const sunset = sunsetOf(route);
            const responses: Record<string, SchemaNode | null> = {};
            for (const [status, response] of Object.entries(route.responses)) {
                const body = resolveResponseBody(response);
                responses[status] = body === undefined ? null : toSchemaNode(body);
            }

            routes[routeKey] = {
                method: route.method,
                path: route.path,
                statuses: Object.keys(route.responses)
                    .map(Number)
                    .sort((a, b) => a - b),
                deprecated,
                ...(hidden
                    ? {
                          hidden: true as const,
                      }
                    : {}),
                ...(sunset === undefined ? {} : { sunset }),
                ...(route.body ? { body: toSchemaNode(route.body) } : {}),
                ...(route.query ? { query: toSchemaNode(route.query) } : {}),
                ...(route.headers ? { headers: toSchemaNode(route.headers) } : {}),
                responses,
            };
        },
        finalize: () => routes,
    });
};

/**
 * Everything `kizuna diff` compares, as plain data.
 *
 * Writing this at each commit is what lets a comparison read the other side
 * out of git rather than checking it out and running it.
 */
export const toSnapshot = (api: ApiDefinition): ApiSnapshot => {
    const declared = (api as { jobs?: unknown }).jobs;

    const jobs = declared
        ? flattenJobs(declared as never)
              .map((job) => job.jobKey)
              .sort()
        : [];

    const tools = Object.fromEntries(
        flattenRoutes(api.routes)
            .filter(({ route }) => route.tool !== undefined && route.tool !== false)
            .map(({ routeKey }) => [routeKey, toToolName(routeKey)])
    );

    const documents = contentOf(api)?.provider.documents();

    return {
        routes: routeSnapshots(api),
        jobs,
        tools,
        ...(documents === undefined
            ? {}
            : {
                  content: Object.fromEntries(
                      [...documents]
                          .sort((left, right) => left.ref.localeCompare(right.ref))
                          .map((document) => [
                              document.ref,
                              {
                                  kind: document.kind,
                                  migration: document.migration,
                                  schema: toSchemaNode(document.schema),
                              },
                          ])
                  ),
              }),
    };
};

/**
 * YAML rather than JSON, so the file a reviewer opens in a pull request reads
 * as the API rather than as punctuation.
 */
export const renderSnapshot = (api: ApiDefinition): string => stringify(toSnapshot(api), { lineWidth: 0 });

/**
 * Where a config's snapshot lives. `.kizuna/` sits beside the config, so CI
 * always knows where to look without being told, and a repository holding
 * several configs keeps one snapshot per config.
 */
export const snapshotPathFor = (configPath: string): string => {
    const declared = basename(configPath)
        .replace(/\.config\.[cm]?[jt]s$/, '')
        .replace(/^kizuna\./, '');

    const name = declared === '' || declared === 'kizuna' ? 'snapshot' : `${declared}.snapshot`;
    return join(dirname(configPath), '.kizuna', `${name}.yaml`);
};

/**
 * The snapshot as a client target, so `kizuna generate` writes it and
 * `kizuna generate --check` refuses to let it go stale.
 */
export const snapshotTarget = (configPath: string): GeneratedFile => ({
    output: snapshotPathFor(configPath),
    render: renderSnapshot,
});
