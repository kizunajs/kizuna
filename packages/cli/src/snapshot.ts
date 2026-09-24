import { basename, dirname, join } from 'node:path';
import { stringify } from 'yaml';
import type { ApiDefinition, ClientTarget, RouteDefinition } from 'kizunajs';
import {
    createGenerator,
    flattenJobs,
    readDef,
    readObjectShape,
    resolveResponseBody,
    toToolName,
    unwrapOptionalWrappers,
} from 'kizunajs/generator';
import { flattenRoutes } from 'kizunajs/adapter';
import type { z } from 'zod';

/**
 * A schema reduced to what a comparison needs: its kind, its fields, and the
 * values it accepts when it is closed.
 */
export type SchemaNode =
    | { kind: 'object'; fields: Record<string, { optional: boolean; schema: SchemaNode }>; refinements?: number }
    | { kind: 'array'; element: SchemaNode; refinements?: number }
    | { kind: 'enum'; values: string[]; refinements?: number }
    | { kind: string; refinements?: number };

export interface RouteSnapshot {
    method: string;
    path: string;
    statuses: number[];
    deprecated: boolean;
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
}

export interface RouteSnapshot {
    method: string;
    path: string;
    statuses: number[];
    deprecated: boolean;
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
    const { inner } = unwrapOptionalWrappers(schema);
    const def = readDef(inner);
    const refinements = refinementCount(inner);
    const carry = refinements === undefined ? {} : { refinements };

    const shape = readObjectShape(inner);
    if (shape) {
        const fields: Record<string, { optional: boolean; schema: SchemaNode }> = {};
        for (const [key, field] of Object.entries(shape)) {
            fields[key] = { optional: unwrapOptionalWrappers(field).optional, schema: toSchemaNode(field) };
        }
        return { kind: 'object', fields, ...carry };
    }

    if (def.type === 'array' && def.element) return { kind: 'array', element: toSchemaNode(def.element), ...carry };
    if (def.type === 'enum') {
        return {
            kind: 'enum',
            values: Object.values(def.entries ?? {})
                .map(String)
                .sort(),
            ...carry,
        };
    }
    if (def.type === 'literal') return { kind: 'enum', values: (def.values ?? []).map(String).sort(), ...carry };

    return { kind: def.type ?? 'unknown', ...carry };
};

const sunsetOf = (route: RouteDefinition): string | undefined => {
    const declared = route.sunset;
    if (declared === undefined) return undefined;
    return typeof declared === 'string' ? declared : declared.date;
};

const routeSnapshots = createGenerator<Record<string, never>, Record<string, RouteSnapshot>>(() => {
    const routes: Record<string, RouteSnapshot> = {};
    return {
        processRoute({ routeKey, route, deprecated }) {
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
                ...(sunset === undefined ? {} : { sunset }),
                ...(route.body ? { body: toSchemaNode(route.body) } : {}),
                ...(route.query ? { query: toSchemaNode(route.query) } : {}),
                ...(route.headers ? { headers: toSchemaNode(route.headers) } : {}),
                responses,
            };
        },
        finalize: () => routes,
    };
});

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

    return {
        routes: routeSnapshots(api, {}),
        jobs,
        tools,
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
export const snapshotTarget = (configPath: string): ClientTarget => ({
    kind: 'snapshot',
    output: snapshotPathFor(configPath),
    generate: renderSnapshot,
});
