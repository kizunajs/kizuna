import type { Contract, RouteDefinition } from '@ts-kizuna/core';
import { createGenerator, flattenJobs, toToolName } from '@ts-kizuna/core/generator';
import { flattenTools } from '@ts-kizuna/core/adapter';
import { resolveResponseBody } from '@ts-kizuna/core/generator';
import { diffSchemas, type Direction } from './diff-schemas.js';
import type { z } from 'zod';

/**
 * How much a change asks of the people already calling an API.
 */
export type ChangeLevel = 'breaking' | 'changed' | 'added';

export interface Change {
    level: ChangeLevel;
    /**
     * `users.getUser`, or the job or tool key the change is about.
     */
    key: string;
    summary: string;
    /**
     * What it costs whoever is already calling it.
     */
    detail?: string;
}

interface RouteFacts {
    method: string;
    path: string;
    statuses: number[];
    deprecated: boolean;
    sunset?: string;
    body?: z.core.$ZodType;
    query?: z.core.$ZodType;
    headers?: z.core.$ZodType;
    responses: Map<number, z.core.$ZodType | undefined>;
}

const routeFacts = createGenerator<Record<string, never>, Map<string, RouteFacts>>(() => {
    const facts = new Map<string, RouteFacts>();
    return {
        processRoute({ routeKey, route, deprecated }) {
            facts.set(routeKey, {
                method: route.method,
                path: route.path,
                statuses: Object.keys(route.responses).map(Number).sort(),
                deprecated,
                ...(sunsetOf(route) === undefined ? {} : { sunset: sunsetOf(route) }),
                ...(route.body ? { body: route.body } : {}),
                ...(route.query ? { query: route.query } : {}),
                ...(route.headers ? { headers: route.headers } : {}),
                responses: new Map(
                    Object.entries(route.responses).map(([status, response]) => [Number(status), resolveResponseBody(response)])
                ),
            });
        },
        finalize: () => facts,
    };
});

const sunsetOf = (route: RouteDefinition): string | undefined => {
    const declared = route.sunset;
    if (declared === undefined) return undefined;
    return typeof declared === 'string' ? declared : declared.date;
};

const jobKeys = (contract: Contract): Set<string> => {
    const jobs = (contract as { jobs?: unknown }).jobs;
    if (!jobs) return new Set();
    return new Set(flattenJobs(jobs as never).map((job) => job.jobKey));
};

const toolNames = (contract: Contract): Map<string, string> => {
    const tools = (contract as { tools?: unknown }).tools;
    if (!tools) return new Map();
    return new Map(flattenTools(tools as never).map(({ toolKey }) => [toolKey, toToolName(toolKey)]));
};

/**
 * What changed between two contracts, worst first.
 *
 * Compares the declarations rather than an OpenAPI document, so it sees route
 * keys, MCP tool names and job keys, none of which a document carries.
 */
export const diffContracts = (before: Contract, after: Contract): Change[] => {
    const changes: Change[] = [];

    const beforeRoutes = routeFacts(before, {});
    const afterRoutes = routeFacts(after, {});

    const removed = [...beforeRoutes.keys()].filter((key) => !afterRoutes.has(key));
    const added = [...afterRoutes.keys()].filter((key) => !beforeRoutes.has(key));

    // A route that left and one that arrived on the same method and path is a
    // rename, which leaves the HTTP surface alone and breaks every client.
    const renames = new Map<string, string>();
    for (const goneKey of removed) {
        const gone = beforeRoutes.get(goneKey);
        const match = added.find((key) => {
            const arrived = afterRoutes.get(key);
            return arrived?.method === gone?.method && arrived?.path === gone?.path && !renames.has(key);
        });
        if (match) renames.set(match, goneKey);
    }

    for (const [toKey, fromKey] of renames) {
        changes.push({
            level: 'breaking',
            key: fromKey,
            summary: `${fromKey} renamed to ${toKey}`,
            detail: 'client method and generated client names change, HTTP surface unaffected',
        });
    }

    for (const key of removed) {
        if ([...renames.values()].includes(key)) continue;
        const gone = beforeRoutes.get(key);
        changes.push({
            level: 'breaking',
            key,
            summary: `${key} is gone`,
            detail: `${gone?.method} ${gone?.path} no longer exists`,
        });
    }

    for (const key of added) {
        if (renames.has(key)) continue;
        const arrived = afterRoutes.get(key);
        changes.push({
            level: 'added',
            key,
            summary: `${key} added`,
            detail: `${arrived?.method} ${arrived?.path}`,
        });
    }

    for (const [key, gone] of beforeRoutes) {
        const arrived = afterRoutes.get(key);
        if (!arrived) continue;

        if (gone.method !== arrived.method) {
            changes.push({
                level: 'breaking',
                key,
                summary: `${key} answers ${arrived.method} instead of ${gone.method}`,
            });
        }

        if (gone.path !== arrived.path) {
            changes.push({
                level: 'breaking',
                key,
                summary: `${key} moved from ${gone.path} to ${arrived.path}`,
            });
        }

        const droppedStatuses = gone.statuses.filter((status) => !arrived.statuses.includes(status));
        if (droppedStatuses.length > 0) {
            changes.push({
                level: 'breaking',
                key,
                summary: `${key} no longer answers ${droppedStatuses.join(', ')}`,
                detail: 'a caller handling that status will not see it again',
            });
        }

        const newStatuses = arrived.statuses.filter((status) => !gone.statuses.includes(status));
        if (newStatuses.length > 0) {
            changes.push({
                level: 'changed',
                key,
                summary: `${key} can now answer ${newStatuses.join(', ')}`,
            });
        }

        const inputs: Array<[Direction, string, z.core.$ZodType | undefined, z.core.$ZodType | undefined]> = [
            ['request', 'body', gone.body, arrived.body],
            ['request', 'query', gone.query, arrived.query],
            ['request', 'headers', gone.headers, arrived.headers],
        ];

        for (const [direction, label, was, now] of inputs) {
            for (const change of diffSchemas(was, now, direction, label)) {
                changes.push({
                    level: change.breaking ? 'breaking' : 'changed',
                    key,
                    summary: `${key} ${change.summary}`,
                });
            }
        }

        for (const [status, was] of gone.responses) {
            const now = arrived.responses.get(status);
            if (!arrived.responses.has(status)) continue;
            for (const change of diffSchemas(was, now, 'response', `${status}`)) {
                changes.push({
                    level: change.breaking ? 'breaking' : 'changed',
                    key,
                    summary: `${key} ${change.summary}`,
                });
            }
        }

        if (!gone.deprecated && arrived.deprecated) {
            changes.push({ level: 'changed', key, summary: `${key} is now deprecated` });
        }

        if (gone.sunset !== arrived.sunset && arrived.sunset !== undefined) {
            changes.push({ level: 'changed', key, summary: `${key} sunsets on ${arrived.sunset}` });
        }
    }

    for (const key of jobKeys(before)) {
        if (jobKeys(after).has(key)) continue;
        changes.push({
            level: 'breaking',
            key,
            summary: `the job ${key} is gone`,
            detail: 'whatever calls POST /jobs/run with that key stops working',
        });
    }

    const beforeTools = toolNames(before);
    const afterTools = toolNames(after);

    for (const [key, name] of beforeTools) {
        const arrived = afterTools.get(key);
        if (arrived === undefined) {
            changes.push({
                level: 'breaking',
                key,
                summary: `the tool ${name} is gone`,
                detail: 'a prompt or workflow naming that tool stops working',
            });
            continue;
        }
        if (arrived !== name) {
            changes.push({
                level: 'breaking',
                key,
                summary: `the tool ${name} is now ${arrived}`,
                detail: 'a prompt or workflow naming the old one stops working',
            });
        }
    }

    const order: Record<ChangeLevel, number> = { breaking: 0, changed: 1, added: 2 };
    return changes.sort((left, right) => order[left.level] - order[right.level] || left.key.localeCompare(right.key));
};

/**
 * One block per change, the shape `kizuna diff` prints.
 */
export const formatChange = (change: Change): string => {
    const label = change.level.toUpperCase().padEnd(8);
    const detail = change.detail === undefined ? '' : `\n         ${change.detail}`;
    return `${label} ${change.summary}${detail}`;
};

/**
 * Whether a diff should fail a pipeline.
 */
export const hasBreakingChange = (changes: Change[]): boolean => changes.some((change) => change.level === 'breaking');
