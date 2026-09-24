import type { ApiDefinition } from 'kizunajs';
import { diffSchemas, type Direction } from './diff-schemas.js';
import { toSnapshot, type ApiSnapshot, type SchemaNode } from './snapshot.js';

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

export interface DiffOptions {
    /**
     * Report a job key that is gone. A job answers `POST /jobs/run` by its
     * dotted key, so this matters once something outside your own code
     * dispatches them.
     *
     * @default false
     */
    jobs?: boolean;
    /**
     * Report an MCP tool a model can no longer call.
     *
     * @default false
     */
    tools?: boolean;
    /**
     * Treat a renamed dotted key, such as `users.getUser` becoming
     * `users.fetchUser`, as breaking. The key names the method on a generated
     * client, so a rename breaks anyone building an SDK on one and leaves the
     * HTTP surface untouched.
     *
     * @default false
     */
    dottedKeys?: boolean;
}

export const diffSnapshots = (before: ApiSnapshot, after: ApiSnapshot, options: DiffOptions = {}): Change[] => {
    const changes: Change[] = [];

    const beforeRoutes = new Map(Object.entries(before.routes));
    const afterRoutes = new Map(Object.entries(after.routes));

    const removed = [...beforeRoutes.keys()].filter((key) => !afterRoutes.has(key));
    const added = [...afterRoutes.keys()].filter((key) => !beforeRoutes.has(key));

    // A route that left and one that arrived on the same method and path is a
    // rename, which leaves the HTTP surface alone and breaks every client.
    const renames = new Map<string, string>();
    /**
     * A route as it is called over HTTP.
     */
    const httpLabel = (route: { method: string; path: string } | undefined, fallback: string): string =>
        route ? `${route.method} ${route.path}` : fallback;

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
            level: options.dottedKeys ? 'breaking' : 'changed',
            key: fromKey,
            summary: `${fromKey} renamed to ${toKey}`,
            detail: 'the generated client method changes name, the HTTP surface does not',
        });
    }

    for (const key of removed) {
        if ([...renames.values()].includes(key)) continue;
        const gone = beforeRoutes.get(key);
        changes.push({
            level: 'breaking',
            key,
            summary: `${httpLabel(gone, key)} is gone`,
            detail: `${gone?.method} ${gone?.path} no longer exists`,
        });
    }

    for (const key of added) {
        if (renames.has(key)) continue;
        const arrived = afterRoutes.get(key);
        changes.push({
            level: 'added',
            key,
            summary: `${httpLabel(arrived, key)} added`,
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
                summary: `${gone.path} answers ${arrived.method} instead of ${gone.method}`,
            });
        }

        if (gone.path !== arrived.path) {
            changes.push({
                level: 'breaking',
                key,
                summary: `${gone.method} ${gone.path} moved to ${arrived.path}`,
            });
        }

        const droppedStatuses = gone.statuses.filter((status) => !arrived.statuses.includes(status));
        if (droppedStatuses.length > 0) {
            changes.push({
                level: 'breaking',
                key,
                summary: `${httpLabel(gone, key)} no longer answers ${droppedStatuses.join(', ')}`,
                detail: 'a caller handling that status will not see it again',
            });
        }

        const newStatuses = arrived.statuses.filter((status) => !gone.statuses.includes(status));
        if (newStatuses.length > 0) {
            changes.push({
                level: 'changed',
                key,
                summary: `${httpLabel(arrived, key)} can now answer ${newStatuses.join(', ')}`,
            });
        }

        const inputs: Array<[Direction, string, SchemaNode | undefined, SchemaNode | undefined]> = [
            ['request', 'body', gone.body, arrived.body],
            ['request', 'query', gone.query, arrived.query],
            ['request', 'headers', gone.headers, arrived.headers],
        ];

        for (const [direction, label, was, now] of inputs) {
            for (const change of diffSchemas(was, now, direction, label)) {
                changes.push({
                    level: change.breaking ? 'breaking' : 'changed',
                    key,
                    summary: `${httpLabel(arrived, key)} ${change.summary}`,
                });
            }
        }

        for (const [status, was] of Object.entries(gone.responses)) {
            if (!(status in arrived.responses)) continue;
            const now = arrived.responses[status];
            for (const change of diffSchemas(was ?? undefined, now ?? undefined, 'response', status)) {
                changes.push({
                    level: change.breaking ? 'breaking' : 'changed',
                    key,
                    summary: `${httpLabel(arrived, key)} ${change.summary}`,
                });
            }
        }

        for (const status of Object.keys(gone.responses)) {
            if (!(status in arrived.responses)) continue;
            const was = gone.responseHeaders?.[status];
            const now = arrived.responseHeaders?.[status];
            for (const change of diffSchemas(was, now, 'response', `${status} headers`)) {
                changes.push({
                    level: change.breaking ? 'breaking' : 'changed',
                    key,
                    summary: `${httpLabel(arrived, key)} ${change.summary}`,
                });
            }
        }

        if (!gone.deprecated && arrived.deprecated) {
            changes.push({ level: 'changed', key, summary: `${httpLabel(arrived, key)} is now deprecated` });
        }

        if (gone.sunset !== arrived.sunset && arrived.sunset !== undefined) {
            changes.push({ level: 'changed', key, summary: `${httpLabel(arrived, key)} sunsets on ${arrived.sunset}` });
        }
    }

    for (const key of options.jobs ? before.jobs : []) {
        if (after.jobs.includes(key)) continue;
        changes.push({
            level: 'breaking',
            key,
            summary: `the job ${key} is gone`,
            detail: 'whatever calls POST /jobs/run with that key stops working',
        });
    }

    for (const [key, name] of options.tools ? Object.entries(before.tools) : []) {
        const arrived = after.tools[key];
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
 * What changed between two apis, for a caller holding both in memory.
 *
 * `kizuna diff` reads snapshots instead, so it never has to load the other
 * side's code.
 */
export const diffApis = (before: ApiDefinition, after: ApiDefinition, options: DiffOptions = {}): Change[] =>
    diffSnapshots(toSnapshot(before), toSnapshot(after), options);

/**
 * One block per change, ready to print: the level, the summary, and the
 * detail indented beneath it.
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
